package hooks_test

import (
	"bytes"
	"errors"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"
	"time"

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

func TestTeamShowingARequestApprovesIt(t *testing.T) {
	f := newFixture(t)
	r := testutil.Request(t, f.app, f.approval, f.mara, "Crash on paste", "pending", 0)
	r.Set("visible", false)
	r.Set("awaitingApproval", true)
	if err := f.app.Save(r); err != nil {
		t.Fatal(err)
	}
	su := testutil.Superuser(t, f.app, "root@example.com")
	f.scenario(t, tests.ApiScenario{Method: http.MethodPatch, URL: "/api/collections/requests/records/" + r.Id,
		Headers: map[string]string{"Authorization": testutil.Token(t, su)}, Body: strings.NewReader(`{"visible":true}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"visible":true`, `"awaitingApproval":false`}}, nil)
}

// The JS SDK sends the non-file fields of a multipart create as JSON in "@jsonPayload", so an
// admin's internal flag arrives as a real boolean even with an image attached.
func TestAdminInternalRequestWithImage(t *testing.T) {
	f := newFixture(t)
	body := &bytes.Buffer{}
	mp := multipart.NewWriter(body)
	_ = mp.WriteField("@jsonPayload", `{"board":"`+f.features.Id+`","title":"Roadmap notes","internal":true}`)
	w, err := mp.CreateFormFile("images", "notes.png")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = w.Write(png)
	if err := mp.Close(); err != nil {
		t.Fatal(err)
	}
	f.scenario(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/collections/requests/records", Body: body,
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.admin), "Content-Type": mp.FormDataContentType()},
		ExpectedStatus: 200, ExpectedContent: []string{`"visible":false`, `"awaitingApproval":false`, `"images":["`}}, nil)
}

// Deleting a comment takes its replies with it, whoever wrote them: the delete dialog says so,
// and an orphaned reply would still count towards the request's comments without being shown.
func TestDeletingACommentDeletesItsReplies(t *testing.T) {
	f := newFixture(t)
	r := testutil.Request(t, f.app, f.features, f.mara, "Dark mode", "pending", 0)
	c, err := f.app.FindCollectionByNameOrId("comments")
	if err != nil {
		t.Fatal(err)
	}
	save := func(author *core.Record, body, parent string) *core.Record {
		rec := core.NewRecord(c)
		rec.Set("request", r.Id)
		rec.Set("author", author.Id)
		rec.Set("body", body)
		rec.Set("parent", parent)
		if err := f.app.Save(rec); err != nil {
			t.Fatal(err)
		}
		return rec
	}
	top := save(f.mara, "Same on iOS", "")
	save(f.admin, "Thanks, looking into it", top.Id)
	other := save(f.admin, "Another thread", "")

	f.scenario(t, tests.ApiScenario{Method: http.MethodDelete, URL: "/api/collections/comments/records/" + top.Id,
		Headers: map[string]string{"Authorization": testutil.Token(t, f.mara)}, ExpectedStatus: 204},
		func(t *testing.T, app *tests.TestApp) {
			left, err := app.FindAllRecords("comments", dbx.HashExp{"request": r.Id})
			if err != nil {
				t.Fatal(err)
			}
			if len(left) != 1 || left[0].Id != other.Id {
				t.Errorf("comments left = %d, want only the other thread", len(left))
			}
		})
}

// Deleting a request cascades into its comments; replies the hook already removed mustn't trip it.
func TestDeletingARequestWithAThread(t *testing.T) {
	f := newFixture(t)
	r := testutil.Request(t, f.app, f.features, f.mara, "Dark mode", "pending", 0)
	c, err := f.app.FindCollectionByNameOrId("comments")
	if err != nil {
		t.Fatal(err)
	}
	parent := ""
	for _, body := range []string{"Same on iOS", "Thanks"} {
		rec := core.NewRecord(c)
		rec.Set("request", r.Id)
		rec.Set("author", f.mara.Id)
		rec.Set("body", body)
		rec.Set("parent", parent)
		if err := f.app.Save(rec); err != nil {
			t.Fatal(err)
		}
		parent = rec.Id
	}
	su := testutil.Superuser(t, f.app, "root@example.com")
	f.scenario(t, tests.ApiScenario{Method: http.MethodDelete, URL: "/api/collections/requests/records/" + r.Id,
		Headers: map[string]string{"Authorization": testutil.Token(t, su)}, ExpectedStatus: 204},
		func(t *testing.T, app *tests.TestApp) {
			if n, _ := app.CountRecords("comments"); n != 0 {
				t.Errorf("comments left = %d", n)
			}
		})
}

// The team posts for someone in one request: the person (found or created by email) is the
// author and has the automatic vote, or nothing is created at all.
func TestTeamPostsOnBehalfOfSomeone(t *testing.T) {
	f := newFixture(t)
	post := func(auth *core.Record, onBehalf string, status int, want ...string) {
		t.Helper()
		f.scenario(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/collections/requests/records",
			Headers:        map[string]string{"Authorization": testutil.Token(t, auth), "Content-Type": "application/json"},
			Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"Calendar view","onBehalf":"` + onBehalf + `"}`),
			ExpectedStatus: status, ExpectedContent: want}, nil)
	}

	post(f.admin, "priya@example.com", 200, `"upvoteCount":1`)
	priya, err := f.app.FindAuthRecordByEmail("users", "priya@example.com")
	if err != nil {
		t.Fatal(err)
	}
	r, err := f.app.FindFirstRecordByFilter("requests", "author = {:a}", dbx.Params{"a": priya.Id})
	if err != nil {
		t.Fatalf("no request by priya: %v", err)
	}
	if v, _ := f.app.FindFirstRecordByFilter("votes", "request = {:r} && user = {:u}", dbx.Params{"r": r.Id, "u": priya.Id}); v == nil {
		t.Error("priya's automatic vote is missing")
	}
	if v, _ := f.app.FindFirstRecordByFilter("votes", "request = {:r} && user = {:u}", dbx.Params{"r": r.Id, "u": f.admin.Id}); v != nil {
		t.Error("the team member shouldn't have voted")
	}

	before, _ := f.app.CountRecords("requests")
	post(f.admin, "not an email", 400, "email of the person")
	post(f.mara, "priya@example.com", 403, "Only the team")
	if after, _ := f.app.CountRecords("requests"); after != before {
		t.Errorf("requests = %d, want %d: a failed post must leave nothing behind", after, before)
	}
}

func TestClientsCannotWriteStatusTime(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/requests/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"Back-dated","statusChangedAt":"2001-01-01 00:00:00.000Z"}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"title":"Back-dated"`},
	}, func(t *testing.T, app *tests.TestApp) {
		r, err := app.FindFirstRecordByData("requests", "title", "Back-dated")
		if err != nil {
			t.Fatal(err)
		}
		if got := r.GetDateTime("statusChangedAt").Time(); time.Since(got) > time.Minute {
			t.Errorf("statusChangedAt = %s, want about now", got)
		}
	})
	own := testutil.Request(t, f.app, f.features, f.mara, "Mine", "pending", 0)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: "/api/collections/requests/records/" + own.Id,
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"statusChangedAt":"2001-01-01 00:00:00.000Z"}`),
		ExpectedStatus: 404, ExpectedContent: []string{`"data":{}`},
	}, nil)
}

func TestSuperuserStatusEditStampsTime(t *testing.T) {
	f := newFixture(t)
	su := testutil.Superuser(t, f.app, "root@example.com")
	r := testutil.Request(t, f.app, f.features, f.mara, "Old one", "pending", 0)
	testutil.SetStatusTime(t, f.app, r, time.Now().Add(-240*time.Hour))
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: "/api/collections/requests/records/" + r.Id,
		Headers:        map[string]string{"Authorization": testutil.Token(t, su)},
		Body:           strings.NewReader(`{"status":"reviewing"}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"status":"reviewing"`},
	}, func(t *testing.T, app *tests.TestApp) {
		got, _ := app.FindRecordById("requests", r.Id)
		if time.Since(got.GetDateTime("statusChangedAt").Time()) > time.Minute {
			t.Errorf("statusChangedAt = %s", got.GetDateTime("statusChangedAt"))
		}
	})
}

func TestTeamCanCreateStraightIntoARoadmapColumn(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/requests/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.admin)},
		Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"Widgets","roadmapStatus":"progress"}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"status":"progress"`},
	}, func(t *testing.T, app *tests.TestApp) {
		r, err := app.FindFirstRecordByData("requests", "title", "Widgets")
		if err != nil {
			t.Fatal(err)
		}
		acts, _ := app.FindRecordsByFilter("activity", "request = {:r}", "created,@rowid", 0, 0, dbx.Params{"r": r.Id})
		if len(acts) != 2 || acts[0].GetString("kind") != "created" ||
			acts[1].GetString("kind") != "status_changed" || acts[1].GetString("from") != "pending" || acts[1].GetString("to") != "progress" {
			t.Fatalf("activity = %v", acts)
		}
		if acts[1].GetString("actor") != f.admin.Id {
			t.Errorf("status row actor = %s, want the team member", acts[1].GetString("actor"))
		}
		if r.GetInt("upvoteCount") != 1 || !r.GetBool("visible") {
			t.Errorf("votes=%d visible=%v", r.GetInt("upvoteCount"), r.GetBool("visible"))
		}
	})
}

func TestRoadmapStatusOnCreateIsTeamOnlyAndValidated(t *testing.T) {
	f := newFixture(t)
	create := func(token *core.Record, body string, status int, want string) {
		f.scenario(t, tests.ApiScenario{
			Method: http.MethodPost, URL: "/api/collections/requests/records",
			Headers:        map[string]string{"Authorization": testutil.Token(t, token)},
			Body:           strings.NewReader(body),
			ExpectedStatus: status, ExpectedContent: []string{want},
		}, nil)
	}
	board := `"board":"` + f.features.Id + `"`
	create(f.mara, `{`+board+`,"title":"Sneaky","roadmapStatus":"planned"}`, 403, "Only the team can put a request on the roadmap.")
	create(f.admin, `{`+board+`,"title":"Closed one","roadmapStatus":"closed"}`, 400, "Pick Planned or In progress.")
	create(f.admin, `{`+board+`,"title":"Number one","roadmapStatus":3}`, 400, "Pick Planned or In progress.")
	create(f.admin, `{`+board+`,"title":"Empty one","roadmapStatus":""}`, 400, "Pick Planned or In progress.")
	if n, _ := f.app.CountRecords("requests"); n != 0 {
		t.Errorf("%d requests saved by refused creates", n)
	}
}

func TestRoadmapStatusWorksWithOnBehalf(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/requests/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.admin)},
		Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"For Devon","roadmapStatus":"planned","onBehalf":"devon@example.com"}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"status":"planned"`},
	}, func(t *testing.T, app *tests.TestApp) {
		r, _ := app.FindFirstRecordByData("requests", "title", "For Devon")
		devon, err := app.FindAuthRecordByEmail("users", "devon@example.com")
		if err != nil {
			t.Fatal(err)
		}
		if r.GetString("author") != devon.Id {
			t.Errorf("author = %s, want Devon", r.GetString("author"))
		}
		moved, err := app.FindFirstRecordByFilter("activity", "request = {:r} && kind = 'status_changed'", dbx.Params{"r": r.Id})
		if err != nil || moved.GetString("actor") != f.admin.Id {
			t.Errorf("status row = %v, %v; actor should be the team member, not the author", moved, err)
		}
	})
}
