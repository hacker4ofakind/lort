package changelog_test

import (
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/changelog"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

var nine = time.Date(2026, 10, 21, 9, 0, 0, 0, time.UTC)

// scheduled saves a scheduled post due at `at`, bypassing Schedule's "in the future" check.
func (f *fixture) scheduled(t testing.TB, title string, at time.Time, data map[string]any) string {
	t.Helper()
	d := map[string]any{"title": title, "state": "scheduled", "publishAt": at}
	for k, v := range data {
		d[k] = v
	}
	return f.post(t, d).Id
}

func (f *fixture) state(t testing.TB, id string) (string, string) {
	t.Helper()
	r, err := f.app.FindRecordById("changelogs", id)
	if err != nil {
		t.Fatal(err)
	}
	return r.GetString("state"), r.GetString("publishError")
}

func TestPublishDuePublishesDuePostsOldestFirst(t *testing.T) {
	f := newFixture(t)
	scheduler := f.teamProfile(t)
	req := testutil.Request(t, f.app, f.features, f.mara, "Planned one", "planned", 1)
	early := f.scheduled(t, "Early", nine.Add(-2*time.Minute), map[string]any{"scheduledBy": scheduler.Id, "requests": []string{req.Id}, "completeAttached": true})
	untitled := f.scheduled(t, "", nine.Add(-time.Minute), nil)
	onTime := f.scheduled(t, "On time", nine, nil)
	future := f.scheduled(t, "Future", nine.Add(time.Minute), nil)

	s := f.svc(nine)
	var order []string
	s.SetBetween(func(id string) { order = append(order, id) })
	if err := s.PublishDue(); err != nil {
		t.Fatal(err)
	}
	if len(order) != 3 || order[0] != early || order[1] != untitled || order[2] != onTime {
		t.Fatalf("order = %v", order)
	}
	for id, want := range map[string]string{early: "published", onTime: "published", future: "scheduled", untitled: "draft"} {
		if st, _ := f.state(t, id); st != want {
			t.Errorf("%s state = %s, want %s", id, st, want)
		}
	}
	if _, msg := f.state(t, untitled); msg != "Give the post a title before it goes out." {
		t.Errorf("publishError = %q", msg)
	}
	r, _ := f.app.FindRecordById("requests", req.Id)
	rows, _ := f.app.FindRecordsByFilter("activity", "request = {:r}", "", 0, 0, map[string]any{"r": req.Id})
	if r.GetString("status") != "completed" || len(rows) != 1 || rows[0].GetString("actor") != scheduler.Id {
		t.Errorf("request status = %s, activity = %d", r.GetString("status"), len(rows))
	}
	failed, err := s.Failed()
	if err != nil || len(failed) != 1 || failed[0].ID != untitled || !failed[0].PublishAt.Equal(nine.Add(-time.Minute)) {
		t.Fatalf("Failed = %+v, %v", failed, err)
	}
}

func TestPublishDueSkipsPostsChangedMeanwhile(t *testing.T) {
	f := newFixture(t)
	unscheduled := f.scheduled(t, "Unscheduled", nine.Add(-time.Minute), nil)
	clicked := f.scheduled(t, "Clicked", nine.Add(-time.Minute), nil)
	s := f.svc(nine)
	s.SetBetween(func(id string) {
		switch id {
		case unscheduled:
			if _, err := s.Unschedule(id); err != nil {
				t.Fatal(err)
			}
		case clicked:
			if _, err := s.Publish(id, nil); err != nil {
				t.Fatal(err)
			}
		}
	})
	if err := s.PublishDue(); err != nil {
		t.Fatal(err)
	}
	if st, msg := f.state(t, unscheduled); st != "draft" || msg != "" {
		t.Errorf("unscheduled: %s %q", st, msg)
	}
	if st, msg := f.state(t, clicked); st != "published" || msg != "" {
		t.Errorf("clicked: %s %q", st, msg)
	}
}

func TestAFailedScheduledPublishLeavesNoTrace(t *testing.T) {
	f := newFixture(t)
	id := f.scheduled(t, "Dark mode", nine.Add(-time.Minute), map[string]any{"images": []any{mustFile(t, "a.png")}})
	// A hook refuses the publish after publish() has stamped the date and pruned the image.
	long := strings.Repeat("é", 400)
	f.app.OnRecordUpdate("changelogs").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("state") == "published" {
			return apis.NewBadRequestError(long, nil)
		}
		return e.Next()
	})
	if err := f.svc(nine).PublishDue(); err != nil {
		t.Fatal(err)
	}
	r, err := f.app.FindRecordById("changelogs", id)
	if err != nil {
		t.Fatal(err)
	}
	if r.GetString("state") != "draft" || !r.GetDateTime("publishedAt").IsZero() || len(r.GetStringSlice("images")) != 1 {
		t.Fatalf("after failure: state=%s publishedAt=%v images=%v", r.GetString("state"), r.GetDateTime("publishedAt"), r.GetStringSlice("images"))
	}
	if msg := r.GetString("publishError"); utf8.RuneCountInString(msg) != 300 || !utf8.ValidString(msg) {
		t.Fatalf("publishError has %d runes", utf8.RuneCountInString(msg))
	}
	if !r.GetDateTime("publishAt").Time().Equal(nine.Add(-time.Minute)) {
		t.Fatalf("publishAt = %v", r.GetDateTime("publishAt"))
	}
}

func TestPassingErrorsRetryThenGiveUp(t *testing.T) {
	f := newFixture(t)
	id := f.scheduled(t, "Dark mode", nine, nil)
	busy := errors.New("database is locked (5) (SQLITE_BUSY)")
	s := f.svc(nine.Add(time.Minute))
	s.SetFailSave(func(string) error { return busy })
	if err := s.PublishDue(); err != nil {
		t.Fatal(err)
	}
	if st, msg := f.state(t, id); st != "scheduled" || msg != "" {
		t.Fatalf("after a passing error: %s %q", st, msg)
	}
	s.SetFailSave(nil)
	if err := s.PublishDue(); err != nil {
		t.Fatal(err)
	}
	if st, _ := f.state(t, id); st != "published" {
		t.Fatalf("after the retry: %s", st)
	}

	stuck := f.scheduled(t, "Stuck", nine, nil)
	s = f.svc(nine.Add(11 * time.Minute))
	s.SetFailSave(func(string) error { return busy })
	if err := s.PublishDue(); err != nil {
		t.Fatal(err)
	}
	st, msg := f.state(t, stuck)
	if st != "draft" || msg != "Something went wrong while publishing it. Publish it now or pick a new time." {
		t.Fatalf("after 11 minutes: %s %q", st, msg)
	}
}

func TestPostsMoreThanThreeDaysLateAreNotPublished(t *testing.T) {
	f := newFixture(t)
	req := testutil.Request(t, f.app, f.features, f.mara, "Planned one", "planned", 1)
	now := nine
	recent := f.scheduled(t, "Recent", now.Add(-(71*time.Hour + 59*time.Minute)), nil)
	old := f.scheduled(t, "Old", now.Add(-(72*time.Hour + time.Minute)), map[string]any{"requests": []string{req.Id}, "completeAttached": true})
	if err := f.svc(now).PublishDue(); err != nil {
		t.Fatal(err)
	}
	if st, _ := f.state(t, recent); st != "published" {
		t.Errorf("recent: %s", st)
	}
	st, msg := f.state(t, old)
	if st != "draft" || msg != "It was due more than 3 days ago, so it wasn't published. Publish it now or pick a new time." {
		t.Errorf("old: %s %q", st, msg)
	}
	if r, _ := f.app.FindRecordById("requests", req.Id); r.GetString("status") != "planned" {
		t.Errorf("request status = %s", r.GetString("status"))
	}
}

func TestCapRunes(t *testing.T) {
	got := changelog.CapRunes(strings.Repeat("é", 400), 300)
	if utf8.RuneCountInString(got) != 300 || !utf8.ValidString(got) {
		t.Fatalf("cap = %d runes", utf8.RuneCountInString(got))
	}
}
