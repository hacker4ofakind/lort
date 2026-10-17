package schema_test

import (
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/schema"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestEnsureIsIdempotent(t *testing.T) {
	app := testutil.NewApp(t)
	if err := schema.Ensure(app); err != nil {
		t.Fatalf("second Ensure: %v", err)
	}
	for _, name := range []string{"boards", "tags", "requests", "votes", "comments", "activity", "settings"} {
		if _, err := app.FindCollectionByNameOrId(name); err != nil {
			t.Errorf("missing collection %s", name)
		}
	}
	if n, _ := app.CountRecords("settings"); n != 1 {
		t.Errorf("settings records = %d, want 1", n)
	}
}

func TestSearchIndexFollowsRequests(t *testing.T) {
	app := testutil.NewApp(t)
	b := testutil.Board(t, app, "Features", true, false)
	u := testutil.User(t, app, "mara@example.com")
	r := testutil.Request(t, app, b, u, "Dark mode for the editor", "pending", 1)

	count := func(q string) int {
		var n int
		err := app.DB().NewQuery("SELECT count(*) FROM requests_fts WHERE requests_fts MATCH {:q}").
			Bind(dbx.Params{"q": q}).Row(&n)
		if err != nil {
			t.Fatal(err)
		}
		return n
	}
	if count("dark") != 1 {
		t.Fatal("new request not indexed")
	}
	r.Set("title", "Night theme for the editor")
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	if count("dark") != 0 || count("night") != 1 {
		t.Fatal("updated title not reindexed")
	}
	if err := app.Delete(r); err != nil {
		t.Fatal(err)
	}
	if count("night") != 0 {
		t.Fatal("deleted request still indexed")
	}
}

// The favicon links to the logo's 64x64 thumb, so boards created before it existed get it too.
func TestLogoHasAFaviconThumb(t *testing.T) {
	app := testutil.NewApp(t)
	c, err := app.FindCollectionByNameOrId("settings")
	if err != nil {
		t.Fatal(err)
	}
	c.Fields.GetByName("logo").(*core.FileField).Thumbs = nil
	if err := app.Save(c); err != nil {
		t.Fatal(err)
	}
	if err := schema.Ensure(app); err != nil {
		t.Fatal(err)
	}
	c, _ = app.FindCollectionByNameOrId("settings")
	if got := c.Fields.GetByName("logo").(*core.FileField).Thumbs; len(got) != 1 || got[0] != "64x64" {
		t.Errorf("logo thumbs = %v, want [64x64]", got)
	}
}
