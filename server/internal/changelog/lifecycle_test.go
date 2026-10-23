package changelog_test

import (
	"errors"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/changelog"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func (f *fixture) svc(now time.Time) *changelog.Service {
	s := changelog.New(f.app)
	s.Now = func() time.Time { return now }
	return s
}

func (f *fixture) teamProfile(t testing.TB) *core.Record {
	t.Helper()
	u := testutil.User(t, f.app, "luk@example.com")
	u.Set("isAdmin", true)
	if err := f.app.Save(u); err != nil {
		t.Fatal(err)
	}
	return u
}

func TestPublishSetsStateAndKeepsFirstDate(t *testing.T) {
	f := newFixture(t)
	first := time.Date(2026, 10, 9, 9, 0, 0, 0, time.UTC)
	p := f.post(t, map[string]any{"title": "Dark mode", "publishError": "old"})
	res, err := f.svc(first).Publish(p.Id, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Post.State != "published" || !res.Post.PublishedAt.Equal(first) || res.Post.PublishError != "" {
		t.Fatalf("published = %+v", res.Post)
	}
	if _, err := f.svc(first).Publish(p.Id, nil); !errors.Is(err, changelog.ErrLive) {
		t.Fatalf("second publish err = %v", err)
	}
	if _, err := f.svc(first).Unpublish(p.Id); err != nil {
		t.Fatal(err)
	}
	res, err = f.svc(first.Add(48*time.Hour)).Publish(p.Id, nil)
	if err != nil || !res.Post.PublishedAt.Equal(first) {
		t.Fatalf("republish = %+v, %v", res.Post.PublishedAt, err)
	}
}

func TestPublishRefusesAPostWithoutTitle(t *testing.T) {
	f := newFixture(t)
	p := f.post(t, map[string]any{"title": "  "})
	if _, err := f.svc(time.Now()).Publish(p.Id, nil); !errors.Is(err, changelog.ErrNoTitle) {
		t.Fatalf("err = %v", err)
	}
	if got := f.reload(t, p).GetString("state"); got != "draft" {
		t.Fatalf("state = %s", got)
	}
	if _, err := f.svc(time.Now()).Publish("nope", nil); !errors.Is(err, changelog.ErrNotFound) {
		t.Fatalf("missing err = %v", err)
	}
}

func TestPublishCompletesAttachedRequests(t *testing.T) {
	f := newFixture(t)
	admin := f.teamProfile(t)
	planned := testutil.Request(t, f.app, f.features, f.mara, "Planned one", "planned", 1)
	reviewing := testutil.Request(t, f.app, f.features, f.mara, "Reviewing one", "reviewing", 1)
	closed := testutil.Request(t, f.app, f.features, f.mara, "Closed one", "closed", 1)
	done := testutil.Request(t, f.app, f.features, f.mara, "Done one", "completed", 1)
	merged := testutil.Request(t, f.app, f.features, f.mara, "Merged one", "planned", 1)
	merged.Set("mergedInto", planned.Id)
	if err := f.app.Save(merged); err != nil {
		t.Fatal(err)
	}
	ids := []string{planned.Id, reviewing.Id, closed.Id, done.Id, merged.Id}
	p := f.post(t, map[string]any{"title": "Dark mode", "requests": ids, "completeAttached": true})
	res, err := f.svc(time.Now()).Publish(p.Id, admin)
	if err != nil || res.Completed != 2 {
		t.Fatalf("Publish = %+v, %v", res, err)
	}
	want := map[string]string{planned.Id: "completed", reviewing.Id: "completed", closed.Id: "closed", done.Id: "completed", merged.Id: "planned"}
	for id, st := range want {
		r, _ := f.app.FindRecordById("requests", id)
		if r.GetString("status") != st {
			t.Errorf("%s status = %s, want %s", r.GetString("title"), r.GetString("status"), st)
		}
	}
	for _, id := range []string{planned.Id, reviewing.Id} {
		rows, _ := f.app.FindAllRecords("activity", dbx.HashExp{"request": id, "kind": "status_changed"})
		if len(rows) != 1 || rows[0].GetString("actor") != admin.Id {
			t.Errorf("activity for %s = %d rows", id, len(rows))
		}
	}
}

func TestPublishWithoutTheBoxCompletesNothing(t *testing.T) {
	f := newFixture(t)
	planned := testutil.Request(t, f.app, f.features, f.mara, "Planned one", "planned", 1)
	p := f.post(t, map[string]any{"title": "Dark mode", "requests": []string{planned.Id}})
	res, err := f.svc(time.Now()).Publish(p.Id, nil)
	if err != nil || res.Completed != 0 {
		t.Fatalf("Publish = %+v, %v", res, err)
	}
	if r, _ := f.app.FindRecordById("requests", planned.Id); r.GetString("status") != "planned" {
		t.Fatal("request completed without the box")
	}
}

func TestAFailingCompletionRollsBackThePublish(t *testing.T) {
	f := newFixture(t)
	planned := testutil.Request(t, f.app, f.features, f.mara, "Planned one", "planned", 1)
	p := f.post(t, map[string]any{"title": "Dark mode", "requests": []string{planned.Id}, "completeAttached": true})
	f.app.OnRecordUpdate("requests").BindFunc(func(e *core.RecordEvent) error {
		return errors.New("disk full")
	})
	if _, err := f.svc(time.Now()).Publish(p.Id, nil); err == nil {
		t.Fatal("publish should fail")
	}
	r := f.reload(t, p)
	if r.GetString("state") != "draft" || !r.GetDateTime("publishedAt").IsZero() {
		t.Fatalf("after rollback state=%s publishedAt=%v", r.GetString("state"), r.GetDateTime("publishedAt"))
	}
}

func TestPublishDropsImagesTheBodyNoLongerUses(t *testing.T) {
	f := newFixture(t)
	p := f.post(t, map[string]any{"title": "Dark mode", "images": []any{mustFile(t, "kept.png"), mustFile(t, "gone.png"), mustFile(t, "kept.png2")}})
	names := f.reload(t, p).GetStringSlice("images")
	if len(names) != 3 {
		t.Fatalf("images = %v", names)
	}
	body := "Look: ![](/api/files/changelogs/" + p.Id + "/" + names[0] + "?thumb=1600x0)"
	if _, err := f.set(t, p, map[string]any{"body": body}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc(time.Now()).Publish(p.Id, nil); err != nil {
		t.Fatal(err)
	}
	if got := f.reload(t, p).GetStringSlice("images"); len(got) != 1 || got[0] != names[0] {
		t.Fatalf("images after publish = %v, want [%s]", got, names[0])
	}
}

func TestScheduleUnscheduleUnpublish(t *testing.T) {
	f := newFixture(t)
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	s := f.svc(now)
	admin := f.teamProfile(t)
	p := f.post(t, map[string]any{"title": "Dark mode", "publishError": "old"})

	if _, err := s.Schedule(p.Id, now.Add(-time.Minute), admin); !errors.Is(err, changelog.ErrPast) {
		t.Fatalf("past err = %v", err)
	}
	nonLatin := f.post(t, map[string]any{"title": "Тёмная тема"})
	if _, err := s.Schedule(nonLatin.Id, now.Add(time.Hour), admin); !errors.Is(err, changelog.ErrNoSlug) {
		t.Fatalf("no slug err = %v", err)
	}
	at := now.Add(21 * time.Hour)
	tp, err := s.Schedule(p.Id, at, admin)
	if err != nil || tp.State != "scheduled" || !tp.PublishAt.Equal(at) || tp.PublishError != "" {
		t.Fatalf("Schedule = %+v, %v", tp, err)
	}
	if got := f.reload(t, p).GetString("scheduledBy"); got != admin.Id {
		t.Fatalf("scheduledBy = %q", got)
	}
	later := at.Add(24 * time.Hour)
	if tp, err = s.Schedule(p.Id, later, admin); err != nil || !tp.PublishAt.Equal(later) {
		t.Fatalf("reschedule = %+v, %v", tp, err)
	}
	if tp, err = s.Unschedule(p.Id); err != nil || tp.State != "draft" || tp.PublishAt != nil {
		t.Fatalf("Unschedule = %+v, %v", tp, err)
	}
	if _, err := s.Unschedule(p.Id); !errors.Is(err, changelog.ErrNotScheduled) {
		t.Fatalf("unschedule a draft err = %v", err)
	}
	if _, err := s.Unpublish(p.Id); !errors.Is(err, changelog.ErrNotLive) {
		t.Fatalf("unpublish a draft err = %v", err)
	}
	if _, err := s.Publish(p.Id, admin); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Schedule(p.Id, later, admin); !errors.Is(err, changelog.ErrLive) {
		t.Fatalf("schedule a live post err = %v", err)
	}
	tp, err = s.Unpublish(p.Id)
	if err != nil || tp.State != "draft" || tp.PublishedAt == nil || tp.Slug != "dark-mode" {
		t.Fatalf("Unpublish = %+v, %v", tp, err)
	}
}
