package config

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"syscall"
	"testing"
)

const key = "abcdefghijklmnopqrstuvwxyz012345"

func TestServeArgs(t *testing.T) {
	auto := Config{URL: "https://feedback.driftnote.app", TLS: "auto"}
	want := []string{"serve", "--http=0.0.0.0:80", "--https=0.0.0.0:443", "feedback.driftnote.app"}
	if got := auto.ServeArgs(); !reflect.DeepEqual(got, want) {
		t.Errorf("auto = %v", got)
	}
	off := Config{URL: "https://feedback.driftnote.app", TLS: "off"}
	if got := off.ServeArgs(); !reflect.DeepEqual(got, []string{"serve", "--http=0.0.0.0:4052"}) {
		t.Errorf("off = %v", got)
	}
}

func TestFromEnv(t *testing.T) {
	t.Setenv("LORT_URL", "https://f.example/")
	t.Setenv("LORT_WEB_CMD", "node /app/web/server.js")
	t.Setenv(EncryptionEnv, key)
	c := FromEnv()
	if c.URL != "https://f.example" || !reflect.DeepEqual(c.WebCmd, []string{"node", "/app/web/server.js"}) || c.TLS != "off" || c.EncryptionKey != key {
		t.Errorf("config = %+v", c)
	}
	if c.BehindProxy() != true || (Config{TLS: "auto"}).BehindProxy() {
		t.Error("BehindProxy should mean LORT_TLS=off")
	}
}

func TestCheck(t *testing.T) {
	for _, c := range []struct {
		cfg  Config
		want string // "" means valid
		env  string // the .env line the message names
	}{
		{Config{URL: "https://feedback.driftnote.app", TLS: "auto", EncryptionKey: key}, "", ""},
		{Config{URL: "https://feedback.driftnote.app", TLS: "off", EncryptionKey: key}, "", ""},
		{Config{URL: "http://localhost:4052", TLS: "off"}, "", ""},
		{Config{URL: "feedback.driftnote.app", TLS: "off"}, "LORT_URL should be the board's full address", "LORT_URL"},
		{Config{URL: "https://feedback.driftnote.app/board", TLS: "off"}, "LORT_URL should be the board's full address", "LORT_URL"},
		{Config{URL: "ftp://feedback.driftnote.app", TLS: "off"}, "LORT_URL should be the board's full address", "LORT_URL"},
		{Config{URL: "https://feedback.driftnote.app", TLS: "on", EncryptionKey: key}, `LORT_TLS should be auto or off (it's "on")`, "LORT_TLS"},
		{Config{URL: "https://localhost", TLS: "auto", EncryptionKey: key}, "LORT_TLS=off to try", "LORT_TLS"},
		{Config{URL: "https://203.0.113.9", TLS: "auto", EncryptionKey: key}, "has no domain", "LORT_URL"},
		{Config{URL: "https://feedback", TLS: "auto", EncryptionKey: key}, "has no domain", "LORT_URL"},
		{Config{URL: "http://feedback.driftnote.app", TLS: "auto", EncryptionKey: key}, "https://", "LORT_URL"},
		{Config{URL: "https://feedback.driftnote.app:8443", TLS: "auto", EncryptionKey: key}, "LORT_URL should be the board's full address", "LORT_URL"},
		{Config{URL: "https://feedback.driftnote.app", TLS: "auto"}, "LORT_ENCRYPTION_KEY is missing", EncryptionEnv},
		{Config{URL: "https://feedback.driftnote.app", TLS: "auto", EncryptionKey: "short"}, "should be 32 characters (it has 5)", EncryptionEnv},
		{Config{URL: "http://localhost:4052", TLS: "off", EncryptionKey: "short"}, "should be 32 characters (it has 5)", EncryptionEnv},
	} {
		err := c.cfg.Check()
		if c.want == "" {
			if err != nil {
				t.Errorf("%+v: %v", c.cfg, err)
			}
			continue
		}
		var se *SettingError
		if !errors.As(err, &se) || !strings.Contains(err.Error(), c.want) || se.Var != c.env || !strings.Contains(err.Error(), c.env) {
			t.Errorf("%+v: got %v (var %v), want %q naming %s", c.cfg, err, se, c.want, c.env)
		}
	}
}

func TestWritableErrorTellsDiskFromOwner(t *testing.T) {
	owner := writableError("/data/pb_data", fmt.Errorf("open: %w", fs.ErrPermission))
	if !strings.Contains(owner.Error(), "chown -R 10001:10001") {
		t.Errorf("owner = %v", owner)
	}
	full := writableError("/data/pb_data", fmt.Errorf("write: %w", syscall.ENOSPC))
	if strings.Contains(full.Error(), "chown") || !strings.Contains(full.Error(), "space") {
		t.Errorf("full = %v", full)
	}
}

func TestCheckWritable(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "pb_data")
	if err := CheckWritable(dir); err != nil {
		t.Fatal(err)
	}
	if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
		t.Fatalf("dir = %v, %v", fi, err)
	} else if runtime.GOOS != "windows" && fi.Mode().Perm() != 0o700 {
		t.Errorf("mode = %v, want 0700", fi.Mode().Perm())
	}
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("read-only directories need a non-root Unix user")
	}
	ro := t.TempDir()
	if err := os.Chmod(ro, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(ro, 0o700) })
	if err := CheckWritable(ro); err == nil || !strings.Contains(err.Error(), "chown -R 10001:10001") {
		t.Errorf("read-only = %v", err)
	}
}
