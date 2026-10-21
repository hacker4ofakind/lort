package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

const keyA = "abcdefghijklmnopqrstuvwxyz012345"
const keyB = "543210zyxwvutsrqponmlkjihgfedcba"

func boot(t *testing.T, dir, key string) (core.App, error) {
	t.Helper()
	t.Setenv(config.EncryptionEnv, key)
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: dir, EncryptionEnv: config.EncryptionEnv})
	err := app.Bootstrap()
	if err != nil {
		_ = app.ResetBootstrapState() // a failed boot leaves the databases open
	} else {
		t.Cleanup(func() { _ = app.ResetBootstrapState() })
	}
	return app, err
}

func rawSettings(t *testing.T, app core.App) string {
	t.Helper()
	var v struct{ Value string }
	if err := app.DB().Select("value").From("_params").Where(dbx.HashExp{"id": "settings"}).One(&v); err != nil {
		t.Fatal(err)
	}
	return v.Value
}

func TestKeyLifecycle(t *testing.T) {
	dir := t.TempDir()

	// A keyless dev run stores the settings as plain JSON.
	app, err := boot(t, dir, "")
	if err != nil {
		t.Fatal(err)
	}
	app.Settings().Meta.AppName = "Driftnote"
	if err := app.Save(app.Settings()); err != nil {
		t.Fatal(err)
	}
	if !json.Valid([]byte(rawSettings(t, app))) {
		t.Fatal("keyless settings should be plain JSON")
	}
	_ = app.ResetBootstrapState()

	// Adding a key: the plain record still loads, and the next save encrypts it.
	app, err = boot(t, dir, keyA)
	if err != nil {
		t.Fatalf("plaintext settings with a key: %v", err)
	}
	if app.Settings().Meta.AppName != "Driftnote" {
		t.Fatalf("app name = %q", app.Settings().Meta.AppName)
	}
	if err := app.Save(app.Settings()); err != nil {
		t.Fatal(err)
	}
	if raw := rawSettings(t, app); json.Valid([]byte(raw)) || strings.Contains(raw, "Driftnote") {
		t.Fatal("settings should be encrypted after a save with a key")
	}
	_ = app.ResetBootstrapState()

	// A different key, or none, can't read it, and the owner hears why.
	_, err = boot(t, dir, keyB)
	if !errors.Is(explainBootstrap(err), errWrongKey) {
		t.Errorf("wrong key: %v", err)
	}
	_, err = boot(t, dir, "")
	if !errors.Is(explainBootstrap(err), errMissingKey) {
		t.Errorf("missing key: %v", err)
	}
	if !strings.Contains(errWrongKey.Error(), "original LORT_ENCRYPTION_KEY") {
		t.Errorf("message = %v", errWrongKey)
	}

	// The original key still works.
	if _, err := boot(t, dir, keyA); err != nil {
		t.Errorf("original key: %v", err)
	}
}

func TestServeTurnsTheInstallerOff(t *testing.T) {
	app := testutil.NewApp(t)
	register(app, config.Config{URL: "http://localhost:4052", TLS: "off", WebURL: "http://127.0.0.1:1"})
	r, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	se := &core.ServeEvent{Router: r, Server: &http.Server{}, InstallerFunc: apis.DefaultInstallerFunc}
	se.App = app
	err = app.OnServe().Trigger(se, func(e *core.ServeEvent) error {
		if e.InstallerFunc != nil {
			t.Error("InstallerFunc should be nil")
		}
		if e.Server.ReadHeaderTimeout == 0 || e.Server.ReadHeaderTimeout > 10e9 {
			t.Errorf("ReadHeaderTimeout = %v", e.Server.ReadHeaderTimeout)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if n, _ := app.CountRecords(core.CollectionNameSuperusers); n != 0 {
		t.Errorf("superusers = %d, want none on a first boot with no admin variables", n)
	}
}

func TestTLSLogShowsCertificateTroubleOnce(t *testing.T) {
	var out bytes.Buffer
	l := newTLSLog(nil, "feedback.driftnote.app", &out)
	w := log.New(l, "", 0)
	w.Print("http: TLS handshake error from 1.2.3.4:5555: acme/autocert: unable to authorize \"feedback.driftnote.app\"; challenge \"tls-alpn-01\" failed")
	w.Print("http: TLS handshake error from 5.6.7.8:6666: acme/autocert: unable to authorize \"feedback.driftnote.app\"; challenge \"tls-alpn-01\" failed")
	w.Print("http: TLS handshake error from 9.9.9.9:1: EOF")
	w.Print("http: TLS handshake error from 9.9.9.9:2: acme/autocert: missing server name")
	w.Print("http: TLS handshake error from 9.9.9.9:3: acme/autocert: host \"scan.example\" not configured in HostWhitelist")
	got := out.String()
	if strings.Count(got, "unable to authorize") != 1 {
		t.Errorf("want the certificate error once:\n%s", got)
	}
	for _, noise := range []string{"EOF", "missing server name", "HostWhitelist"} {
		if strings.Contains(got, noise) {
			t.Errorf("scanner noise %q reached the log:\n%s", noise, got)
		}
	}
}
