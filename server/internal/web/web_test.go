package web_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/hacker4ofakind/lort/server/internal/testutil"
	"github.com/hacker4ofakind/lort/server/internal/web"
)

func TestProxyForwardsAndExplainsOutages(t *testing.T) {
	next := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "next says hi to "+r.URL.Path)
	}))
	up, _ := url.Parse(next.URL)
	down, _ := url.Parse("http://127.0.0.1:1")

	for _, c := range []struct {
		target *url.URL
		status int
		want   string
	}{{up, 200, "next says hi to /feedback"}, {down, 502, "starting up"}} {
		app := testutil.NewApp(t)
		target := c.target
		app.OnServe().BindFunc(func(se *core.ServeEvent) error {
			se.Router.Any("/{path...}", web.Proxy(target))
			return se.Next()
		})
		(&tests.ApiScenario{
			Method: http.MethodGet, URL: "/feedback", ExpectedStatus: c.status, ExpectedContent: []string{c.want},
			TestAppFactory: func(testing.TB) *tests.TestApp { return app }, DisableTestAppCleanup: true,
		}).Test(t)
	}
}

func TestSuperviseRestarts(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "runs")
	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()
	web.Supervise(ctx, []string{"sh", "-c", "echo x >> " + marker}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	data, _ := os.ReadFile(marker)
	if runs := strings.Count(string(data), "x"); runs < 2 {
		t.Errorf("runs = %d, want at least 2", runs)
	}
}
