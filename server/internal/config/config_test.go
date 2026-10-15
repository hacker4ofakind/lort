package config

import (
	"reflect"
	"testing"
)

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
	c := FromEnv()
	if c.URL != "https://f.example" || !reflect.DeepEqual(c.WebCmd, []string{"node", "/app/web/server.js"}) || c.TLS != "off" {
		t.Errorf("config = %+v", c)
	}
}
