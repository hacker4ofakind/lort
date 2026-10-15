// Package config reads Lort's environment.
package config

import (
	"net/url"
	"os"
	"strings"
)

type Config struct {
	URL           string // public URL, e.g. https://feedback.driftnote.app
	TLS           string // "auto": Lort serves :80/:443 with Let's Encrypt; "off": plain HTTP on :4052
	DataDir       string
	WebURL        string   // where the Next.js server listens
	WebCmd        []string // how to start it; empty means it is run separately (development)
	AdminEmail    string
	AdminPassword string
	PBAdmin       bool // expose PocketBase's own admin UI at /_/
}

func FromEnv() Config {
	c := Config{
		URL:           strings.TrimRight(env("LORT_URL", "http://localhost:4052"), "/"),
		TLS:           env("LORT_TLS", "off"),
		DataDir:       env("LORT_DATA", "./pb_data"),
		WebURL:        env("LORT_WEB_URL", "http://127.0.0.1:3000"),
		AdminEmail:    os.Getenv("LORT_ADMIN_EMAIL"),
		AdminPassword: os.Getenv("LORT_ADMIN_PASSWORD"),
		PBAdmin:       os.Getenv("LORT_PB_ADMIN") == "1",
	}
	if cmd := os.Getenv("LORT_WEB_CMD"); cmd != "" {
		c.WebCmd = strings.Fields(cmd)
	}
	return c
}

// ServeArgs are the PocketBase serve arguments for this config.
// With TLS on, PocketBase's built-in autocert gets and renews the certificate.
func (c Config) ServeArgs() []string {
	if c.TLS == "auto" {
		host := c.URL
		if u, err := url.Parse(c.URL); err == nil && u.Host != "" {
			host = u.Hostname()
		}
		return []string{"serve", "--http=0.0.0.0:80", "--https=0.0.0.0:443", host}
	}
	return []string{"serve", "--http=0.0.0.0:4052"}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
