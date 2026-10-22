package site_test

import (
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

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

func TestChangelogFlagFollowsPublishedPosts(t *testing.T) {
	app := testutil.NewApp(t)
	cache := site.NewCache(app)
	c, err := app.FindCollectionByNameOrId("changelogs")
	if err != nil {
		t.Fatal(err)
	}
	post := core.NewRecord(c)
	post.Set("title", "Dark mode")
	post.Set("state", "draft")
	if err := app.Save(post); err != nil {
		t.Fatal(err)
	}
	if decode(t, cache.Header()).Changelog {
		t.Fatal("changelog = true with only a draft")
	}

	// Published behind the hooks' back: only a dropped cache would notice.
	if _, err := app.DB().NewQuery("UPDATE changelogs SET state = 'published' WHERE id = {:id}").Bind(dbx.Params{"id": post.Id}).Execute(); err != nil {
		t.Fatal(err)
	}
	// A body edit doesn't drop the cache (autosave writes about once a second).
	edit, _ := app.FindRecordById("changelogs", post.Id)
	edit.Set("body", "Hello")
	if err := app.Save(edit); err != nil {
		t.Fatal(err)
	}
	if decode(t, cache.Header()).Changelog {
		t.Fatal("a body edit dropped the cache")
	}

	// A state change does.
	setState(t, app, post.Id, "draft")
	if decode(t, cache.Header()).Changelog {
		t.Fatal("changelog = true after unpublishing")
	}
	live := setState(t, app, post.Id, "published")
	if !decode(t, cache.Header()).Changelog {
		t.Fatal("changelog = false after publishing")
	}

	// So does deleting a published post.
	if err := app.Delete(live); err != nil {
		t.Fatal(err)
	}
	if decode(t, cache.Header()).Changelog {
		t.Fatal("changelog = true after the published post was deleted")
	}
}

func setState(t *testing.T, app core.App, id, state string) *core.Record {
	t.Helper()
	r, err := app.FindRecordById("changelogs", id)
	if err != nil {
		t.Fatal(err)
	}
	r.Set("state", state)
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	return r
}
