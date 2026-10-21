package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/hacker4ofakind/lort/server/internal/config"
)

// healthcheck is the image's HEALTHCHECK: it asks this container's own server for
// /api/lort/health and for one page proxied to Next, so a hung Next counts as unhealthy.
// With LORT_TLS=auto it connects over HTTPS to 127.0.0.1 with the board's name, without
// checking the certificate (that check belongs to visitors' browsers).
func healthcheck([]string) int {
	cfg := config.FromEnv()
	base, client := "http://127.0.0.1:4052", &http.Client{Timeout: 8 * time.Second}
	if cfg.TLS == "auto" {
		host := cfg.URL
		if u, err := url.Parse(cfg.URL); err == nil {
			host = u.Hostname()
		}
		base = "https://127.0.0.1:443"
		client.Transport = &http.Transport{TLSClientConfig: &tls.Config{ServerName: host, InsecureSkipVerify: true}} //nolint:gosec // see above
	}
	for _, path := range []string{"/api/lort/health", "/feedback"} {
		res, err := client.Get(base + path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "%s: %v\n", path, err)
			return 1
		}
		_, _ = io.Copy(io.Discard, res.Body)
		_ = res.Body.Close()
		if res.StatusCode != http.StatusOK {
			fmt.Fprintf(os.Stderr, "%s: %s\n", path, res.Status)
			return 1
		}
	}
	return 0
}
