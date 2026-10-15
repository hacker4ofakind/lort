package hooks_test

import (
	"bytes"
	"errors"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"github.com/hacker4ofakind/lort/server/internal/hooks"
	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

type fixture struct {
	app                *tests.TestApp
	features, approval *core.Record
	mara, banned       *core.Record
	admin              *core.Record
}

func newFixture(t testing.TB) *fixture {
	app := testutil.NewApp(t)
	hooks.Register(app, requests.New(app))
	f := &fixture{app: app}
	f.features = testutil.Board(t, app, "Features", true, false)
	f.approval = testutil.Board(t, app, "Bugs", true, true)
	f.mara = testutil.User(t, app, "mara@example.com")
	f.banned = testutil.User(t, app, "spam@example.com")
	f.banned.Set("banned", true)
	f.admin = testutil.User(t, app, "luk@driftnote.app")
	f.admin.Set("isAdmin", true)
	for _, r := range []*core.Record{f.banned, f.admin} {
		if err := app.Save(r); err != nil {
			t.Fatal(err)
		}
	}
	return f
}

func (f *fixture) scenario(t *testing.T, s tests.ApiScenario, after func(*testing.T, *tests.TestApp)) {
	s.TestAppFactory = func(testing.TB) *tests.TestApp { return f.app }
	s.DisableTestAppCleanup = true
	if after != nil {
		s.AfterTestFunc = func(t testing.TB, app *tests.TestApp, _ *http.Response) { after(t.(*testing.T), app) }
	}
	s.Test(t)
}

func TestSignupDefaultsNameAndBlocksHoneypot(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/users/records",
		Body:           strings.NewReader(`{"email":"priya.s@example.com","password":"correcthorse","passwordConfirm":"correcthorse","isAdmin":true}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"name":"priya.s"`, `"isAdmin":false`},
	}, nil)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/users/records",
		Body:           strings.NewReader(`{"email":"bot@example.com","password":"correcthorse","passwordConfirm":"correcthorse","website":"http://spam"}`),
		ExpectedStatus: 400, ExpectedContent: []string{"Something went wrong"},
	}, nil)
}

func TestCreateRequestFillsServerFields(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/requests/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"Dark mode","status":"completed","upvoteCount":999,"author":"x"}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"status":"pending"`, `"visible":true`},
	}, func(t *testing.T, app *tests.TestApp) {
		r, err := app.FindFirstRecordByData("requests", "title", "Dark mode")
		if err != nil {
			t.Fatal(err)
		}
		if r.GetString("author") != f.mara.Id || r.GetInt("upvoteCount") != 1 {
			t.Errorf("author=%s votes=%d", r.GetString("author"), r.GetInt("upvoteCount"))
		}
		if n, _ := app.CountRecords("activity", dbx.HashExp{"request": r.Id, "kind": "created"}); n != 1 {
			t.Errorf("created activity = %d", n)
		}
	})
}

func TestCreateRequestOnApprovalBoardIsHidden(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/requests/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"board":"` + f.approval.Id + `","title":"Crash on paste"}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"visible":false`, `"awaitingApproval":true`},
	}, nil)
}

func TestAdminCanCreateInternalRequest(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/requests/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.admin)},
		Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"Refactor sync","internal":true}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"visible":false`, `"awaitingApproval":false`},
	}, nil)
}

func TestBannedUserCannotPost(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/requests/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.banned)},
		Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"Buy cheap stuff"}`),
		ExpectedStatus: 403, ExpectedContent: []string{"can't post"},
	}, nil)
}

func TestCommentsInternalAndReplies(t *testing.T) {
	f := newFixture(t)
	req := testutil.Request(t, f.app, f.features, f.mara, "Export", "pending", 1)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/comments/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"request":"` + req.Id + `","body":"Me too","internal":true}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"internal":false`},
	}, nil)
	top, _ := f.app.FindFirstRecordByData("comments", "body", "Me too")
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/comments/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.admin)},
		Body:           strings.NewReader(`{"request":"` + req.Id + `","body":"Thanks!","parent":"` + top.Id + `"}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"parent":"` + top.Id + `"`},
	}, nil)
	reply, _ := f.app.FindFirstRecordByData("comments", "body", "Thanks!")
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/comments/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"request":"` + req.Id + `","body":"Nested","parent":"` + reply.Id + `"}`),
		ExpectedStatus: 400, ExpectedContent: []string{"top-level comment"},
	}, nil)
}

func TestBoardWithRequestsCannotBeDeleted(t *testing.T) {
	f := newFixture(t)
	testutil.Request(t, f.app, f.features, f.mara, "Export", "pending", 1)
	su := testutil.Superuser(t, f.app, "root@example.com")
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodDelete, URL: "/api/collections/boards/records/" + f.features.Id,
		Headers:        map[string]string{"Authorization": testutil.Token(t, su)},
		ExpectedStatus: 400, ExpectedContent: []string{"Move this board"},
	}, nil)
}

func TestUsersCannotPromoteThemselves(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: "/api/collections/users/records/" + f.mara.Id,
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"isAdmin":true}`),
		ExpectedStatus: 404, ExpectedContent: []string{`"data":{}`},
	}, nil)
}

func anon(t *testing.T, f *fixture, method, url string, body string, status int) {
	f.scenario(t, tests.ApiScenario{Method: method, URL: url, Body: strings.NewReader(body), ExpectedStatus: status,
		ExpectedContent: []string{"{"}}, nil)
}

func TestAuthorlessRecordsStayPrivate(t *testing.T) {
	f := newFixture(t)
	devon := testutil.User(t, f.app, "devon@example.com")
	r := testutil.Request(t, f.app, f.features, devon, "Waiting one", "pending", 0)
	r.Set("visible", false)
	if err := f.app.Save(r); err != nil {
		t.Fatal(err)
	}
	pub := testutil.Request(t, f.app, f.features, devon, "Public one", "pending", 0)
	c := core.NewRecord(mustCollection(t, f.app, "comments"))
	c.Set("request", pub.Id)
	c.Set("author", devon.Id)
	c.Set("body", "Gone soon")
	if err := f.app.Save(c); err != nil {
		t.Fatal(err)
	}
	if err := f.app.Delete(devon); err != nil {
		t.Fatal(err)
	}
	f.scenario(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/collections/requests/records", ExpectedStatus: 200,
		ExpectedContent: []string{`"totalItems":1`}, NotExpectedContent: []string{"Waiting one"}}, nil)
	anon(t, f, http.MethodGet, "/api/collections/requests/records/"+r.Id, "", 404)
	anon(t, f, http.MethodPatch, "/api/collections/requests/records/"+r.Id, `{"title":"Hijacked"}`, 404)
	anon(t, f, http.MethodDelete, "/api/collections/comments/records/"+c.Id, "", 404)
}

func TestMergedRequestsDontLeakPrivateContent(t *testing.T) {
	f := newFixture(t)
	private := testutil.Board(t, f.app, "Internal", false, false)
	target := testutil.Request(t, f.app, f.features, f.mara, "Dark mode", "planned", 0)
	secret := testutil.Request(t, f.app, private, f.mara, "Secret plan", "pending", 0)
	public := testutil.Request(t, f.app, f.features, f.mara, "Night theme", "pending", 0)
	for _, r := range []*core.Record{secret, public} {
		r.Set("mergedInto", target.Id)
		r.Set("status", "closed")
		if err := f.app.Save(r); err != nil {
			t.Fatal(err)
		}
	}
	anon(t, f, http.MethodGet, "/api/collections/requests/records/"+secret.Id, "", 404)
	f.scenario(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/collections/requests/records/" + public.Id,
		ExpectedStatus: 200, ExpectedContent: []string{`"mergedInto":"` + target.Id + `"`}}, nil)
}

func TestAuthorsCantMoveBoards(t *testing.T) {
	f := newFixture(t)
	r := testutil.Request(t, f.app, f.features, f.mara, "Export", "pending", 0)
	auth := map[string]string{"Authorization": testutil.Token(t, f.mara)}
	f.scenario(t, tests.ApiScenario{Method: http.MethodPatch, URL: "/api/collections/requests/records/" + r.Id, Headers: auth,
		Body: strings.NewReader(`{"board":"` + f.approval.Id + `"}`), ExpectedStatus: 404, ExpectedContent: []string{"{"}}, nil)
	f.scenario(t, tests.ApiScenario{Method: http.MethodPatch, URL: "/api/collections/requests/records/" + r.Id, Headers: auth,
		Body: strings.NewReader(`{"title":"Export as CSV"}`), ExpectedStatus: 200, ExpectedContent: []string{`"title":"Export as CSV"`}}, nil)
}

func TestHiddenRequestImagesArePrivate(t *testing.T) {
	f := newFixture(t)
	file := func(name string) *filesystem.File {
		fl, err := filesystem.NewFileFromBytes(png, name)
		if err != nil {
			t.Fatal(err)
		}
		return fl
	}
	shown := testutil.Request(t, f.app, f.features, f.mara, "Shown", "pending", 0)
	hidden := testutil.Request(t, f.app, f.features, f.mara, "Hidden", "pending", 0)
	shown.Set("images", []any{file("a.png")})
	hidden.Set("images", []any{file("b.png")})
	hidden.Set("visible", false)
	for _, r := range []*core.Record{shown, hidden} {
		if err := f.app.Save(r); err != nil {
			t.Fatal(err)
		}
	}
	url := func(r *core.Record) string {
		return "/api/files/requests/" + r.Id + "/" + r.GetStringSlice("images")[0]
	}
	f.scenario(t, tests.ApiScenario{Method: http.MethodGet, URL: url(shown), ExpectedStatus: 200, ExpectedContent: []string{"PNG"}}, nil)
	anon(t, f, http.MethodGet, url(hidden), "", 404)
	tok, err := f.mara.NewFileToken()
	if err != nil {
		t.Fatal(err)
	}
	f.scenario(t, tests.ApiScenario{Method: http.MethodGet, URL: url(hidden) + "?token=" + tok, ExpectedStatus: 200, ExpectedContent: []string{"PNG"}}, nil)
}

func TestDeletingAUserRecountsTheirVotes(t *testing.T) {
	f := newFixture(t)
	svc := requests.New(f.app)
	r := testutil.Request(t, f.app, f.features, f.mara, "Export", "pending", 0)
	devon := testutil.User(t, f.app, "devon@example.com")
	for _, u := range []*core.Record{f.mara, devon} {
		if _, _, err := svc.ToggleVote(r.Id, u.Id); err != nil {
			t.Fatal(err)
		}
	}
	if err := f.app.Delete(devon); err != nil {
		t.Fatal(err)
	}
	r, _ = f.app.FindRecordById("requests", r.Id)
	if r.GetInt("upvoteCount") != 1 {
		t.Errorf("upvoteCount = %d, want 1", r.GetInt("upvoteCount"))
	}
}

func TestCreateRequestIsAtomic(t *testing.T) {
	f := newFixture(t)
	auth := map[string]string{"Authorization": testutil.Token(t, f.mara)}
	f.scenario(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/collections/requests/records", Headers: auth,
		Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"Dark mode"}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"upvoteCount":1`}}, nil)

	f.app.OnRecordCreate("votes").BindFunc(func(e *core.RecordEvent) error { return errors.New("disk full") })
	f.scenario(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/collections/requests/records", Headers: auth,
		Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"Broken one"}`),
		ExpectedStatus: 400, ExpectedContent: []string{"{"}}, func(t *testing.T, app *tests.TestApp) {
		if _, err := app.FindFirstRecordByData("requests", "title", "Broken one"); err == nil {
			t.Error("a request whose vote failed should not be saved")
		}
	})
}

// png is a 1×1 PNG image.
var png = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82")

func mustCollection(t *testing.T, app core.App, name string) *core.Collection {
	c, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestCreateRequestWithImage(t *testing.T) {
	f := newFixture(t)
	body := &bytes.Buffer{}
	mp := multipart.NewWriter(body)
	_ = mp.WriteField("board", f.features.Id)
	_ = mp.WriteField("title", "Crash on paste")
	w, err := mp.CreateFormFile("images", "paste.png")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = w.Write(png)
	if err := mp.Close(); err != nil {
		t.Fatal(err)
	}
	f.scenario(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/collections/requests/records", Body: body,
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara), "Content-Type": mp.FormDataContentType()},
		ExpectedStatus: 200, ExpectedContent: []string{`"upvoteCount":1`, `"images":["`}}, func(t *testing.T, app *tests.TestApp) {
		r, err := app.FindFirstRecordByData("requests", "title", "Crash on paste")
		if err != nil {
			t.Fatal(err)
		}
		fsys, err := app.NewFilesystem()
		if err != nil {
			t.Fatal(err)
		}
		defer fsys.Close()
		if ok, _ := fsys.Exists(r.BaseFilesPath() + "/" + r.GetStringSlice("images")[0]); !ok {
			t.Error("the uploaded image wasn't stored")
		}
	})
}

func TestVoteDeleteAndRecountAreAtomic(t *testing.T) {
	f := newFixture(t)
	svc := requests.New(f.app)
	r := testutil.Request(t, f.app, f.features, f.mara, "Export", "pending", 0)
	if _, _, err := svc.ToggleVote(r.Id, f.mara.Id); err != nil {
		t.Fatal(err)
	}
	vote, err := f.app.FindFirstRecordByData("votes", "request", r.Id)
	if err != nil {
		t.Fatal(err)
	}
	// Make the recount fail: the vote must then survive with the count it matches.
	if _, err := f.app.DB().NewQuery(`CREATE TRIGGER fail_recount BEFORE UPDATE OF upvoteCount ON requests
		BEGIN SELECT RAISE(ABORT, 'recount failed'); END`).Execute(); err != nil {
		t.Fatal(err)
	}
	if err := f.app.Delete(vote); err == nil {
		t.Fatal("deleting the vote should fail when its recount fails")
	}
	if _, err := f.app.FindRecordById("votes", vote.Id); err != nil {
		t.Error("the vote was deleted although its recount failed")
	}
	if _, err := f.app.DB().NewQuery("DROP TRIGGER fail_recount").Execute(); err != nil {
		t.Fatal(err)
	}
	if err := f.app.Delete(vote); err != nil {
		t.Fatal(err)
	}
	r, _ = f.app.FindRecordById("requests", r.Id)
	if r.GetInt("upvoteCount") != 0 {
		t.Errorf("upvoteCount = %d after a standalone vote delete, want 0", r.GetInt("upvoteCount"))
	}
}
