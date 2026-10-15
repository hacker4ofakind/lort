package hooks_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

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
