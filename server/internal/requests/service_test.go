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
