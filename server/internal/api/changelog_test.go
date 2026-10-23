package api_test

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

// pngBytes is a 1×1 PNG.
var pngBytes = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
	0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
	0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
}

func (f *fixture) changelogPost(t *testing.T, data map[string]any) *core.Record {
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

func (f *fixture) suHeaders(t *testing.T) map[string]string {
	return map[string]string{"Authorization": testutil.Token(t, f.su)}
}

func TestChangelogPublicReads(t *testing.T) {
	f := newFixture(t)
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/changelog", ExpectedStatus: 200,
		ExpectedContent: []string{`"items":[]`, `"totalItems":0`}})
	cover, err := filesystem.NewFileFromBytes(pngBytes, "cover.png")
	if err != nil {
		t.Fatal(err)
	}
	live := f.changelogPost(t, map[string]any{"title": "Dark mode", "body": "It's here.", "labels": []string{"new"},
		"requests": []string{f.req.Id}, "state": "published", "publishedAt": time.Now(), "cover": cover})
	draft := f.changelogPost(t, map[string]any{"title": "Secret"})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/changelog?label=new", ExpectedStatus: 200,
		ExpectedContent:    []string{`"slug":"dark-mode"`, `"excerpt":"It's here."`, `"totalItems":1`},
		NotExpectedContent: []string{"Secret"}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/changelog/dark-mode", ExpectedStatus: 200,
		ExpectedContent: []string{`"body":"It's here."`, `"shipped":[{`, `"Dark mode for the editor"`},
		AfterTestFunc: func(t testing.TB, _ *tests.TestApp, res *http.Response) {
			if cc := res.Header.Get("Cache-Control"); !strings.Contains(cc, "no-store") {
				t.Errorf("Cache-Control = %q", cc)
			}
		}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/changelog/" + draft.GetString("slug"), Headers: f.suHeaders(t),
		ExpectedStatus: 404, ExpectedContent: []string{"That post isn't here."}})
	// The cover of a published post loads for anyone (link crawlers).
	live, _ = f.app.FindRecordById("changelogs", live.Id)
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/files/changelogs/" + live.Id + "/" + live.GetString("cover"),
		ExpectedStatus: 200, ExpectedContent: []string{"PNG"}})
}

func TestChangelogTeamRoutesAreTeamOnly(t *testing.T) {
	f := newFixture(t)
	p := f.changelogPost(t, map[string]any{"title": "Dark mode"})
	user := map[string]string{"Authorization": testutil.Token(t, f.mara)}
	for _, c := range []struct{ method, url string }{
		{http.MethodGet, "/api/lort/changelogs"}, {http.MethodPost, "/api/lort/changelogs"},
		{http.MethodGet, "/api/lort/changelogs/failed"}, {http.MethodGet, "/api/lort/changelogs/" + p.Id},
		{http.MethodPost, "/api/lort/changelogs/" + p.Id + "/publish"}, {http.MethodPost, "/api/lort/changelogs/" + p.Id + "/unpublish"},
	} {
		f.run(t, tests.ApiScenario{Method: c.method, URL: c.url, ExpectedStatus: 401, ExpectedContent: []string{`"data":{}`}})
		f.run(t, tests.ApiScenario{Method: c.method, URL: c.url, Headers: user, ExpectedStatus: 403, ExpectedContent: []string{`"data":{}`}})
	}
}

func TestChangelogTeamFlow(t *testing.T) {
	f := newFixture(t)
	h := f.suHeaders(t)
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/changelogs", Headers: h, ExpectedStatus: 200,
		ExpectedContent: []string{`"id":"`}})
	rows, err := f.app.FindAllRecords("changelogs")
	if err != nil || len(rows) != 1 {
		t.Fatalf("posts = %d, %v", len(rows), err)
	}
	id := rows[0].Id
	post := "/api/lort/changelogs/" + id
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: post, Headers: h, ExpectedStatus: 200,
		ExpectedContent: []string{`"state":"draft"`, `"attached":[]`, `"revision":0`, `"author":{"id":"`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: post + "/publish", Headers: h, ExpectedStatus: 400,
		ExpectedContent: []string{"Give the post a title before it goes out."}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: post + "/schedule", Headers: h,
		Body: strings.NewReader(`{"publishAt":"2001-01-01T09:00:00Z"}`), ExpectedStatus: 400, ExpectedContent: []string{"Pick a time in the future."}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: post + "/unschedule", Headers: h, ExpectedStatus: 409,
		ExpectedContent: []string{"That post isn't scheduled any more."}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/changelogs/failed", Headers: h, ExpectedStatus: 200,
		ExpectedContent: []string{`"items":[]`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/changelogs/nope", Headers: h, ExpectedStatus: 404,
		ExpectedContent: []string{"That post isn't here."}})

	// Title it through the record API, then schedule, publish and unpublish.
	f.run(t, tests.ApiScenario{Method: http.MethodPatch, URL: "/api/collections/changelogs/records/" + id, Headers: h,
		Body: strings.NewReader(`{"title":"Dark mode","expectedRevision":0}`), ExpectedStatus: 200, ExpectedContent: []string{`"slug":"dark-mode"`}})
	at := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: post + "/schedule", Headers: h,
		Body: strings.NewReader(`{"publishAt":"` + at + `"}`), ExpectedStatus: 200, ExpectedContent: []string{`"state":"scheduled"`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/changelogs?state=scheduled", Headers: h, ExpectedStatus: 200,
		ExpectedContent: []string{`"totalItems":1`, `"title":"Dark mode"`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: post + "/publish", Headers: h, ExpectedStatus: 200,
		ExpectedContent: []string{`"state":"published"`, `"completed":0`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: post + "/publish", Headers: h, ExpectedStatus: 409,
		ExpectedContent: []string{"It's already live."}})
	f.run(t, tests.ApiScenario{Method: http.MethodDelete, URL: "/api/collections/changelogs/records/" + id, Headers: h, ExpectedStatus: 400,
		ExpectedContent: []string{"Unpublish this post before deleting it."}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: post + "/unpublish", Headers: h, ExpectedStatus: 200,
		ExpectedContent: []string{`"state":"draft"`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: post + "/unpublish", Headers: h, ExpectedStatus: 409,
		ExpectedContent: []string{"That post isn't live."}})
}

func TestChangelogUploadThroughTheRecordAPI(t *testing.T) {
	f := newFixture(t)
	p := f.changelogPost(t, map[string]any{"title": "Dark mode"})
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	part, err := w.CreateFormFile("images+", "shot.png")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(pngBytes)
	_ = w.WriteField("expectedRevision", "0")
	_ = w.Close()
	f.run(t, tests.ApiScenario{Method: http.MethodPatch, URL: "/api/collections/changelogs/records/" + p.Id,
		Headers: map[string]string{"Authorization": testutil.Token(t, f.su), "Content-Type": w.FormDataContentType()},
		Body:    &body, ExpectedStatus: 200, ExpectedContent: []string{`"images":["shot_`, `"revision":1`}})
}
