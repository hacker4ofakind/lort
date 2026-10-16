// Package web proxies page requests to the Next.js server and keeps that server running.
package web

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const unavailable = `<!doctype html><meta charset="utf-8"><title>Starting up</title>
<body style="font-family:system-ui;background:#1a1716;color:#f5efea;display:grid;place-items:center;height:100vh;margin:0">
<p>The board is starting up. Refresh in a few seconds.</p>`

// ConfigHeader carries the board's branding from the Go server to Next.js. The proxy always
// replaces it, so a visitor can't send their own.
const ConfigHeader = "X-Lort-Config"

// Proxy returns a handler that forwards everything to target, adding config() as ConfigHeader.
func Proxy(target *url.URL, config func() string) func(*core.RequestEvent) error {
	p := httputil.NewSingleHostReverseProxy(target)
	p.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, _ error) {
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
		p.ServeHTTP(e.Response, e.Request)
		return nil
	}
}

// Supervise runs cmd until ctx ends, restarting it with backoff (1s doubling to 30s)
// whenever it exits. A run that lasted over a minute resets the backoff.
func Supervise(ctx context.Context, cmd []string, log *slog.Logger) {
	backoff := time.Second
	for ctx.Err() == nil {
		started := time.Now()
		c := exec.CommandContext(ctx, cmd[0], cmd[1:]...)
		c.Stdout, c.Stderr = os.Stdout, os.Stderr
		c.Env = append(os.Environ(), "HOSTNAME=127.0.0.1", "PORT=3000")
		err := c.Run()
		if ctx.Err() != nil {
			return
		}
		if time.Since(started) > time.Minute {
			backoff = time.Second
		}
		// String it: PocketBase's JSON log store can't encode a time.Duration and drops the line.
		log.Warn("web server exited, restarting", "err", err, "in", backoff.String())
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, 30*time.Second)
	}
}
