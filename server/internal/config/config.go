// Package config reads Lort's environment.
package config

import (
	"errors"
	"fmt"
	"io/fs"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// EncryptionEnv holds the key PocketBase encrypts the settings with.
const EncryptionEnv = "LORT_ENCRYPTION_KEY"

// KeyLength is the length PocketBase's AES-256 settings encryption needs.
const KeyLength = 32

type Config struct {
	URL           string // public URL, e.g. https://feedback.driftnote.app
	TLS           string // "auto": Lort serves :80/:443 with Let's Encrypt; "off": plain HTTP on :4052
	EncryptionKey string // empty only for local development with LORT_TLS=off
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
		EncryptionKey: os.Getenv(EncryptionEnv),
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

// BehindProxy reports whether Lort serves plain HTTP behind the owner's reverse proxy.
func (c Config) BehindProxy() bool { return c.TLS == "off" }

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

// SettingError is a setting Lort refuses to start with. Var is the .env line to fix and
// Problem says what's wrong with it; setup shows Problem alone.
type SettingError struct {
	Var     string
	Problem string
}

func (e *SettingError) Error() string {
	return e.Problem + " Fix the " + e.Var + " line in .env, then start Lort again."
}

func refuse(v, format string, a ...any) error {
	return &SettingError{Var: v, Problem: fmt.Sprintf(format, a...)}
}

// Check refuses settings Lort can't run with, saying what to change.
func (c Config) Check() error {
	u, err := url.Parse(c.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" ||
		(u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" || u.User != nil ||
		(c.TLS == "auto" && u.Port() != "") {
		return refuse("LORT_URL", "LORT_URL should be the board's full address, like https://feedback.yoursite.com (it's %q).", c.URL)
	}
	switch c.TLS {
	case "off":
	case "auto":
		host := u.Hostname()
		if host == "localhost" || strings.HasSuffix(host, ".localhost") {
			return refuse("LORT_TLS", "Let's Encrypt can't give localhost a certificate. Set LORT_TLS=off to try Lort on this machine.")
		}
		if _, err := netip.ParseAddr(host); err == nil || !strings.Contains(host, ".") {
			return refuse("LORT_URL", "LORT_URL has no domain (it's %q). HTTPS needs a domain name like feedback.yoursite.com pointed at this server.", c.URL)
		}
		if u.Scheme != "https" {
			return refuse("LORT_URL", "LORT_URL should start with https:// when LORT_TLS=auto (it's %q).", c.URL)
		}
		if c.EncryptionKey == "" {
			return refuse(EncryptionEnv, "LORT_ENCRYPTION_KEY is missing. Run the setup script to make one.")
		}
	default:
		return refuse("LORT_TLS", "LORT_TLS should be auto or off (it's %q).", c.TLS)
	}
	if c.EncryptionKey != "" && len(c.EncryptionKey) != KeyLength {
		return refuse(EncryptionEnv, "LORT_ENCRYPTION_KEY should be %d characters (it has %d).", KeyLength, len(c.EncryptionKey))
	}
	return nil
}

// CheckWritable creates dir (owner-only) if needed and proves Lort can write to it.
func CheckWritable(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return writableError(dir, err)
	}
	f, err := os.CreateTemp(dir, ".lort-write-check-*")
	if err != nil {
		return writableError(dir, err)
	}
	name := f.Name()
	_, err = f.Write([]byte("ok"))
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	_ = os.Remove(name)
	if err != nil {
		return writableError(dir, err)
	}
	return nil
}

func writableError(dir string, err error) error {
	switch {
	case errors.Is(err, syscall.ENOSPC):
		return fmt.Errorf("there's no space left on the disk that holds %s. Free some space, then start Lort again (%w)", dir, err)
	case errors.Is(err, fs.ErrPermission):
		return fmt.Errorf("Lort can't write to %s: it runs as uid 10001 and the folder belongs to someone else. "+
			"Fix it with: docker run --rm -v lort_data:/data alpine chown -R 10001:10001 /data (%w)", filepath.ToSlash(dir), err)
	}
	return fmt.Errorf("Lort can't write to %s (%w)", filepath.ToSlash(dir), err)
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
