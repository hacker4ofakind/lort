package api_test

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/hacker4ofakind/lort/server/internal/api"
	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/requests"
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
	svc := requests.New(app)
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		api.Register(se, api.Deps{Svc: svc, Cfg: config.Config{URL: "https://f.example"}})
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

func TestRequestPage(t *testing.T) {
	f := newFixture(t)
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/requests/" + f.req.Id, ExpectedStatus: 200,
		ExpectedContent: []string{`"title":"Dark mode for the editor"`, `"thread":[]`, `"comments":0`, `"activity":[]`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/requests/nope", ExpectedStatus: 404,
		ExpectedContent: []string{"That request is gone."}})
}

func TestMoveBoardAndStatsAreTeamOnly(t *testing.T) {
	f := newFixture(t)
	bugs := testutil.Board(t, f.app, "Bugs", true, false)
	body := `{"board":"` + bugs.Id + `"}`
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/board",
		Headers: map[string]string{"Authorization": testutil.Token(t, f.mara)}, Body: strings.NewReader(body),
		ExpectedStatus: 403, ExpectedContent: []string{`"data":{}`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/board",
		Headers: map[string]string{"Authorization": testutil.Token(t, f.su)}, Body: strings.NewReader(body),
		ExpectedStatus: 204})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/stats",
		Headers: map[string]string{"Authorization": testutil.Token(t, f.su)}, ExpectedStatus: 200,
		ExpectedContent: []string{`"total":1`, `"waiting":1`, `"new":1`}})
}

func TestBrandHeaderIsBase64JSON(t *testing.T) {
	f := newFixture(t)
	raw, err := base64.StdEncoding.DecodeString(api.BrandHeader(f.app))
	if err != nil {
		t.Fatal(err)
	}
	var b api.Brand
	if err := json.Unmarshal(raw, &b); err != nil || b.PrimaryColor != "#cc3a6d" || b.AppName != "My app" {
		t.Fatalf("brand = %+v, %v", b, err)
	}
}
