package requests_test

import (
	"testing"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestListPublicScope(t *testing.T) {
	svc, app, board, mara := setup(t)
	private := testutil.Board(t, app, "Internal", false, false)
	devon := testutil.User(t, app, "devon@example.com")
	testutil.Request(t, app, board, mara, "Dark mode", "planned", 48)
	testutil.Request(t, app, private, mara, "Secret roadmap", "pending", 1)
	hidden := testutil.Request(t, app, board, devon, "Waiting one", "pending", 1)
	hidden.Set("visible", false)
	hidden.Set("awaitingApproval", true)
	if err := app.Save(hidden); err != nil {
		t.Fatal(err)
	}

	anon, err := svc.List(requests.Query{}, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if anon.TotalItems != 1 || anon.Items[0].Title != "Dark mode" {
		t.Fatalf("anonymous sees %+v", anon.Items)
	}
	own, _ := svc.List(requests.Query{}, devon, false)
	if own.TotalItems != 2 {
		t.Errorf("author should also see their request awaiting approval, got %d", own.TotalItems)
	}
	team, _ := svc.List(requests.Query{}, nil, true)
	if team.TotalItems != 3 || !team.Items[0].New {
		t.Errorf("team sees %d items, new=%v", team.TotalItems, team.Items[0].New)
	}
}

func TestListFiltersSortAndVoted(t *testing.T) {
	svc, app, board, mara := setup(t)
	bugs := testutil.Board(t, app, "Bugs", true, false)
	a := testutil.Request(t, app, board, mara, "Export entries as Markdown", "progress", 0)
	testutil.Request(t, app, bugs, mara, "Sync drops entries", "reviewing", 0)
	testutil.Request(t, app, board, mara, "Calendar heatmap", "completed", 0)
	if _, _, err := svc.ToggleVote(a.Id, mara.Id); err != nil {
		t.Fatal(err)
	}

	open, _ := svc.List(requests.Query{Statuses: []string{"pending", "reviewing", "planned", "progress"}, Sort: "top"}, mara, false)
	if open.TotalItems != 2 || open.Items[0].ID != a.Id || !open.Items[0].Voted {
		t.Fatalf("open = %+v", open.Items)
	}
	inBugs, _ := svc.List(requests.Query{Boards: []string{bugs.Id}}, nil, false)
	if inBugs.TotalItems != 1 || inBugs.Items[0].Board.Name != "Bugs" {
		t.Errorf("bugs = %+v", inBugs.Items)
	}
	found, _ := svc.List(requests.Query{Search: "markdown export"}, nil, false)
	if found.TotalItems != 1 || found.Items[0].ID != a.Id {
		t.Errorf("search = %+v", found.Items)
	}
	none, _ := svc.List(requests.Query{Search: `"); DROP TABLE requests; --`}, nil, false)
	if none.TotalItems != 0 {
		t.Errorf("hostile search matched %d", none.TotalItems)
	}
}

func TestSimilarOnlyOpen(t *testing.T) {
	svc, app, board, mara := setup(t)
	testutil.Request(t, app, board, mara, "Dark mode for the editor", "planned", 9)
	testutil.Request(t, app, board, mara, "Dark mode for widgets", "completed", 3)
	got, err := svc.Similar("dark mod", 3)
	if err != nil || len(got) != 1 || got[0].Status != "planned" {
		t.Fatalf("similar = %+v, %v", got, err)
	}
}
