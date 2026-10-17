package requests_test

import (
	"errors"
	"testing"

	"github.com/pocketbase/dbx"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/team"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestMoveBoardLogsTheChange(t *testing.T) {
	svc, app, board, mara := setup(t)
	bugs := testutil.Board(t, app, "Bugs", true, false)
	r := testutil.Request(t, app, board, mara, "Crash on paste", "pending", 0)
	if err := svc.MoveBoard(r.Id, bugs.Id, mara); err != nil {
		t.Fatal(err)
	}
	r, _ = app.FindRecordById("requests", r.Id)
	if r.GetString("board") != bugs.Id {
		t.Fatalf("board = %s", r.GetString("board"))
	}
	a, err := app.FindFirstRecordByFilter("activity", "request = {:r} && kind = 'board_changed'", dbx.Params{"r": r.Id})
	if err != nil || a.GetString("from") != "Features" || a.GetString("to") != "Bugs" {
		t.Fatalf("activity = %v, %v", a, err)
	}
	if err := svc.MoveBoard(r.Id, "missing", mara); !errors.Is(err, requests.ErrNoBoard) {
		t.Errorf("unknown board err = %v", err)
	}
}

func TestDeleteBoardMovesRequestsFirst(t *testing.T) {
	svc, app, board, mara := setup(t)
	bugs := testutil.Board(t, app, "Bugs", true, false)
	r := testutil.Request(t, app, bugs, mara, "Crash on paste", "pending", 0)
	if err := svc.DeleteBoard(bugs.Id, "", mara); !errors.Is(err, requests.ErrBoardNotEmpty) {
		t.Fatalf("err = %v", err)
	}
	if err := svc.DeleteBoard(bugs.Id, board.Id, mara); err != nil {
		t.Fatal(err)
	}
	if _, err := app.FindRecordById("boards", bugs.Id); err == nil {
		t.Error("board still exists")
	}
	r, _ = app.FindRecordById("requests", r.Id)
	if r.GetString("board") != board.Id {
		t.Errorf("request board = %s", r.GetString("board"))
	}
	if err := svc.DeleteBoard(board.Id, "", mara); !errors.Is(err, requests.ErrLastBoard) {
		t.Errorf("last board err = %v", err)
	}
}

func TestReassignMovesAuthorVoteAndTimeline(t *testing.T) {
	svc, app, board, _ := setup(t)
	admin := testutil.User(t, app, "luk@driftnote.app")
	r := testutil.Request(t, app, board, admin, "Calendar view", "pending", 0)
	if err := svc.AfterCreate(app, r, admin); err != nil {
		t.Fatal(err)
	}
	priya, err := team.UserByEmail(app, "priya@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Reassign(r.Id, priya); err != nil {
		t.Fatal(err)
	}
	r, _ = app.FindRecordById("requests", r.Id)
	if r.GetString("author") != priya.Id || r.GetInt("upvoteCount") != 1 {
		t.Fatalf("author = %s, votes = %d", r.GetString("author"), r.GetInt("upvoteCount"))
	}
	if v, _ := app.FindFirstRecordByFilter("votes", "user = {:u}", dbx.Params{"u": admin.Id}); v != nil {
		t.Error("the team member's automatic vote should be gone")
	}
	a, _ := app.FindFirstRecordByFilter("activity", "request = {:r} && kind = 'created'", dbx.Params{"r": r.Id})
	if a.GetString("actor") != priya.Id || a.GetString("actorName") != "priya" {
		t.Errorf("created entry = %s / %s", a.GetString("actor"), a.GetString("actorName"))
	}
}

func TestStatsAndQueue(t *testing.T) {
	svc, app, board, mara := setup(t)
	a := testutil.Request(t, app, board, mara, "Alpha", "pending", 9)
	b := testutil.Request(t, app, board, mara, "Bravo", "reviewing", 5)
	c := testutil.Request(t, app, board, mara, "Charlie", "planned", 1)
	if err := svc.MarkSeen(c.Id); err != nil {
		t.Fatal(err)
	}

	st, err := svc.Stats()
	if err != nil || st != (requests.Stats{Total: 3, Waiting: 2, New: 2}) {
		t.Fatalf("stats = %+v, %v", st, err)
	}

	q := requests.Query{Sort: "top", Statuses: []string{"pending", "reviewing"}}
	info, err := svc.Queue(q, a.Id)
	if err != nil || info != (requests.QueueInfo{Position: 1, Total: 2, Next: b.Id}) {
		t.Fatalf("queue at a = %+v, %v", info, err)
	}
	if info, _ = svc.Queue(q, b.Id); info.Position != 2 || info.Next != "" {
		t.Errorf("queue at b = %+v", info)
	}
	if info, _ = svc.Queue(q, c.Id); info.Position != 0 || info.Next != a.Id {
		t.Errorf("queue from outside = %+v", info)
	}
}
