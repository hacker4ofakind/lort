package changelog_test

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/changelog"
	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestReferenced(t *testing.T) {
	body := "![](/api/files/changelogs/x/a.png) and ![](/api/files/changelogs/x/b.png?thumb=1600x0)"
	for name, want := range map[string]bool{"a.png": true, "b.png": true, "a.pn": false, "c.png": false} {
		if got := changelog.Referenced(body, name); got != want {
			t.Errorf("Referenced(%q) = %v", name, got)
		}
	}
	if changelog.Referenced("/x/a.png2", "a.png") {
		t.Error("a prefix of another name counted")
	}
}

func TestListShowsPublishedNewestFirst(t *testing.T) {
	f := newFixture(t)
	day := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	for i := 0; i < 23; i++ {
		f.post(t, map[string]any{
			"title": fmt.Sprintf("Post %02d", i), "state": "published", "publishedAt": day.Add(time.Duration(i) * time.Hour),
			"labels": []string{map[bool]string{true: "fixed", false: "new"}[i%2 == 0]},
		})
	}
	f.post(t, map[string]any{"title": "Draft"})
	f.post(t, map[string]any{"title": "Later", "state": "scheduled", "publishAt": day.Add(48 * time.Hour)})
	s := changelog.New(f.app)

	page, err := s.List("", 1)
	if err != nil {
		t.Fatal(err)
	}
	if page.TotalItems != 23 || len(page.Items) != 20 || page.Items[0].Title != "Post 22" || page.Items[19].Title != "Post 03" {
		t.Fatalf("page 1: total=%d len=%d first=%q", page.TotalItems, len(page.Items), page.Items[0].Title)
	}
	page, _ = s.List("", 2)
	if len(page.Items) != 3 || page.Items[2].Title != "Post 00" {
		t.Fatalf("page 2: %d items", len(page.Items))
	}
	fixed, _ := s.List("fixed", 1)
	if fixed.TotalItems != 12 || fixed.Items[0].Labels[0] != "fixed" {
		t.Fatalf("fixed: total=%d", fixed.TotalItems)
	}
	if all, _ := s.List("bogus", 1); all.TotalItems != 23 {
		t.Fatalf("unknown label: total=%d", all.TotalItems)
	}
}

func TestBySlug(t *testing.T) {
	f := newFixture(t)
	private := testutil.Board(t, f.app, "Internal", false, false)
	shown := testutil.Request(t, f.app, f.features, f.mara, "Shown one", "completed", 1)
	hidden := testutil.Request(t, f.app, f.features, f.mara, "Hidden one", "completed", 1)
	inside := testutil.Request(t, f.app, private, f.mara, "Inside one", "completed", 1)
	merged := testutil.Request(t, f.app, f.features, f.mara, "Merged one", "closed", 1)
	hidden.Set("visible", false)
	merged.Set("mergedInto", shown.Id)
	for _, r := range []*core.Record{hidden, merged} {
		if err := f.app.Save(r); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := requests.New(f.app).ToggleVote(shown.Id, f.mara.Id); err != nil {
		t.Fatal(err)
	}
	ids := []string{hidden.Id, shown.Id, inside.Id, merged.Id}
	live := f.post(t, map[string]any{"title": "Dark mode", "body": "Body", "requests": ids, "state": "published", "publishedAt": time.Now()})
	draft := f.post(t, map[string]any{"title": "Secret draft"})
	later := f.post(t, map[string]any{"title": "Secret later", "state": "scheduled", "publishAt": time.Now().Add(time.Hour)})
	s := changelog.New(f.app)

	p, err := s.BySlug("dark-mode", f.mara)
	if err != nil {
		t.Fatal(err)
	}
	if p.ID != live.Id || p.Body != "Body" || len(p.Shipped) != 1 || p.Shipped[0].ID != shown.Id || !p.Shipped[0].Voted || p.Shipped[0].Body != "" {
		t.Fatalf("post = %+v", p)
	}
	if anon, _ := s.BySlug("dark-mode", nil); anon.Shipped[0].Voted {
		t.Fatal("anonymous viewer shows as voted")
	}
	for _, slug := range []string{draft.GetString("slug"), later.GetString("slug"), "nope", "Bad Slug"} {
		if _, err := s.BySlug(slug, nil); !errors.Is(err, changelog.ErrNotFound) {
			t.Errorf("BySlug(%q) err = %v", slug, err)
		}
	}
}

func TestTeamList(t *testing.T) {
	f := newFixture(t)
	day := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	pub := f.post(t, map[string]any{"title": "Published one", "state": "published", "publishedAt": day, "labels": []string{"new"}})
	sch := f.post(t, map[string]any{"title": "Scheduled one", "state": "scheduled", "publishAt": day.Add(time.Hour), "labels": []string{"fixed"}})
	d1 := f.post(t, map[string]any{"title": "Draft 50% off"})
	time.Sleep(5 * time.Millisecond) // "updated" has millisecond precision
	d2 := f.post(t, map[string]any{"title": "Draft 50 percent", "labels": []string{"new"}})
	s := changelog.New(f.app)

	page, err := s.TeamList(changelog.TeamQuery{})
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, p := range page.Items {
		got = append(got, p.ID)
	}
	want := []string{d2.Id, d1.Id, sch.Id, pub.Id}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("order = %v, want %v", got, want)
	}
	if page, _ = s.TeamList(changelog.TeamQuery{Q: "50%"}); len(page.Items) != 1 || page.Items[0].ID != d1.Id {
		t.Fatalf("q=50%%: %d items", len(page.Items))
	}
	if page, _ = s.TeamList(changelog.TeamQuery{Q: "50_"}); len(page.Items) != 0 {
		t.Fatalf("q=50_: %d items", len(page.Items))
	}
	page, _ = s.TeamList(changelog.TeamQuery{States: []string{"draft", "published"}, Labels: []string{"new"}})
	if len(page.Items) != 2 || page.Items[0].ID != d2.Id || page.Items[1].ID != pub.Id {
		t.Fatalf("state+label: %d items", len(page.Items))
	}
}

func TestCreateAndEditor(t *testing.T) {
	f := newFixture(t)
	admin := f.teamProfile(t)
	hidden := testutil.Request(t, f.app, f.features, f.mara, "Hidden one", "planned", 1)
	hidden.Set("visible", false)
	if err := f.app.Save(hidden); err != nil {
		t.Fatal(err)
	}
	s := changelog.New(f.app)
	id, err := s.Create(admin)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.set(t, mustFind(t, f, id), map[string]any{"requests": []string{hidden.Id}}); err != nil {
		t.Fatal(err)
	}
	ed, err := s.Editor(id)
	if err != nil {
		t.Fatal(err)
	}
	if ed.State != "draft" || ed.Author.ID != admin.Id || len(ed.Attached) != 1 || ed.Attached[0].ID != hidden.Id || ed.Images == nil {
		t.Fatalf("editor = %+v", ed)
	}
	if _, err := s.Editor("nope"); !errors.Is(err, changelog.ErrNotFound) {
		t.Fatalf("missing err = %v", err)
	}
}

func TestPageMeta(t *testing.T) {
	f := newFixture(t)
	s := changelog.New(f.app)
	s.BaseURL = "https://feedback.example.com/"
	s.AppName = func() string { return "Driftnote" }
	plain := f.post(t, map[string]any{"title": "Dark mode", "body": "It's here.", "state": "published", "publishedAt": time.Now()})
	covered := f.post(t, map[string]any{"title": "Faster search", "state": "published", "publishedAt": time.Now(), "cover": mustFile(t, "c.png")})
	draft := f.post(t, map[string]any{"title": "Secret"})

	decode := func(h string) map[string]string {
		b, err := base64.RawURLEncoding.DecodeString(h)
		if err != nil {
			t.Fatal(err)
		}
		m := map[string]string{}
		if err := json.Unmarshal(b, &m); err != nil {
			t.Fatal(err)
		}
		return m
	}
	m := decode(s.PageMeta("/changelog/" + plain.GetString("slug")))
	if m["title"] != "Dark mode" || m["description"] != "It's here." || m["appName"] != "Driftnote" ||
		m["url"] != "https://feedback.example.com/changelog/dark-mode" || m["image"] != "https://feedback.example.com/changelog-card/dark-mode" {
		t.Fatalf("plain meta = %v", m)
	}
	c := mustFind(t, f, covered.Id)
	m = decode(s.PageMeta("/changelog-card/" + c.GetString("slug")))
	if want := "https://feedback.example.com/api/files/changelogs/" + c.Id + "/" + c.GetString("cover") + "?thumb=1200x630"; m["image"] != want {
		t.Fatalf("cover image = %q, want %q", m["image"], want)
	}
	for _, path := range []string{"/changelog/" + draft.GetString("slug"), "/changelog", "/changelog/", "/changelog/a/b", "/feedback", "/changelog/nope"} {
		if got := s.PageMeta(path); got != "" {
			t.Errorf("PageMeta(%q) = %q", path, got)
		}
	}
}

func mustFind(t testing.TB, f *fixture, id string) *core.Record {
	t.Helper()
	r, err := f.app.FindRecordById("changelogs", id)
	if err != nil {
		t.Fatal(err)
	}
	return r
}
