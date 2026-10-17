package site_test

import (
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/hacker4ofakind/lort/server/internal/site"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func decode(t *testing.T, h string) site.Config {
	t.Helper()
	b, err := base64.RawURLEncoding.DecodeString(h)
	if err != nil {
		t.Fatal(err)
	}
	var c site.Config
	if err := json.Unmarshal(b, &c); err != nil {
		t.Fatal(err)
	}
	return c
}

func TestHeaderCarriesBrandAndRefreshesOnChange(t *testing.T) {
	app := testutil.NewApp(t)
	cache := site.NewCache(app)
	testutil.Board(t, app, "Features", true, false)
	testutil.Board(t, app, "Internal", false, false)

	c := decode(t, cache.Header())
	if c.AppName != "My app" || c.PrimaryColor != "#cc3a6d" || len(c.Boards) != 1 || c.Boards[0].Name != "Features" {
		t.Fatalf("config = %+v", c)
	}

	s, err := app.FindFirstRecordByFilter("settings", "")
	if err != nil {
		t.Fatal(err)
	}
	s.Set("appName", "Driftnote ✨")
	if err := app.Save(s); err != nil {
		t.Fatal(err)
	}
	if got := decode(t, cache.Header()).AppName; got != "Driftnote ✨" {
		t.Errorf("after rename appName = %q", got)
	}
}
