package changelog_test

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/hook"
	"github.com/pocketbase/pocketbase/tools/router"

	"github.com/hacker4ofakind/lort/server/internal/changelog"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

type fixture struct {
	app      *tests.TestApp
	features *core.Record
	mara     *core.Record
	admin    *core.Record // the superuser
}

func newFixture(t testing.TB) *fixture {
	app := testutil.NewApp(t)
	changelog.Bind(app)
	f := &fixture{app: app}
	f.features = testutil.Board(t, app, "Features", true, false)
	f.mara = testutil.User(t, app, "mara@example.com")
	f.admin = testutil.Superuser(t, app, "admin@example.com")
	return f
}

// post saves a new post with data on top of a draft's defaults.
func (f *fixture) post(t testing.TB, data map[string]any) *core.Record {
	t.Helper()
	c, err := f.app.FindCollectionByNameOrId("changelogs")
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(c)
	r.Set("state", "draft")
	for k, v := range data {
		r.Set(k, v)
	}
	if err := f.app.Save(r); err != nil {
		t.Fatal(err)
	}
	return r
}

// reload reads a post fresh from the database.
func (f *fixture) reload(t testing.TB, r *core.Record) *core.Record {
	t.Helper()
	fresh, err := f.app.FindRecordById("changelogs", r.Id)
	if err != nil {
		t.Fatal(err)
	}
	return fresh
}

// set changes fields on a fresh copy of the post and saves it.
func (f *fixture) set(t testing.TB, r *core.Record, data map[string]any) (*core.Record, error) {
	t.Helper()
	fresh := f.reload(t, r)
	for k, v := range data {
		fresh.Set(k, v)
	}
	return fresh, f.app.Save(fresh)
}

func (f *fixture) publish(t testing.TB, r *core.Record) *core.Record {
	t.Helper()
	p, err := f.set(t, r, map[string]any{"state": "published", "publishedAt": time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func (f *fixture) scenario(t *testing.T, s tests.ApiScenario, after func(*testing.T)) {
	t.Helper()
	s.TestAppFactory = func(testing.TB) *tests.TestApp { return f.app }
	s.DisableTestAppCleanup = true
	if after != nil {
		s.AfterTestFunc = func(tb testing.TB, _ *tests.TestApp, _ *http.Response) { after(tb.(*testing.T)) }
	}
	s.Test(t)
}

func (f *fixture) su(t testing.TB) map[string]string {
	return map[string]string{"Authorization": testutil.Token(t, f.admin)}
}

func apiMessage(err error) string {
	var api *router.ApiError
	if errors.As(err, &api) {
		return api.Message
	}
	if err == nil {
		return ""
	}
	return err.Error()
}

func TestSlugFollowsTitleUntilSetByHand(t *testing.T) {
	f := newFixture(t)
	p := f.post(t, map[string]any{"title": "Dark mode is here, plus faster search"})
	if got := p.GetString("slug"); got != "dark-mode-is-here-plus-faster" {
		t.Fatalf("slug = %q", got)
	}
	p, _ = f.set(t, p, map[string]any{"title": "Dark mode"})
	if got := p.GetString("slug"); got != "dark-mode" {
		t.Fatalf("after title change slug = %q", got)
	}
	// By hand through the record API: it sticks.
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: "/api/collections/changelogs/records/" + p.Id, Headers: f.su(t),
		Body: strings.NewReader(`{"slug":"dark-mode-launch"}`), ExpectedStatus: 200,
		ExpectedContent: []string{`"slug":"dark-mode-launch"`, `"slugCustom":true`},
	}, nil)
	p, _ = f.set(t, p, map[string]any{"title": "Night mode"})
	if got := p.GetString("slug"); got != "dark-mode-launch" {
		t.Fatalf("hand-set slug moved to %q", got)
	}
	// "" hands it back to the title.
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: "/api/collections/changelogs/records/" + p.Id, Headers: f.su(t),
		Body: strings.NewReader(`{"slug":""}`), ExpectedStatus: 200,
		ExpectedContent: []string{`"slug":"night-mode"`, `"slugCustom":false`},
	}, nil)
}

func TestSlugIsUniqueAndValid(t *testing.T) {
	f := newFixture(t)
	first := f.post(t, map[string]any{"title": "Dark mode"})
	second := f.post(t, map[string]any{"title": "Dark mode"})
	if got := second.GetString("slug"); got != "dark-mode-2" {
		t.Fatalf("second slug = %q", got)
	}
	untitled := f.post(t, nil)
	untitled2 := f.post(t, map[string]any{"title": "Тёмная тема"})
	if untitled.GetString("slug") != "" || untitled2.GetString("slug") != "" {
		t.Fatalf("empty slugs: %q %q", untitled.GetString("slug"), untitled2.GetString("slug"))
	}
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: "/api/collections/changelogs/records/" + second.Id, Headers: f.su(t),
		Body: strings.NewReader(`{"slug":"` + first.GetString("slug") + `"}`), ExpectedStatus: 400,
		ExpectedContent: []string{"Another post already uses this address.", `"slug":{`},
	}, nil)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: "/api/collections/changelogs/records/" + second.Id, Headers: f.su(t),
		Body: strings.NewReader(`{"slug":"Bad Address!"}`), ExpectedStatus: 400,
		ExpectedContent: []string{"Use lowercase letters, numbers and hyphens.", `"slug":{`},
	}, nil)
}

func TestSlugIsFixedOncePublished(t *testing.T) {
	f := newFixture(t)
	p := f.publish(t, f.post(t, map[string]any{"title": "Dark mode"}))
	p, err := f.set(t, p, map[string]any{"state": "draft"})
	if err != nil {
		t.Fatal(err)
	}
	p, err = f.set(t, p, map[string]any{"title": "Night mode"})
	if err != nil || p.GetString("slug") != "dark-mode" {
		t.Fatalf("after unpublish title change: slug=%q err=%v", p.GetString("slug"), err)
	}
	_, err = f.set(t, p, map[string]any{"slug": "night-mode", "slugCustom": true})
	if apiMessage(err) != "The address is fixed once a post has been published." {
		t.Fatalf("slug change err = %v", err)
	}
}

func TestLivePostIsReadOnly(t *testing.T) {
	f := newFixture(t)
	req := testutil.Request(t, f.app, f.features, f.mara, "Export", "planned", 1)
	p := f.publish(t, f.post(t, map[string]any{"title": "Dark mode", "body": "Hi"}))
	for _, change := range []map[string]any{
		{"title": "Other"}, {"body": "Changed"}, {"labels": []string{"new"}}, {"requests": []string{req.Id}},
		{"cover": mustFile(t, "cover.png")},
	} {
		if _, err := f.set(t, p, change); apiMessage(err) != "This post is live. Unpublish it to make changes." {
			t.Errorf("%v: err = %v", change, err)
		}
	}
	if err := f.app.Delete(f.reload(t, p)); apiMessage(err) != "Unpublish this post before deleting it." {
		t.Errorf("delete err = %v", err)
	}
	// Unpublishing is a state-only save.
	if _, err := f.set(t, p, map[string]any{"state": "draft"}); err != nil {
		t.Fatalf("unpublish: %v", err)
	}
}

func TestDraftAndScheduledAreEditableAndDeletable(t *testing.T) {
	f := newFixture(t)
	req := testutil.Request(t, f.app, f.features, f.mara, "Export", "planned", 1)
	for _, state := range []string{"draft", "scheduled"} {
		p := f.post(t, map[string]any{"title": "Post " + state, "state": state})
		for _, change := range []map[string]any{
			{"title": "Other " + state}, {"body": "Changed"}, {"labels": []string{"new"}}, {"requests": []string{req.Id}},
			{"cover": mustFile(t, "cover.png")},
		} {
			if _, err := f.set(t, p, change); err != nil {
				t.Errorf("%s %v: %v", state, change, err)
			}
		}
		if err := f.app.Delete(f.reload(t, p)); err != nil {
			t.Errorf("delete %s: %v", state, err)
		}
	}
}

func TestDeletingAnAttachedRequestKeepsTheLivePost(t *testing.T) {
	f := newFixture(t)
	a := testutil.Request(t, f.app, f.features, f.mara, "Export", "planned", 1)
	b := testutil.Request(t, f.app, f.features, f.mara, "Import", "planned", 1)
	c := testutil.Request(t, f.app, f.features, f.mara, "Sync", "planned", 1)
	p := f.publish(t, f.post(t, map[string]any{"title": "Dark mode", "requests": []string{a.Id, b.Id}}))
	if err := f.app.Delete(a); err != nil {
		t.Fatalf("delete request: %v", err)
	}
	p = f.reload(t, p)
	if got := p.GetStringSlice("requests"); len(got) != 1 || got[0] != b.Id || p.GetString("state") != "published" {
		t.Fatalf("post after delete: requests=%v state=%s", got, p.GetString("state"))
	}
	if _, err := f.set(t, p, map[string]any{"requests": []string{b.Id, c.Id}}); apiMessage(err) != "This post is live. Unpublish it to make changes." {
		t.Fatalf("adding to a live post: %v", err)
	}
}

func TestTitleIsTrimmedToOneLine(t *testing.T) {
	f := newFixture(t)
	p := f.post(t, map[string]any{"title": "  Dark\nmode  "})
	if got := p.GetString("title"); got != "Dark mode" {
		t.Fatalf("title = %q", got)
	}
	blank := f.post(t, map[string]any{"title": "   \n "})
	if blank.GetString("title") != "" || blank.GetString("slug") != "" {
		t.Fatalf("blank title = %q slug = %q", blank.GetString("title"), blank.GetString("slug"))
	}
}

func TestExcerptFollowsTheBody(t *testing.T) {
	f := newFixture(t)
	p := f.post(t, map[string]any{"title": "Dark mode", "body": "## Hi\n\nFirst."})
	if p.GetString("excerpt") != "First." {
		t.Fatalf("excerpt = %q", p.GetString("excerpt"))
	}
	p, _ = f.set(t, p, map[string]any{"body": "Second."})
	if p.GetString("excerpt") != "Second." {
		t.Fatalf("excerpt = %q", p.GetString("excerpt"))
	}
}

func TestRevisionCountsEdits(t *testing.T) {
	f := newFixture(t)
	p := f.post(t, map[string]any{"title": "Dark mode"})
	rev := func() int { return f.reload(t, p).GetInt("revision") }
	if rev() != 0 {
		t.Fatalf("new post revision = %d", rev())
	}
	for i, change := range []map[string]any{
		{"title": "Night mode"}, {"body": "Hi"}, {"labels": []string{"fixed"}}, {"images+": mustFile(t, "a.png")},
	} {
		if _, err := f.set(t, p, change); err != nil {
			t.Fatal(err)
		}
		if got := rev(); got != i+1 {
			t.Fatalf("after %v revision = %d, want %d", change, got, i+1)
		}
	}
	if _, err := f.set(t, p, map[string]any{"state": "scheduled", "publishAt": time.Now().Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	if got := rev(); got != 4 {
		t.Fatalf("state-only save moved revision to %d", got)
	}
}

func TestExpectedRevision(t *testing.T) {
	f := newFixture(t)
	p := f.post(t, map[string]any{"title": "Dark mode"})
	url := "/api/collections/changelogs/records/" + p.Id
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: url, Headers: f.su(t),
		Body: strings.NewReader(`{"body":"first","expectedRevision":0}`), ExpectedStatus: 200,
		ExpectedContent: []string{`"revision":1`}, NotExpectedContent: []string{"expectedRevision"},
	}, nil)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: url, Headers: f.su(t),
		Body: strings.NewReader(`{"body":"stale","expectedRevision":0}`), ExpectedStatus: 409,
		ExpectedContent: []string{"This post changed in another window. Reload to see it."},
	}, func(t *testing.T) {
		if got := f.reload(t, p).GetString("body"); got != "first" {
			t.Errorf("body = %q", got)
		}
	})
	// No precondition: no check (the PocketBase admin UI, later service calls).
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: url, Headers: f.su(t),
		Body: strings.NewReader(`{"body":"admin ui"}`), ExpectedStatus: 200, ExpectedContent: []string{`"body":"admin ui"`},
	}, nil)
	// Live wins over the conflict.
	f.publish(t, p)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: url, Headers: f.su(t),
		Body: strings.NewReader(`{"body":"late","expectedRevision":0}`), ExpectedStatus: 400,
		ExpectedContent: []string{"This post is live. Unpublish it to make changes."},
	}, nil)
}

func TestRecordAPIGuards(t *testing.T) {
	f := newFixture(t)
	p := f.post(t, map[string]any{"title": "Dark mode"})
	url := "/api/collections/changelogs/records/" + p.Id
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/changelogs/records", Headers: f.su(t),
		Body: strings.NewReader(`{"title":"x","state":"draft"}`), ExpectedStatus: 400,
		ExpectedContent: []string{"Use New post to start one."},
	}, nil)
	for _, body := range []string{
		`{"state":"published"}`, `{"publishAt":"2030-01-01 00:00:00.000Z"}`, `{"publishedAt":"2030-01-01 00:00:00.000Z"}`,
		`{"author":"x"}`, `{"excerpt":"x"}`, `{"slugCustom":true}`, `{"revision":9}`, `{"nope":1}`, `{"publishError":"x"}`,
	} {
		f.scenario(t, tests.ApiScenario{
			Name: body, Method: http.MethodPatch, URL: url, Headers: f.su(t), Body: strings.NewReader(body),
			ExpectedStatus: 400, ExpectedContent: []string{"Use Publish, Schedule or Unpublish to change that."},
		}, nil)
	}
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: url, Headers: f.su(t), Body: strings.NewReader(`{"publishError":""}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"publishError":""`},
	}, nil)
	user := map[string]string{"Authorization": testutil.Token(t, f.mara)}
	for _, h := range []map[string]string{nil, user} {
		f.scenario(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/collections/changelogs/records", Headers: h, ExpectedStatus: 403, ExpectedContent: []string{"Only superusers"}}, nil)
		f.scenario(t, tests.ApiScenario{Method: http.MethodGet, URL: url, Headers: h, ExpectedStatus: 403, ExpectedContent: []string{"Only superusers"}}, nil)
		f.scenario(t, tests.ApiScenario{Method: http.MethodPatch, URL: url, Headers: h, Body: strings.NewReader(`{"title":"x"}`), ExpectedStatus: 403, ExpectedContent: []string{"Only superusers"}}, nil)
	}
}

// raceUpdate runs other once, after the record API has loaded a post for an update and before the
// changelog hooks see it: the window in which a second save or a lifecycle call can land.
func (f *fixture) raceUpdate(other func()) {
	f.app.OnRecordUpdateRequest("changelogs").Bind(&hook.Handler[*core.RecordRequestEvent]{
		Id: "race", Priority: -100,
		Func: func(e *core.RecordRequestEvent) error {
			f.app.OnRecordUpdateRequest("changelogs").Unbind("race")
			other()
			return e.Next()
		},
	})
}

func TestExpectedRevisionIsCheckedAgainstTheStoredPost(t *testing.T) {
	f := newFixture(t)
	p := f.post(t, map[string]any{"title": "Dark mode"})
	// Another window's save lands after this one was read, so both carry revision 0.
	f.raceUpdate(func() {
		if _, err := f.set(t, p, map[string]any{"body": "theirs"}); err != nil {
			t.Error(err)
		}
	})
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: "/api/collections/changelogs/records/" + p.Id, Headers: f.su(t),
		Body: strings.NewReader(`{"body":"mine","expectedRevision":0}`), ExpectedStatus: 409,
		ExpectedContent: []string{"This post changed in another window. Reload to see it."},
	}, func(t *testing.T) {
		if got := f.reload(t, p).GetString("body"); got != "theirs" {
			t.Errorf("body = %q, the newer save was overwritten", got)
		}
	})
}

func TestASaveNeverUndoesAPublishThatLandedFirst(t *testing.T) {
	f := newFixture(t)
	url := func(p *core.Record) string { return "/api/collections/changelogs/records/" + p.Id }
	live := func(p *core.Record) func() {
		return func() {
			if _, err := f.set(t, p, map[string]any{"state": "published", "publishedAt": time.Now()}); err != nil {
				t.Error(err)
			}
		}
	}

	// A content change meets a post that just went live: the live message, nothing written.
	a := f.post(t, map[string]any{"title": "Dark mode"})
	f.raceUpdate(live(a))
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: url(a), Headers: f.su(t),
		Body: strings.NewReader(`{"title":"Night mode","expectedRevision":0}`), ExpectedStatus: 400,
		ExpectedContent: []string{"This post is live. Unpublish it to make changes."},
	}, func(t *testing.T) {
		if got := f.reload(t, a); got.GetString("state") != "published" || got.GetString("title") != "Dark mode" {
			t.Errorf("state=%s title=%s", got.GetString("state"), got.GetString("title"))
		}
	})

	// A save that touches nothing locked goes through, and the post stays published.
	b := f.post(t, map[string]any{"title": "Faster search"})
	f.raceUpdate(live(b))
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: url(b), Headers: f.su(t),
		Body: strings.NewReader(`{"completeAttached":true}`), ExpectedStatus: 200, ExpectedContent: []string{`"completeAttached":true`},
	}, func(t *testing.T) {
		got := f.reload(t, b)
		if got.GetString("state") != "published" || got.GetDateTime("publishedAt").IsZero() || !got.GetBool("completeAttached") {
			t.Errorf("state=%s publishedAt=%v completeAttached=%v", got.GetString("state"), got.GetDateTime("publishedAt"), got.GetBool("completeAttached"))
		}
	})
}

func TestDeleteChecksTheStoredState(t *testing.T) {
	f := newFixture(t)
	p := f.post(t, map[string]any{"title": "Dark mode", "state": "scheduled"})
	// It was read as scheduled, then the cron (or a click) published it.
	f.app.OnRecordDeleteRequest("changelogs").Bind(&hook.Handler[*core.RecordRequestEvent]{
		Id: "race", Priority: -100,
		Func: func(e *core.RecordRequestEvent) error {
			if _, err := f.set(t, p, map[string]any{"state": "published", "publishedAt": time.Now()}); err != nil {
				t.Error(err)
			}
			return e.Next()
		},
	})
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodDelete, URL: "/api/collections/changelogs/records/" + p.Id, Headers: f.su(t),
		ExpectedStatus: 400, ExpectedContent: []string{"Unpublish this post before deleting it."},
	}, func(t *testing.T) {
		if _, err := f.app.FindRecordById("changelogs", p.Id); err != nil {
			t.Errorf("the live post was deleted: %v", err)
		}
	})
}

func TestUntouchedCleanupOnlyDeletesAnUntouchedDraftAtTheSeenRevision(t *testing.T) {
	f := newFixture(t)
	del := func(p *core.Record, query string, status int, content ...string) {
		t.Helper()
		f.scenario(t, tests.ApiScenario{
			Name: query, Method: http.MethodDelete, URL: "/api/collections/changelogs/records/" + p.Id + query, Headers: f.su(t),
			ExpectedStatus: status, ExpectedContent: content,
		}, nil)
	}
	exists := func(p *core.Record) bool {
		_, err := f.app.FindRecordById("changelogs", p.Id)
		return err == nil
	}

	// Another window saved a title after this one opened the post (it saw revision 0).
	edited := f.post(t, nil)
	if _, err := f.set(t, edited, map[string]any{"title": "Dark mode"}); err != nil {
		t.Fatal(err)
	}
	del(edited, "?ifUntouched=0", 409, "This post changed in another window. Reload to see it.")
	if !exists(edited) {
		t.Fatal("work saved by another window was deleted")
	}

	// Something that was scheduled is kept even at the revision this window saw.
	scheduled := f.post(t, map[string]any{"state": "scheduled", "publishAt": time.Now().Add(time.Hour)})
	del(scheduled, "?ifUntouched=0", 409, "This post isn't an empty draft any more.")
	if !exists(scheduled) {
		t.Fatal("a scheduled post was deleted")
	}

	// An untouched draft at the revision the window saw goes; so does any draft with no precondition.
	untouched := f.post(t, nil)
	del(untouched, "?ifUntouched=0", 204)
	if exists(untouched) {
		t.Fatal("the untouched draft stayed")
	}
	plain := f.post(t, map[string]any{"title": "Explicit delete"})
	del(plain, "", 204)
	if exists(plain) {
		t.Fatal("an explicit delete was refused")
	}
}

var fileN int

func mustFile(t testing.TB, name string) *filesystem.File {
	t.Helper()
	fileN++
	file, err := filesystem.NewFileFromBytes(pngBytes, strconv.Itoa(fileN)+name)
	if err != nil {
		t.Fatal(err)
	}
	return file
}

// pngBytes is a 1×1 PNG.
var pngBytes = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
	0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
	0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
}
