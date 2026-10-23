package api_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/hacker4ofakind/lort/server/internal/api"
	"github.com/hacker4ofakind/lort/server/internal/changelog"
	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/site"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

type fixture struct {
	app         *tests.TestApp
	board, mara *core.Record
	su          *core.Record
	req         *core.Record
}

func newFixture(t testing.TB) *fixture {
	app := testutil.NewApp(t)
	requests.BindStatusTime(app)
	svc := requests.New(app)
	changelog.Bind(app)
	cl := changelog.New(app)
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		api.Register(se, api.Deps{Svc: svc, Changelog: cl, Cfg: config.Config{URL: "https://f.example"}, Site: site.NewCache(app)})
		return se.Next()
	})
	f := &fixture{app: app}
	f.board = testutil.Board(t, app, "Features", true, false)
	f.mara = testutil.User(t, app, "mara@example.com")
	f.su = testutil.Superuser(t, app, "luk@driftnote.app")
	f.req = testutil.Request(t, app, f.board, f.mara, "Dark mode for the editor", "reviewing", 0)
	return f
}

func (f *fixture) run(t *testing.T, s tests.ApiScenario) {
	s.TestAppFactory = func(testing.TB) *tests.TestApp { return f.app }
	s.DisableTestAppCleanup = true
	s.Test(t)
}

func TestPublicEndpoints(t *testing.T) {
	f := newFixture(t)
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/health", ExpectedStatus: 200, ExpectedContent: []string{`"ok":true`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/config", ExpectedStatus: 200,
		ExpectedContent: []string{`"primaryColor":"#cc3a6d"`, `"name":"Features"`, `"email":false`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/requests?status=reviewing&sort=top", ExpectedStatus: 200,
		ExpectedContent: []string{`"title":"Dark mode for the editor"`, `"totalItems":1`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/similar?q=dark", ExpectedStatus: 200,
		ExpectedContent: []string{`"Dark mode for the editor"`}})
}

func TestVoteNeedsAUser(t *testing.T) {
	f := newFixture(t)
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/vote", ExpectedStatus: 401, ExpectedContent: []string{`"data":{}`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/vote",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		ExpectedStatus: 200, ExpectedContent: []string{`"voted":true`, `"votes":1`}})
}

func TestTriageIsTeamOnly(t *testing.T) {
	f := newFixture(t)
	body := `{"action":"roadmap"}`
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/status",
		Headers: map[string]string{"Authorization": testutil.Token(t, f.mara)}, Body: strings.NewReader(body),
		ExpectedStatus: 403, ExpectedContent: []string{`"data":{}`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/status",
		Headers: map[string]string{"Authorization": testutil.Token(t, f.su)}, Body: strings.NewReader(body),
		ExpectedStatus: 200, ExpectedContent: []string{`"to":"planned"`, `"roadmap":"added"`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/status",
		Headers: map[string]string{"Authorization": testutil.Token(t, f.su)}, Body: strings.NewReader(`{"action":"complete"}`),
		ExpectedStatus: 400, ExpectedContent: []string{"not available"}})
}

func TestTeamMeReturnsProfileToken(t *testing.T) {
	f := newFixture(t)
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/team/me",
		Headers: map[string]string{"Authorization": testutil.Token(t, f.su)}, ExpectedStatus: 200,
		ExpectedContent: []string{`"isAdmin":true`, `"token":"`}})
}

func TestTeamInviteAndResetLink(t *testing.T) {
	f := newFixture(t)
	auth := map[string]string{"Authorization": testutil.Token(t, f.su)}
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/team/invite", Headers: auth,
		Body: strings.NewReader(`{"email":"sofia@driftnote.app"}`), ExpectedStatus: 200,
		ExpectedContent: []string{`https://f.example/dashboard/invite?token=`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/users/" + f.mara.Id + "/reset-link", Headers: auth,
		ExpectedStatus: 200, ExpectedContent: []string{`https://f.example/reset-password?token=`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/users/" + f.mara.Id, Headers: auth,
		ExpectedStatus: 200, ExpectedContent: []string{`"email":"mara@example.com"`, `"requests":1`}})
}

func TestRequestDetailEndpoint(t *testing.T) {
	f := newFixture(t)
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/requests/" + f.req.Id, ExpectedStatus: 200,
		ExpectedContent: []string{`"title":"Dark mode for the editor"`, `"thread":[]`, `"comments":0`, `"public":true`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/requests/missing", ExpectedStatus: 404,
		ExpectedContent: []string{"That request is gone."}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/requests/" + f.req.Id,
		Headers: map[string]string{"Authorization": testutil.Token(t, f.su)}, ExpectedStatus: 200,
		ExpectedContent: []string{`"voted":false`, `"new":true`}})
}

func TestDashboardEndpoints(t *testing.T) {
	f := newFixture(t)
	auth := map[string]string{"Authorization": testutil.Token(t, f.su)}
	bugs := testutil.Board(t, f.app, "Bugs", true, false)

	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/stats", ExpectedStatus: 401, ExpectedContent: []string{`"data":{}`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/stats", Headers: auth, ExpectedStatus: 200,
		ExpectedContent: []string{`"total":1`, `"waiting":1`, `"new":1`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/queue?status=reviewing&current=" + f.req.Id, Headers: auth,
		ExpectedStatus: 200, ExpectedContent: []string{`"position":1`, `"total":1`, `"next":""`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/board", Headers: auth,
		Body: strings.NewReader(`{"board":"` + bugs.Id + `"}`), ExpectedStatus: 204})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/author", Headers: auth,
		Body: strings.NewReader(`{"email":"nope"}`), ExpectedStatus: 400, ExpectedContent: []string{"email address"}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/order/boards", Headers: auth,
		Body: strings.NewReader(`{"ids":["` + bugs.Id + `","` + f.board.Id + `"]}`), ExpectedStatus: 204})
	f.run(t, tests.ApiScenario{Method: http.MethodDelete, URL: "/api/lort/boards/" + bugs.Id, Headers: auth,
		ExpectedStatus: 400, ExpectedContent: []string{"Move this board"}})
	f.run(t, tests.ApiScenario{Method: http.MethodDelete, URL: "/api/lort/boards/" + bugs.Id + "?moveTo=" + f.board.Id, Headers: auth,
		ExpectedStatus: 204})
}

func (f *fixture) setRoadmapPublic(t *testing.T, on bool) {
	t.Helper()
	settings, err := f.app.FindFirstRecordByFilter("settings", "")
	if err != nil {
		t.Fatal(err)
	}
	settings.Set("roadmapPublic", on)
	if err := f.app.Save(settings); err != nil {
		t.Fatal(err)
	}
}

func TestRoadmapOffAnswers404ExceptToTheTeam(t *testing.T) {
	f := newFixture(t)
	testutil.Request(t, f.app, f.board, f.mara, "Planned one", "planned", 0)
	f.setRoadmapPublic(t, false)
	const off = "There's no public roadmap yet."
	for url, ok := range map[string]string{"/api/lort/roadmap": `"planned":[`, "/api/lort/roadmap/shipped": `"items":`} {
		f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: url, ExpectedStatus: 404, ExpectedContent: []string{off}})
		f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: url, Headers: map[string]string{"Authorization": testutil.Token(t, f.mara)},
			ExpectedStatus: 404, ExpectedContent: []string{off}})
		f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: url, Headers: map[string]string{"Authorization": testutil.Token(t, f.su)},
			ExpectedStatus: 200, ExpectedContent: []string{ok}})
	}
}

func TestRoadmapEndpointShapeHeadersAndBodies(t *testing.T) {
	f := newFixture(t)
	r := testutil.Request(t, f.app, f.board, f.mara, "Planned one", "planned", 0)
	r.Set("body", "SECRET-LONG-DESCRIPTION")
	if err := f.app.Save(r); err != nil {
		t.Fatal(err)
	}
	s := tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/roadmap", ExpectedStatus: 200,
		ExpectedContent:    []string{`"planned":[`, `"progress":[]`, `"completed":[]`, `"shipped":0`, `"title":"Planned one"`, `"body":""`, `"statusChangedAt":"`},
		NotExpectedContent: []string{"SECRET-LONG-DESCRIPTION"},
		AfterTestFunc: func(t testing.TB, _ *tests.TestApp, res *http.Response) {
			if got := res.Header.Get("Cache-Control"); got != "private, no-store" {
				t.Errorf("Cache-Control = %q", got)
			}
			if got := res.Header.Get("Vary"); !strings.Contains(got, "Authorization") {
				t.Errorf("Vary = %q", got)
			}
		}}
	f.run(t, s)
}

func TestRoadmapTeamViewComesFromSuperuserAuthOnly(t *testing.T) {
	f := newFixture(t)
	hidden := testutil.Request(t, f.app, f.board, f.mara, "Hidden plan", "planned", 0)
	hidden.Set("visible", false)
	if err := f.app.Save(hidden); err != nil {
		t.Fatal(err)
	}
	admin := testutil.User(t, f.app, "luk-profile@driftnote.app")
	admin.Set("isAdmin", true)
	if err := f.app.Save(admin); err != nil {
		t.Fatal(err)
	}
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/roadmap?team=true",
		Headers:            map[string]string{"Authorization": testutil.Token(t, admin)},
		ExpectedStatus:     200,
		ExpectedContent:    []string{`"planned":[]`},
		NotExpectedContent: []string{"Hidden plan"}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/roadmap",
		Headers:         map[string]string{"Authorization": testutil.Token(t, f.su)},
		ExpectedStatus:  200,
		ExpectedContent: []string{`"title":"Hidden plan"`, `"visible":false`}})
}

func TestShippedEndpointPages(t *testing.T) {
	f := newFixture(t)
	for i := 0; i < 22; i++ {
		r := testutil.Request(t, f.app, f.board, f.mara, "Shipped number "+string(rune('a'+i)), "completed", 0)
		testutil.SetStatusTime(t, f.app, r, time.Now().Add(-time.Duration(i+1)*time.Hour))
	}
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/roadmap/shipped", ExpectedStatus: 200,
		ExpectedContent: []string{`"totalItems":22`, `"perPage":20`, `"title":"Shipped number a"`}, NotExpectedContent: []string{"Shipped number v"}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/roadmap/shipped?page=2", ExpectedStatus: 200,
		ExpectedContent: []string{`"title":"Shipped number v"`}, NotExpectedContent: []string{"Shipped number a"}})
}

func TestRoadmapMoveRoute(t *testing.T) {
	f := newFixture(t)
	r := testutil.Request(t, f.app, f.board, f.mara, "Calendar", "planned", 0)
	url := "/api/lort/requests/" + r.Id + "/roadmap"
	su := map[string]string{"Authorization": testutil.Token(t, f.su)}

	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: url, Body: strings.NewReader(`{"from":"planned","to":"progress"}`),
		ExpectedStatus: 401, ExpectedContent: []string{`"data":{}`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: url, Body: strings.NewReader(`{"from":"planned","to":"progress"}`),
		Headers: map[string]string{"Authorization": testutil.Token(t, f.mara)}, ExpectedStatus: 403, ExpectedContent: []string{`"data":{}`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: url, Body: strings.NewReader(`{"from":"planned","to":"reviewing"}`),
		Headers: su, ExpectedStatus: 400, ExpectedContent: []string{"Pick Planned, In progress or Completed."}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: url, Body: strings.NewReader(`{"from":"planned","to":"progress"}`),
		Headers: su, ExpectedStatus: 200, ExpectedContent: []string{`"from":"planned"`, `"to":"progress"`}})
	// The same drag again from a board that still shows Planned: someone moved it meanwhile.
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: url, Body: strings.NewReader(`{"from":"planned","to":"completed"}`),
		Headers: su, ExpectedStatus: 409, ExpectedContent: []string{"Someone moved that card meanwhile."}})
	// After a triage away from the roadmap.
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/roadmap",
		Body: strings.NewReader(`{"from":"planned","to":"progress"}`), Headers: su,
		ExpectedStatus: 400, ExpectedContent: []string{"isn't on the roadmap any more"}})
}
