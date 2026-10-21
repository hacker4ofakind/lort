package web_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/hacker4ofakind/lort/server/internal/testutil"
	"github.com/hacker4ofakind/lort/server/internal/web"
)

func quiet(string, ...any) {}

func TestProxyForwardsAndExplainsOutages(t *testing.T) {
	next := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "next says hi to "+r.URL.Path+" with "+r.Header.Get(web.ConfigHeader))
	}))
	up, _ := url.Parse(next.URL)
	down, _ := url.Parse("http://127.0.0.1:1")

	for _, c := range []struct {
		target *url.URL
		status int
		want   string
	}{{up, 200, "next says hi to /feedback with real"}, {down, 502, "starting up"}} {
		app := testutil.NewApp(t)
		target := c.target
		app.OnServe().BindFunc(func(se *core.ServeEvent) error {
			se.Router.Any("/{path...}", web.Proxy(target, func() string { return "real" }, web.ProxyOptions{}))
			return se.Next()
		})
		(&tests.ApiScenario{
			Method: http.MethodGet, URL: "/feedback", Headers: map[string]string{web.ConfigHeader: "forged"}, ExpectedStatus: c.status, ExpectedContent: []string{c.want},
			TestAppFactory: func(testing.TB) *tests.TestApp { return app }, DisableTestAppCleanup: true,
		}).Test(t)
	}
}

// serve sends one GET through a proxy to next and returns the response and how long it took.
func serve(t *testing.T, next http.Handler, o web.ProxyOptions) (*httptest.ResponseRecorder, time.Duration) {
	t.Helper()
	srv := httptest.NewServer(next)
	t.Cleanup(srv.Close)
	target, _ := url.Parse(srv.URL)
	h := web.Proxy(target, func() string { return "" }, o)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/feedback", nil)
	started := time.Now()
	e := new(core.RequestEvent)
	e.Response, e.Request = rec, req
	if err := h(e); err != nil {
		t.Fatal(err)
	}
	return rec, time.Since(started)
}

func TestProxyGivesUpOnAHungNext(t *testing.T) {
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	hung := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
		}
	})
	rec, took := serve(t, hung, web.ProxyOptions{HeaderTimeout: 200 * time.Millisecond})
	if rec.Code != http.StatusBadGateway || took > 2*time.Second {
		t.Errorf("status %d after %v, want 502 within the header timeout", rec.Code, took)
	}
}

func TestProxySecurityHeaders(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "ALLOWALL")
		_, _ = io.WriteString(w, "ok")
	})
	rec, _ := serve(t, next, web.ProxyOptions{})
	h := rec.Result().Header
	if h.Get("Referrer-Policy") != "strict-origin-when-cross-origin" || h.Get("X-Content-Type-Options") != "nosniff" ||
		len(h.Values("X-Frame-Options")) != 1 || h.Get("X-Frame-Options") != "SAMEORIGIN" {
		t.Errorf("headers = %v", h)
	}
	if h.Get("Strict-Transport-Security") != "" {
		t.Error("HSTS over plain HTTP without LORT_TLS=auto")
	}
	rec, _ = serve(t, next, web.ProxyOptions{HSTS: true})
	if !strings.HasPrefix(rec.Result().Header.Get("Strict-Transport-Security"), "max-age=") {
		t.Errorf("HSTS missing: %v", rec.Result().Header)
	}
}

func TestSuperviseRestarts(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "runs")
	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()
	web.Supervise(ctx, []string{"sh", "-c", "echo x >> '" + filepath.ToSlash(marker) + "'"}, web.Options{Grace: time.Second, Logf: quiet})
	data, _ := os.ReadFile(marker)
	if runs := strings.Count(string(data), "x"); runs < 2 {
		t.Errorf("runs = %d, want at least 2", runs)
	}
}

func TestSuperviseKeepsSecretsFromNext(t *testing.T) {
	t.Setenv("LORT_ENCRYPTION_KEY", "abcdefghijklmnopqrstuvwxyz012345")
	t.Setenv("LORT_ADMIN_PASSWORD", "correcthorse")
	t.Setenv("HOSTNAME", "3f2a1b0c9d8e")
	t.Setenv("LORT_URL", "https://feedback.driftnote.app")
	out := filepath.Join(t.TempDir(), "env")
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		web.Supervise(ctx, []string{"sh", "-c", "env > '" + filepath.ToSlash(out) + "'; sleep 5"}, web.Options{Grace: time.Second, Logf: quiet})
		close(done)
	}()
	deadline := time.Now().Add(5 * time.Second)
	var env string
	for time.Now().Before(deadline) {
		if b, _ := os.ReadFile(out); strings.Contains(string(b), "LORT_URL=") {
			env = string(b)
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	cancel()
	<-done
	if env == "" {
		t.Fatal("Next never started")
	}
	for _, secret := range []string{"LORT_ENCRYPTION_KEY", "LORT_ADMIN_PASSWORD", "correcthorse"} {
		if strings.Contains(env, secret) {
			t.Errorf("Next can see %s", secret)
		}
	}
	if !strings.Contains(env, "\nHOSTNAME=127.0.0.1\n") && !strings.HasPrefix(env, "HOSTNAME=127.0.0.1\n") {
		t.Errorf("HOSTNAME isn't 127.0.0.1:\n%s", env)
	}
}

func TestSuperviseStopsGracefully(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("SIGTERM needs Unix")
	}
	for _, c := range []struct {
		name, script string
		killed       bool
	}{
		{"traps SIGTERM", `trap 'exit 0' TERM; while :; do sleep 0.05; done`, false},
		{"ignores SIGTERM", `trap '' TERM; while :; do sleep 0.05; done`, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			res := make(chan web.Result, 1)
			go func() {
				res <- web.Supervise(ctx, []string{"sh", "-c", c.script}, web.Options{Grace: 300 * time.Millisecond, Logf: quiet})
			}()
			time.Sleep(300 * time.Millisecond) // let it start and set its trap
			stopped := time.Now()
			cancel()
			select {
			case r := <-res:
				if r.Killed != c.killed {
					t.Errorf("Killed = %v, want %v", r.Killed, c.killed)
				}
				if took := time.Since(stopped); took > 2*time.Second {
					t.Errorf("took %v to stop", took)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("Supervise never returned")
			}
		})
	}
}
