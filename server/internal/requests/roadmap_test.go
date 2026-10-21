package requests_test

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/status"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func titles(items []requests.Item) []string {
	out := make([]string, len(items))
	for i, it := range items {
		out[i] = it.Title
	}
	return out
}

func same(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestPublicRoadmapScope(t *testing.T) {
	svc, app, board, mara := setup(t)
	private := testutil.Board(t, app, "Internal", false, false)
	devon := testutil.User(t, app, "devon@example.com")

	testutil.Request(t, app, board, mara, "Dark mode", "planned", 0)
	testutil.Request(t, app, private, mara, "Secret plan", "planned", 5)
	hidden := testutil.Request(t, app, board, mara, "Hidden plan", "planned", 5)
	hidden.Set("visible", false)
	mine := testutil.Request(t, app, board, devon, "Devon's hidden plan", "planned", 5)
	mine.Set("visible", false)
	merged := testutil.Request(t, app, board, mara, "Merged away", "planned", 5)
	merged.Set("mergedInto", "someotherid")
	for _, r := range []*core.Record{hidden, mine, merged} {
		if err := app.Save(r); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := svc.ToggleVote(findID(t, app, "Dark mode"), devon.Id); err != nil {
		t.Fatal(err)
	}

	rm, err := svc.Roadmap(devon, false)
	if err != nil {
		t.Fatal(err)
	}
	if got := titles(rm.Planned); !same(got, []string{"Dark mode"}) {
		t.Fatalf("public planned = %v; hidden, private-board, merged and the viewer's own hidden request must stay off", got)
	}
	if !rm.Planned[0].Voted || rm.Planned[0].Votes != 1 {
		t.Errorf("viewer's vote missing: %+v", rm.Planned[0])
	}

	team, err := svc.Roadmap(nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if got := titles(team.Planned); len(got) != 4 {
		t.Errorf("team planned = %v, want the four unmerged requests", got)
	}
	var sawHidden bool
	for _, it := range team.Planned {
		if it.Title == "Hidden plan" && !it.Visible {
			sawHidden = true
		}
	}
	if !sawHidden {
		t.Error("team view should carry Visible=false on hidden cards")
	}
}

func findID(t *testing.T, app core.App, title string) string {
	t.Helper()
	r, err := app.FindFirstRecordByData("requests", "title", title)
	if err != nil {
		t.Fatal(err)
	}
	return r.Id
}

func TestRoadmapColumnsOrderAndShippedCount(t *testing.T) {
	svc, app, board, mara := setup(t)
	testutil.Request(t, app, board, mara, "Low votes", "planned", 1)
	testutil.Request(t, app, board, mara, "High votes", "planned", 9)
	testutil.Request(t, app, board, mara, "Building", "progress", 2)
	old := testutil.Request(t, app, board, mara, "Shipped long ago", "completed", 0)
	week := testutil.Request(t, app, board, mara, "Shipped last week", "completed", 0)
	today := testutil.Request(t, app, board, mara, "Shipped today", "completed", 0)
	now := time.Now()
	testutil.SetStatusTime(t, app, old, now.Add(-90*24*time.Hour))
	testutil.SetStatusTime(t, app, week, now.Add(-7*24*time.Hour))
	testutil.SetStatusTime(t, app, today, now.Add(-time.Hour))

	rm, err := svc.Roadmap(nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if got := titles(rm.Planned); !same(got, []string{"High votes", "Low votes"}) {
		t.Errorf("planned = %v", got)
	}
	if got := titles(rm.Progress); !same(got, []string{"Building"}) {
		t.Errorf("progress = %v", got)
	}
	if got := titles(rm.Completed); !same(got, []string{"Shipped today", "Shipped last week"}) {
		t.Errorf("completed = %v; only the last 30 days, newest first", got)
	}
	if rm.Shipped != 3 {
		t.Errorf("shipped = %d, want 3 (older completions count too)", rm.Shipped)
	}
}

func TestCompletedWindowEdges(t *testing.T) {
	svc, app, board, mara := setup(t)
	in := testutil.Request(t, app, board, mara, "Inside", "completed", 0)
	out := testutil.Request(t, app, board, mara, "Outside", "completed", 0)
	testutil.SetStatusTime(t, app, in, time.Now().Add(-29*24*time.Hour-23*time.Hour))
	testutil.SetStatusTime(t, app, out, time.Now().Add(-30*24*time.Hour-time.Hour))
	rm, err := svc.Roadmap(nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if got := titles(rm.Completed); !same(got, []string{"Inside"}) {
		t.Errorf("completed = %v, want only the one shipped 29d23h ago", got)
	}
}

func TestRoadmapItemsCarryNoBody(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Long one", "planned", 0)
	r.Set("body", "A very long description")
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	rm, _ := svc.Roadmap(nil, false)
	if rm.Planned[0].Body != "" {
		t.Errorf("body = %q", rm.Planned[0].Body)
	}
	page, _ := svc.List(requests.Query{}, nil, false)
	if page.Items[0].Body == "" {
		t.Error("the normal list should still carry bodies")
	}
}

func TestShippedPagesByTwentyNewestFirst(t *testing.T) {
	svc, app, board, mara := setup(t)
	secret := testutil.Board(t, app, "Internal", false, false)
	testutil.Request(t, app, secret, mara, "Internal ship", "completed", 0)
	for i := 0; i < 25; i++ {
		r := testutil.Request(t, app, board, mara, fmt.Sprintf("Shipped %02d", i), "completed", 0)
		testutil.SetStatusTime(t, app, r, time.Now().Add(-time.Duration(i+1)*24*time.Hour))
	}
	p1, err := svc.Shipped(1, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(p1.Items) != 20 || p1.TotalItems != 25 || p1.Items[0].Title != "Shipped 00" || p1.Items[19].Title != "Shipped 19" {
		t.Fatalf("page 1: %d items, total %d, first %q, last %q", len(p1.Items), p1.TotalItems, p1.Items[0].Title, p1.Items[len(p1.Items)-1].Title)
	}
	p2, _ := svc.Shipped(2, nil, false)
	if len(p2.Items) != 5 || p2.Items[0].Title != "Shipped 20" {
		t.Errorf("page 2 = %v", titles(p2.Items))
	}
	team, _ := svc.Shipped(1, nil, true)
	if team.TotalItems != 26 {
		t.Errorf("team total = %d, want 26", team.TotalItems)
	}
}

func timeline(t *testing.T, app core.App, id string) []*core.Record {
	t.Helper()
	acts, err := app.FindRecordsByFilter("activity", "request = {:r}", "created", 0, 0, dbx.Params{"r": id})
	if err != nil {
		t.Fatal(err)
	}
	return acts
}

func TestMoveOnRoadmap(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Calendar", "planned", 0)
	old := time.Now().Add(-48 * time.Hour)
	testutil.SetStatusTime(t, app, r, old)

	ch, err := svc.MoveOnRoadmap(r.Id, status.Planned, status.Completed, mara)
	if err != nil || ch.From != status.Planned || ch.To != status.Completed || ch.Roadmap != "" {
		t.Fatalf("move = %+v, %v", ch, err)
	}
	acts := timeline(t, app, r.Id)
	if len(acts) != 1 || acts[0].GetString("kind") != "status_changed" || acts[0].GetString("from") != "planned" || acts[0].GetString("to") != "completed" {
		t.Fatalf("activity = %v", acts)
	}
	near(t, statusTime(t, app, r.Id), time.Now())

	if _, err := svc.UndoComplete(r.Id); err != nil {
		t.Fatal(err)
	}
	got, _ := app.FindRecordById("requests", r.Id)
	if got.GetString("status") != "planned" {
		t.Errorf("after undo status = %s, want planned", got.GetString("status"))
	}
}

func TestMoveOnRoadmapSameColumnWritesNothing(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Calendar", "planned", 0)
	before := statusTime(t, app, r.Id)
	ch, err := svc.MoveOnRoadmap(r.Id, status.Planned, status.Planned, mara)
	if err != nil || ch.From != status.Planned || ch.To != status.Planned {
		t.Fatalf("move = %+v, %v", ch, err)
	}
	if n := len(timeline(t, app, r.Id)); n != 0 {
		t.Errorf("%d activity rows", n)
	}
	if !statusTime(t, app, r.Id).Equal(before) {
		t.Error("status time changed")
	}
}

func TestMoveOnRoadmapRefusesStaleBoards(t *testing.T) {
	svc, app, board, mara := setup(t)

	left := testutil.Request(t, app, board, mara, "Triaged away", "reviewing", 0)
	if _, err := svc.MoveOnRoadmap(left.Id, status.Planned, status.Progress, mara); !errors.Is(err, requests.ErrNotOnRoadmap) {
		t.Errorf("request that left the roadmap: err = %v", err)
	}

	done := testutil.Request(t, app, board, mara, "Completed meanwhile", "completed", 0)
	if _, err := svc.MoveOnRoadmap(done.Id, status.Progress, status.Planned, mara); !errors.Is(err, requests.ErrMoved) {
		t.Errorf("stale from: err = %v", err)
	}
	got, _ := app.FindRecordById("requests", done.Id)
	if got.GetString("status") != "completed" || len(timeline(t, app, done.Id)) != 0 {
		t.Error("a refused move must change nothing")
	}

	if _, err := svc.MoveOnRoadmap(done.Id, status.Completed, status.Reviewing, mara); err == nil {
		t.Error("moving off the roadmap should be refused")
	}
	if _, err := svc.MoveOnRoadmap("missing", status.Planned, status.Progress, mara); !errors.Is(err, requests.ErrNotFound) {
		t.Errorf("missing request: err = %v", err)
	}
}
