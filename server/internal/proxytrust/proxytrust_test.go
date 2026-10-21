package proxytrust_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/proxytrust"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestIsTrustedPeer(t *testing.T) {
	for ip, want := range map[string]bool{
		"127.0.0.1": true, "10.1.2.3": true, "172.16.0.9": true, "172.31.255.1": true, "192.168.1.1": true,
		"100.64.0.1": true, "::1": true, "fd00::1": true, "::ffff:10.0.0.1": true,
		"172.32.0.1": false, "8.8.8.8": false, "192.0.2.1": false, "2001:db8::1": false, "100.128.0.1": false,
	} {
		if got := proxytrust.IsTrustedPeer(netip.MustParseAddr(ip)); got != want {
			t.Errorf("%s = %v, want %v", ip, got, want)
		}
	}
}

// server is PocketBase's router with the trust middleware and an /echo route that answers
// with the address PocketBase decided on.
type server struct{ mux http.Handler }

func newServer(t *testing.T, app core.App, trust bool) server {
	t.Helper()
	r, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	r.Bind(proxytrust.Middleware(trust))
	r.GET("/echo", func(re *core.RequestEvent) error { return re.String(200, re.RealIP()) })
	mux, err := r.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return server{mux}
}

// call sends one request from peer, carrying an X-Forwarded-For value.
func (s server) call(peer, xff, method, url, body string) (int, string) {
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.RemoteAddr = netip.AddrPortFrom(netip.MustParseAddr(peer), 4000).String()
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", xff)
	rec := httptest.NewRecorder()
	s.mux.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String()
}

func expanded(ip string) string { return netip.MustParseAddr(ip).StringExpanded() }

func TestTrustOffIgnoresForgedHeader(t *testing.T) {
	app := testutil.NewApp(t)
	if err := proxytrust.TrustProxy(app, false); err != nil {
		t.Fatal(err)
	}
	for _, peer := range []string{"127.0.0.1", "8.8.8.8"} {
		if _, got := newServer(t, app, false).call(peer, "1.2.3.4", "GET", "/echo", ""); got != expanded(peer) {
			t.Errorf("peer %s: real IP = %q, want the peer", peer, got)
		}
	}
}

func TestTrustOnUsesRightmostEntryFromPrivatePeers(t *testing.T) {
	app := testutil.NewApp(t)
	if err := proxytrust.TrustProxy(app, true); err != nil {
		t.Fatal(err)
	}
	for _, peer := range []string{"127.0.0.1", "10.0.0.2", "172.16.5.5", "192.168.0.10", "::1", "fd12::3"} {
		if _, got := newServer(t, app, true).call(peer, "6.6.6.6, 9.9.9.9", "GET", "/echo", ""); got != expanded("9.9.9.9") {
			t.Errorf("peer %s: real IP = %q, want 9.9.9.9", peer, got)
		}
	}
	if _, got := newServer(t, app, true).call("8.8.8.8", "9.9.9.9", "GET", "/echo", ""); got != expanded("8.8.8.8") {
		t.Errorf("public peer: real IP = %q, want the peer", got)
	}
}

func TestForgedHeadersDontDodgeTheAuthLimit(t *testing.T) {
	app := testutil.NewApp(t)
	if err := proxytrust.TrustProxy(app, true); err != nil {
		t.Fatal(err)
	}
	body := `{"identity":"nobody@lort.test","password":"wrong-password"}`
	attempts := func(peer string) int {
		srv := newServer(t, app, true)
		var last int
		for i := range 6 {
			last, _ = srv.call(peer, fmt.Sprintf("1.2.%d.%d", len(peer), i+1), "POST", "/api/collections/_superusers/auth-with-password", body)
		}
		return last
	}
	if got := attempts("8.8.8.8"); got != http.StatusTooManyRequests {
		t.Errorf("public peer, sixth attempt = %d, want 429", got)
	}
	// The control: through a trusted proxy each forwarded client has its own bucket.
	if got := attempts("10.0.0.2"); got == http.StatusTooManyRequests {
		t.Errorf("trusted proxy, sixth attempt = %d, want each client counted apart", got)
	}
}

func TestSwitchingToHTTPSClearsStoredHeaders(t *testing.T) {
	app := testutil.NewApp(t)
	if err := proxytrust.TrustProxy(app, true); err != nil {
		t.Fatal(err)
	}
	if h := app.Settings().TrustedProxy.Headers; len(h) != 1 || h[0] != "X-Forwarded-For" || app.Settings().TrustedProxy.UseLeftmostIP {
		t.Fatalf("headers = %v", app.Settings().TrustedProxy)
	}
	if err := proxytrust.TrustProxy(app, false); err != nil {
		t.Fatal(err)
	}
	if err := app.ReloadSettings(); err != nil {
		t.Fatal(err)
	}
	if h := app.Settings().TrustedProxy.Headers; len(h) != 0 {
		t.Fatalf("stored headers after switching = %v", h)
	}
	if _, got := newServer(t, app, false).call("127.0.0.1", "9.9.9.9", "GET", "/echo", ""); got != expanded("127.0.0.1") {
		t.Errorf("real IP after switching = %q", got)
	}
	if err := proxytrust.TrustProxy(app, true); err != nil {
		t.Fatal(err)
	}
	_ = app.ReloadSettings()
	if h := app.Settings().TrustedProxy.Headers; len(h) != 1 {
		t.Fatalf("stored headers after switching back = %v", h)
	}
}
