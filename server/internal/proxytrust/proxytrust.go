// Package proxytrust decides when Lort believes X-Forwarded-For. Behind the owner's reverse
// proxy (LORT_TLS=off) the header carries the visitor's address, but only a proxy on this
// machine or a private network can be the one that set it. From anywhere else, and always
// with LORT_TLS=auto, the header is dropped so nobody can dodge the per-IP rate limits.
package proxytrust

import (
	"net"
	"net/netip"
	"slices"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

// Header is the one header Lort reads the visitor's address from.
const Header = "X-Forwarded-For"

// MiddlewarePriority runs before the activity logger and the rate limiter, so neither ever
// sees a header Lort doesn't trust.
const MiddlewarePriority = apis.DefaultRateLimitMiddlewarePriority - 50

var cgnat = netip.MustParsePrefix("100.64.0.0/10")

// IsTrustedPeer reports whether a direct peer may set X-Forwarded-For: loopback, RFC 1918,
// IPv6 unique local addresses and carrier-grade NAT (Tailscale and similar).
func IsTrustedPeer(a netip.Addr) bool {
	a = a.Unmap()
	return a.IsLoopback() || a.IsPrivate() || cgnat.Contains(a)
}

// TrustProxy stores whether PocketBase reads the visitor's address from X-Forwarded-For
// (its rightmost entry, the one the owner's proxy appended). PocketBase keeps this setting in
// the database, so trust=false clears it: a board moved from proxy mode to HTTPS must stop
// believing the header.
func TrustProxy(app core.App, trust bool) error {
	var want []string
	if trust {
		want = []string{Header}
	}
	s := app.Settings()
	if slices.Equal(s.TrustedProxy.Headers, want) && !s.TrustedProxy.UseLeftmostIP {
		return nil
	}
	s.TrustedProxy.Headers = want
	s.TrustedProxy.UseLeftmostIP = false
	return app.Save(s)
}

// Middleware drops X-Forwarded-For unless trust is on and the direct peer is trusted.
func Middleware(trust bool) *hook.Handler[*core.RequestEvent] {
	return &hook.Handler[*core.RequestEvent]{
		Id:       "lortProxyTrust",
		Priority: MiddlewarePriority,
		Func: func(e *core.RequestEvent) error {
			if !trust || !trustedRemote(e.Request.RemoteAddr) {
				e.Request.Header.Del(Header)
			}
			return e.Next()
		},
	}
}

func trustedRemote(remote string) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		host = remote
	}
	a, err := netip.ParseAddr(host)
	return err == nil && IsTrustedPeer(a)
}
