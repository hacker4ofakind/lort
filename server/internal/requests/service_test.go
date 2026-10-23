package requests_test

import (
	"errors"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/status"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func setup(t *testing.T) (*requests.Service, core.App, *core.Record, *core.Record) {
	app := testutil.NewApp(t)
	requests.BindStatusTime(app)
	board := testutil.Board(t, app, "Features", true, false)
	mara := testutil.User(t, app, "mara@example.com")
	return requests.New(app), app, board, mara
}

func TestToggleVote(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Dark mode", "pending", 0)
	devon := testutil.User(t, app, "devon@example.com")

	voted, count, err := svc.ToggleVote(r.Id, devon.Id)
	if err != nil || !voted || count != 1 {
		t.Fatalf("first toggle = %v %d %v", voted, count, err)
	}
	voted, count, err = svc.ToggleVote(r.Id, devon.Id)
	if err != nil || voted || count != 0 {
		t.Fatalf("second toggle = %v %d %v", voted, count, err)
	}
	r, _ = app.FindRecordById("requests", r.Id)
	if r.GetInt("upvoteCount") != 0 {
		t.Errorf("stored count = %d", r.GetInt("upvoteCount"))
	}
}

func TestToggleVoteRejectsClosed(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Old idea", "closed", 0)
	if _, _, err := svc.ToggleVote(r.Id, mara.Id); !errors.Is(err, requests.ErrNotVoting) {
		t.Fatalf("err = %v", err)
	}
}

func TestSetStatusAcceptApproves(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Hidden one", "pending", 1)
	r.Set("visible", false)
	r.Set("awaitingApproval", true)
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	ch, err := svc.SetStatus(r.Id, status.Accept, mara)
	if err != nil || ch.To != status.Reviewing || ch.Roadmap != "" {
		t.Fatalf("change = %+v, %v", ch, err)
	}
	r, _ = app.FindRecordById("requests", r.Id)
	if !r.GetBool("visible") || r.GetBool("awaitingApproval") {
		t.Error("accepting should make the request visible")
	}
	acts, _ := app.FindAllRecords("activity", dbx.HashExp{"request": r.Id})
	if len(acts) != 1 || acts[0].GetString("to") != "reviewing" || acts[0].GetString("actor") != mara.Id {
		t.Errorf("activity = %v", acts)
	}
}

func TestSetStatusReportsRoadmapChange(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Export", "reviewing", 1)
	ch, err := svc.SetStatus(r.Id, status.Roadmap, mara)
	if err != nil || ch.Roadmap != "added" {
		t.Fatalf("change = %+v, %v", ch, err)
	}
	if _, err := svc.SetStatus(r.Id, status.Complete, mara); err == nil {
		t.Fatal("planned → complete should not be allowed")
	}
}

func TestUndoComplete(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Tags", "progress", 3)
	if _, err := svc.SetStatus(r.Id, status.Complete, mara); err != nil {
		t.Fatal(err)
	}
	ch, err := svc.UndoComplete(r.Id)
	if err != nil || ch.To != status.Progress {
		t.Fatalf("undo = %+v, %v", ch, err)
	}
	if n, _ := app.CountRecords("activity", dbx.HashExp{"request": r.Id}); n != 0 {
		t.Errorf("undo should remove the completion from the timeline, %d left", n)
	}
}

func TestUndoCompleteExpires(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Tags", "progress", 3)
	if _, err := svc.SetStatus(r.Id, status.Complete, mara); err != nil {
		t.Fatal(err)
	}
	svc.Now = func() time.Time { return time.Now().Add(2 * time.Minute) }
	if _, err := svc.UndoComplete(r.Id); !errors.Is(err, requests.ErrUndoGone) {
		t.Fatalf("err = %v", err)
	}
}

func TestMergeMovesVotersWithoutDuplicates(t *testing.T) {
	svc, app, board, mara := setup(t)
	devon := testutil.User(t, app, "devon@example.com")
	ade := testutil.User(t, app, "ade@example.com")
	src := testutil.Request(t, app, board, devon, "Night theme", "pending", 0)
	dst := testutil.Request(t, app, board, mara, "Dark mode", "planned", 0)
	for _, v := range []struct{ u, r *core.Record }{{devon, src}, {ade, src}, {ade, dst}, {mara, dst}} {
		if _, _, err := svc.ToggleVote(v.r.Id, v.u.Id); err != nil {
			t.Fatal(err)
		}
	}
	if err := svc.Merge(src.Id, dst.Id, mara); err != nil {
		t.Fatal(err)
	}
	dst, _ = app.FindRecordById("requests", dst.Id)
	src, _ = app.FindRecordById("requests", src.Id)
	if dst.GetInt("upvoteCount") != 3 {
		t.Errorf("target votes = %d, want 3 (mara, ade, devon)", dst.GetInt("upvoteCount"))
	}
	if src.GetString("status") != "closed" || src.GetString("mergedInto") != dst.Id {
		t.Errorf("source = %s / %s", src.GetString("status"), src.GetString("mergedInto"))
	}
	if err := svc.Merge(dst.Id, dst.Id, mara); !errors.Is(err, requests.ErrBadMerge) {
		t.Errorf("self-merge err = %v", err)
	}
}

func TestRecomputeTrendingSkipsFinished(t *testing.T) {
	svc, app, board, mara := setup(t)
	open := testutil.Request(t, app, board, mara, "Open", "pending", 4)
	done := testutil.Request(t, app, board, mara, "Done", "completed", 4)
	if err := svc.RecomputeTrending(); err != nil {
		t.Fatal(err)
	}
	open, _ = app.FindRecordById("requests", open.Id)
	done, _ = app.FindRecordById("requests", done.Id)
	if open.GetFloat("trendScore") <= 0 || done.GetFloat("trendScore") != 0 {
		t.Errorf("scores = %v / %v", open.GetFloat("trendScore"), done.GetFloat("trendScore"))
	}
}

func TestToggleVoteRespectsAccess(t *testing.T) {
	svc, app, _, mara := setup(t)
	private := testutil.Board(t, app, "Internal", false, false)
	r := testutil.Request(t, app, private, mara, "Secret", "pending", 0)
	devon := testutil.User(t, app, "devon@example.com")
	if _, _, err := svc.ToggleVote(r.Id, devon.Id); !errors.Is(err, requests.ErrNotFound) {
		t.Fatalf("outsider vote on a private board err = %v", err)
	}
	if _, _, err := svc.ToggleVote(r.Id, mara.Id); err != nil {
		t.Fatalf("author vote err = %v", err)
	}
	devon.Set("isAdmin", true)
	if err := app.Save(devon); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.ToggleVote(r.Id, devon.Id); err != nil {
		t.Fatalf("team vote err = %v", err)
	}
}

func TestRecomputeTrendingOnlyTouchesTrendScore(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Open", "pending", 4)
	before := r.GetDateTime("updated")
	svc.Now = func() time.Time { return time.Now().Add(time.Hour) }
	if err := svc.RecomputeTrending(); err != nil {
		t.Fatal(err)
	}
	r, _ = app.FindRecordById("requests", r.Id)
	if got := r.GetDateTime("updated"); got.String() != before.String() {
		t.Errorf("updated %s → %s; the hourly recompute shouldn't bump it (it breaks the Recently updated sort)", before, got)
	}
}

func TestShipCompletesOpenRequests(t *testing.T) {
	svc, app, board, mara := setup(t)
	admin := testutil.User(t, app, "luk@example.com")
	r := testutil.Request(t, app, board, mara, "Dark mode", "planned", 1)
	ch, err := svc.Ship(r.Id, admin)
	if err != nil || ch.From != status.Planned || ch.To != status.Completed {
		t.Fatalf("Ship = %+v, %v", ch, err)
	}
	rows, _ := app.FindAllRecords("activity", dbx.HashExp{"request": r.Id, "kind": "status_changed"})
	if len(rows) != 1 || rows[0].GetString("actor") != admin.Id || rows[0].GetString("to") != "completed" {
		t.Fatalf("activity = %v", rows)
	}
	closed := testutil.Request(t, app, board, mara, "Old", "closed", 1)
	if _, err := svc.Ship(closed.Id, admin); err == nil {
		t.Fatal("shipping a closed request should fail")
	}
}

func TestItemsByIDKeepsOrderAndPublicView(t *testing.T) {
	svc, app, board, mara := setup(t)
	private := testutil.Board(t, app, "Internal", false, false)
	a := testutil.Request(t, app, board, mara, "Alpha", "planned", 1)
	b := testutil.Request(t, app, board, mara, "Bravo", "planned", 1)
	hidden := testutil.Request(t, app, board, mara, "Hidden", "planned", 1)
	hidden.Set("visible", false)
	inside := testutil.Request(t, app, private, mara, "Inside", "planned", 1)
	merged := testutil.Request(t, app, board, mara, "Merged", "planned", 1)
	merged.Set("mergedInto", a.Id)
	for _, r := range []*core.Record{hidden, merged} {
		if err := app.Save(r); err != nil {
			t.Fatal(err)
		}
	}
	a.Set("body", "secret body")
	if err := app.Save(a); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.ToggleVote(a.Id, mara.Id); err != nil {
		t.Fatal(err)
	}
	ids := []string{b.Id, hidden.Id, a.Id, inside.Id, merged.Id, "missing"}

	items, err := svc.ItemsByID(ids, mara, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || items[0].ID != b.Id || items[1].ID != a.Id || items[1].Body != "" || !items[1].Voted {
		t.Fatalf("public items = %+v", items)
	}
	team, err := svc.ItemsByID(ids, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(team) != 5 || team[1].ID != hidden.Id || team[3].ID != inside.Id {
		t.Fatalf("team items = %d", len(team))
	}
}
