package requests_test

import (
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/status"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func statusTime(t *testing.T, app core.App, id string) time.Time {
	t.Helper()
	r, err := app.FindRecordById("requests", id)
	if err != nil {
		t.Fatal(err)
	}
	return r.GetDateTime("statusChangedAt").Time()
}

func near(t *testing.T, got, want time.Time) {
	t.Helper()
	if d := got.Sub(want); d < -2*time.Second || d > 2*time.Second {
		t.Errorf("statusChangedAt = %s, want about %s", got, want)
	}
}

func TestNewRequestGetsStatusTime(t *testing.T) {
	_, app, board, mara := setup(t)
	c, _ := app.FindCollectionByNameOrId("requests")
	r := core.NewRecord(c)
	r.Set("board", board.Id)
	r.Set("author", mara.Id)
	r.Set("title", "No time given")
	r.Set("status", "pending")
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	near(t, statusTime(t, app, r.Id), time.Now())
}

func TestStatusChangesMoveStatusTime(t *testing.T) {
	svc, app, board, mara := setup(t)
	old := time.Now().Add(-72 * time.Hour)
	r := testutil.Request(t, app, board, mara, "Export", "reviewing", 1)
	testutil.SetStatusTime(t, app, r, old)

	// Editing the title and recounting votes leave the time alone.
	r, _ = app.FindRecordById("requests", r.Id)
	r.Set("title", "Export entries")
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.ToggleVote(r.Id, mara.Id); err != nil {
		t.Fatal(err)
	}
	if err := svc.RecomputeTrending(); err != nil {
		t.Fatal(err)
	}
	near(t, statusTime(t, app, r.Id), old)

	if _, err := svc.SetStatus(r.Id, status.Roadmap, mara); err != nil {
		t.Fatal(err)
	}
	near(t, statusTime(t, app, r.Id), time.Now())

	dst := testutil.Request(t, app, board, mara, "Export all", "planned", 0)
	src := testutil.Request(t, app, board, mara, "Export it", "pending", 0)
	testutil.SetStatusTime(t, app, src, old)
	if err := svc.Merge(src.Id, dst.Id, mara); err != nil {
		t.Fatal(err)
	}
	near(t, statusTime(t, app, src.Id), time.Now())
}

func TestUndoCompleteRestoresStatusTime(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Tags", "planned", 3)
	if _, err := svc.SetStatus(r.Id, status.Start, mara); err != nil {
		t.Fatal(err)
	}
	started := time.Now().Add(-48 * time.Hour)
	testutil.SetStatusTime(t, app, r, started)
	// Make the "started" activity row as old as the status time, like it was in real life.
	if _, err := app.DB().NewQuery("UPDATE activity SET created = {:c} WHERE request = {:r}").
		Bind(dbx.Params{"c": started.UTC().Format("2006-01-02 15:04:05.000Z"), "r": r.Id}).Execute(); err != nil {
		t.Fatal(err)
	}

	if _, err := svc.SetStatus(r.Id, status.Complete, mara); err != nil {
		t.Fatal(err)
	}
	near(t, statusTime(t, app, r.Id), time.Now())
	if _, err := svc.UndoComplete(r.Id); err != nil {
		t.Fatal(err)
	}
	near(t, statusTime(t, app, r.Id), started)
	r, _ = app.FindRecordById("requests", r.Id)
	if r.GetString("status") != "progress" {
		t.Errorf("status = %s", r.GetString("status"))
	}
}

func TestUndoCompleteWithoutEarlierActivityUsesCreated(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Quick one", "progress", 0)
	if _, err := svc.SetStatus(r.Id, status.Complete, mara); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UndoComplete(r.Id); err != nil {
		t.Fatal(err)
	}
	r, _ = app.FindRecordById("requests", r.Id)
	if !r.GetDateTime("statusChangedAt").Time().Equal(r.GetDateTime("created").Time()) {
		t.Errorf("statusChangedAt = %s, want created %s", r.GetDateTime("statusChangedAt"), r.GetDateTime("created"))
	}
}

func TestShippedSortIsNewestStatusChangeFirst(t *testing.T) {
	svc, app, board, mara := setup(t)
	a := testutil.Request(t, app, board, mara, "Shipped long ago", "completed", 9)
	b := testutil.Request(t, app, board, mara, "Shipped just now", "completed", 0)
	testutil.SetStatusTime(t, app, a, time.Now().Add(-10*24*time.Hour))
	testutil.SetStatusTime(t, app, b, time.Now().Add(-time.Hour))
	page, err := svc.List(requests.Query{Sort: "shipped"}, nil, false)
	if err != nil || len(page.Items) != 2 || page.Items[0].ID != b.Id {
		t.Fatalf("shipped order = %+v, %v", page.Items, err)
	}
	near(t, page.Items[0].StatusChangedAt, time.Now().Add(-time.Hour))
}
