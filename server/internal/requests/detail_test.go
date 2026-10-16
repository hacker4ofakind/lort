package requests_test

import (
	"errors"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/status"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func comment(t *testing.T, app core.App, req, author *core.Record, body, parent string, internal bool) *core.Record {
	t.Helper()
	c, err := app.FindCollectionByNameOrId("comments")
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(c)
	r.Set("request", req.Id)
	r.Set("author", author.Id)
	r.Set("body", body)
	r.Set("parent", parent)
	r.Set("internal", internal)
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestGetBuildsThePage(t *testing.T) {
	svc, app, board, mara := setup(t)
	luk := testutil.User(t, app, "luk@driftnote.app")
	luk.Set("isAdmin", true)
	if err := app.Save(luk); err != nil {
		t.Fatal(err)
	}
	r := testutil.Request(t, app, board, mara, "Sync drops entries", "pending", 0)
	if _, err := svc.SetStatus(r.Id, status.Accept, luk); err != nil {
		t.Fatal(err)
	}
	top := comment(t, app, r, mara, "Same on iOS", "", false)
	comment(t, app, r, luk, "Which version?", top.Id, false)
	comment(t, app, r, luk, "Reproduced it", "", true)

	pub, err := svc.Get(r.Id, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if pub.Title != "Sync drops entries" || pub.Status != "reviewing" || len(pub.Activity) != 1 || pub.Activity[0].Actor.ID != luk.Id || !pub.Activity[0].Actor.Team {
		t.Fatalf("public page = %+v", pub)
	}
	if len(pub.Thread) != 1 || len(pub.Thread[0].Replies) != 1 || !pub.Thread[0].Replies[0].Author.Team {
		t.Fatalf("public thread = %+v", pub.Thread)
	}
	team, _ := svc.Get(r.Id, nil, true)
	if len(team.Thread) != 2 || !team.Thread[1].Internal {
		t.Errorf("team should see the internal note, got %+v", team.Thread)
	}
	asAdmin, _ := svc.Get(r.Id, luk, false)
	if len(asAdmin.Thread) != 2 {
		t.Errorf("an admin's profile should see internal notes too")
	}
}

func TestGetHidesWhatTheViewerCantSee(t *testing.T) {
	svc, app, board, mara := setup(t)
	devon := testutil.User(t, app, "devon@example.com")
	r := testutil.Request(t, app, board, devon, "Waiting", "pending", 0)
	r.Set("visible", false)
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Get(r.Id, nil, false); !errors.Is(err, requests.ErrNotFound) {
		t.Errorf("anonymous err = %v", err)
	}
	if _, err := svc.Get(r.Id, mara, false); !errors.Is(err, requests.ErrNotFound) {
		t.Errorf("other user err = %v", err)
	}
	if _, err := svc.Get(r.Id, devon, false); err != nil {
		t.Errorf("the author should see their own request: %v", err)
	}
}

func TestGetShowsWhereAMergedRequestWent(t *testing.T) {
	svc, app, board, mara := setup(t)
	src := testutil.Request(t, app, board, mara, "Night theme", "pending", 0)
	dst := testutil.Request(t, app, board, mara, "Dark mode", "planned", 0)
	if err := svc.Merge(src.Id, dst.Id, mara); err != nil {
		t.Fatal(err)
	}
	d, err := svc.Get(src.Id, nil, false)
	if err != nil || d.MergedInto == nil || d.MergedInto.Name != "Dark mode" {
		t.Fatalf("merged page = %+v, %v", d.MergedInto, err)
	}
}

func TestMoveBoard(t *testing.T) {
	svc, app, board, mara := setup(t)
	bugs := testutil.Board(t, app, "Bugs", true, false)
	r := testutil.Request(t, app, board, mara, "Crash", "pending", 0)
	if err := svc.MoveBoard(r.Id, bugs.Id, mara); err != nil {
		t.Fatal(err)
	}
	r, _ = app.FindRecordById("requests", r.Id)
	if r.GetString("board") != bugs.Id {
		t.Fatal("board not changed")
	}
	a, err := app.FindFirstRecordByFilter("activity", "request = {:r} && kind = 'board_changed'", dbx.Params{"r": r.Id})
	if err != nil || a.GetString("from") != "Features" || a.GetString("to") != "Bugs" {
		t.Fatalf("activity = %v, %v", a, err)
	}
	if err := svc.MoveBoard(r.Id, "nope", mara); !errors.Is(err, requests.ErrNoBoard) {
		t.Errorf("unknown board err = %v", err)
	}
}

func TestStats(t *testing.T) {
	svc, app, board, mara := setup(t)
	testutil.Request(t, app, board, mara, "Idea A", "pending", 0)
	b := testutil.Request(t, app, board, mara, "Idea B", "reviewing", 0)
	testutil.Request(t, app, board, mara, "Idea C", "planned", 0)
	if err := svc.MarkSeen(b.Id); err != nil {
		t.Fatal(err)
	}
	st, err := svc.Stats()
	if err != nil || st.Total != 3 || st.Waiting != 2 || st.New != 2 {
		t.Fatalf("stats = %+v, %v", st, err)
	}
}
