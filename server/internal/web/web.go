// Package web proxies page requests to the Next.js server and keeps that server running.
package web

import (
	"context"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const unavailable = `<!doctype html><meta charset="utf-8"><title>Starting up</title>
<body style="font-family:system-ui;background:#1a1716;color:#f5efea;display:grid;place-items:center;height:100vh;margin:0">
<p>The board is starting up. Refresh in a few seconds.</p>`

// ConfigHeader carries the board's public config to Next.js. The proxy always overwrites it,
// so a visitor can't send their own.
const ConfigHeader = "X-Lort-Config"

// PageHeader carries what a changelog post's page needs for link previews (PageMeta). The proxy
// always removes a visitor's copy and sets it only for those pages.
const PageHeader = "X-Lort-Page"

// DefaultHeaderTimeout is how long a page may take to start answering before the visitor
// gets the "starting up" page instead of waiting on a hung Next.
const DefaultHeaderTimeout = 20 * time.Second

type ProxyOptions struct {
	HeaderTimeout time.Duration // 0 means DefaultHeaderTimeout
	HSTS          bool          // Lort terminates HTTPS itself (LORT_TLS=auto)
	// Page returns the PageHeader value for a path, or "" for none. nil sends none.
	Page func(path string) string
}

// Proxy returns a handler that forwards everything to target, with config() in ConfigHeader.
func Proxy(target *url.URL, config func() string, o ProxyOptions) func(*core.RequestEvent) error {
	if o.HeaderTimeout == 0 {
		o.HeaderTimeout = DefaultHeaderTimeout
	}
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.ResponseHeaderTimeout = o.HeaderTimeout
	t.MaxIdleConns = 64
	t.MaxIdleConnsPerHost = 64

	p := httputil.NewSingleHostReverseProxy(target)
	p.Transport = t
	p.ModifyResponse = func(res *http.Response) error {
		secure(res.Header, o.HSTS || res.Request.TLS != nil)
		return nil
	}
	p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, _ error) {
		secure(w.Header(), o.HSTS || r.TLS != nil)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Retry-After", "5")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(unavailable))
	}
	return func(e *core.RequestEvent) error {
		e.Request.Header.Del(ConfigHeader)
		if v := config(); v != "" {
			e.Request.Header.Set(ConfigHeader, v)
		}
		e.Request.Header.Del(PageHeader)
		if o.Page != nil {
			if v := o.Page(e.Request.URL.Path); v != "" {
				e.Request.Header.Set(PageHeader, v)
			}
		}
		// The proxy adds Next's headers to these, so drop PocketBase's copies and let
		// secure() set each one once.
		for _, k := range securityHeaders {
			e.Response.Header().Del(k)
		}
		p.ServeHTTP(e.Response, e.Request)
		return nil
	}
}

var securityHeaders = []string{"X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Strict-Transport-Security"}

func secure(h http.Header, hsts bool) {
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("X-Frame-Options", "SAMEORIGIN")
	h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
	if hsts {
		h.Set("Strict-Transport-Security", "max-age=31536000")
	} else {
		h.Del("Strict-Transport-Security")
	}
}

// Options tune Supervise.
type Options struct {
	Grace time.Duration                 // how long Next gets to exit after SIGTERM; 0 means 5s
	Logf  func(format string, a ...any) // nil means the standard logger (stderr)
}

// Result says how the last run of the command ended.
type Result struct {
	Killed bool // it didn't stop within the grace period and was killed
}

// hidden never reach Next. It runs as the same user, so this is hygiene, not isolation.
var hidden = []string{"LORT_ENCRYPTION_KEY=", "LORT_ADMIN_PASSWORD="}

// Supervise runs cmd until ctx ends, restarting it with backoff (1s doubling to 30s)
// whenever it exits. A run that lasted over a minute resets the backoff. When ctx ends it
// sends SIGTERM, kills the command after the grace period, and returns once it has exited.
func Supervise(ctx context.Context, cmd []string, o Options) Result {
	if o.Grace == 0 {
		o.Grace = 5 * time.Second
	}
	if o.Logf == nil {
		o.Logf = log.Printf
	}
	backoff := time.Second
	for ctx.Err() == nil {
		started := time.Now()
		res, err := run(ctx, cmd, o.Grace)
		if ctx.Err() != nil {
			return res
		}
		if time.Since(started) > time.Minute {
			backoff = time.Second
		}
		o.Logf("The web server exited (%v). Restarting it in %s.", err, backoff)
		select {
		case <-ctx.Done():
			return Result{}
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, 30*time.Second)
	}
	return Result{}
}

func run(ctx context.Context, cmd []string, grace time.Duration) (Result, error) {
	c := exec.Command(cmd[0], cmd[1:]...)
	c.Stdout, c.Stderr = os.Stdout, os.Stderr
	c.Env = childEnv(os.Environ())
	if err := c.Start(); err != nil {
		return Result{}, err
	}
	done := make(chan error, 1)
	go func() { done <- c.Wait() }()
	select {
	case err := <-done:
		return Result{}, err
	case <-ctx.Done():
	}
	if err := c.Process.Signal(syscall.SIGTERM); err != nil { // Windows has no SIGTERM
		_ = c.Process.Kill()
		<-done
		return Result{Killed: true}, nil
	}
	select {
	case <-done:
		return Result{}, nil
	case <-time.After(grace):
		_ = c.Process.Kill()
		<-done
		return Result{Killed: true}, nil
	}
}

// childEnv is the environment for Next: without the secrets, and with HOSTNAME last because
// Docker sets HOSTNAME to the container id and the last duplicate wins.
func childEnv(env []string) []string {
	out := make([]string, 0, len(env)+2)
	for _, kv := range env {
		if strings.HasPrefix(kv, "HOSTNAME=") || strings.HasPrefix(kv, "PORT=") {
			continue
		}
		if !hasAnyPrefix(kv, hidden) {
			out = append(out, kv)
		}
	}
	return append(out, "PORT=3000", "HOSTNAME=127.0.0.1")
}

func hasAnyPrefix(s string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}
