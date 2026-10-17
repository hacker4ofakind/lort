package catalog_test

import (
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/catalog"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestSetOrder(t *testing.T) {
	app := testutil.NewApp(t)
	a := testutil.Board(t, app, "Features", true, false)
	testutil.Board(t, app, "Bugs", true, false)
	c := testutil.Board(t, app, "Internal", false, false)
	if err := catalog.SetOrder(app, "boards", []string{c.Id, a.Id}); err != nil {
		t.Fatal(err)
	}
	recs, err := app.FindRecordsByFilter("boards", "", "order", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, r := range recs {
		got = append(got, r.GetString("name"))
	}
	if len(got) != 3 || got[0] != "Internal" || got[1] != "Features" || got[2] != "Bugs" {
		t.Errorf("order = %v", got)
	}
	if err := catalog.SetOrder(app, "users", nil); !errors.Is(err, catalog.ErrNotOrderable) {
		t.Errorf("users err = %v", err)
	}
}

func TestDeletingATagRemovesItFromRequests(t *testing.T) {
	app := testutil.NewApp(t)
	board := testutil.Board(t, app, "Features", true, false)
	mara := testutil.User(t, app, "mara@example.com")
	c, err := app.FindCollectionByNameOrId("tags")
	if err != nil {
		t.Fatal(err)
	}
	tag := core.NewRecord(c)
	tag.Set("name", "ios")
	if err := app.Save(tag); err != nil {
		t.Fatal(err)
	}
	r := testutil.Request(t, app, board, mara, "Widget", "pending", 0)
	r.Set("tags", []string{tag.Id})
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	if err := app.Delete(tag); err != nil {
		t.Fatal(err)
	}
	r, _ = app.FindRecordById("requests", r.Id)
	if got := r.GetStringSlice("tags"); len(got) != 0 {
		t.Errorf("tags = %v", got)
	}
}
