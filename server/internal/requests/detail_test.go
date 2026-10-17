package requests_test

import (
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/requests"
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

func TestDetailThreadsCommentsAndHidesInternalNotes(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Dark mode", "reviewing", 3)
	devon := testutil.User(t, app, "devon@example.com")
	top := comment(t, app, r, devon, "Same on iOS", "", false)
	comment(t, app, r, mara, "Thanks devon", top.Id, false)
	comment(t, app, r, mara, "Reproduced it", "", true)

	pub, err := svc.Detail(r.Id, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if !pub.Public || pub.Votes != 3 || len(pub.Thread) != 1 || len(pub.Thread[0].Replies) != 1 {
		t.Fatalf("public detail = %+v", pub)
	}
	if pub.Comments != 2 || pub.Thread[0].Author.Name != "devon" {
		t.Errorf("comments = %d, author = %q", pub.Comments, pub.Thread[0].Author.Name)
	}
	team, err := svc.Detail(r.Id, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(team.Thread) != 2 || !team.Thread[1].Internal || team.Comments != 3 {
		t.Errorf("team thread = %+v, comments = %d", team.Thread, team.Comments)
	}
}

func TestDetailVisibility(t *testing.T) {
	svc, app, board, mara := setup(t)
	devon := testutil.User(t, app, "devon@example.com")
	r := testutil.Request(t, app, board, mara, "Waiting one", "pending", 1)
	r.Set("visible", false)
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Detail(r.Id, nil, false); !errors.Is(err, requests.ErrNotFound) {
		t.Errorf("anonymous err = %v", err)
	}
	if _, err := svc.Detail(r.Id, devon, false); !errors.Is(err, requests.ErrNotFound) {
		t.Errorf("other user err = %v", err)
	}
	if d, err := svc.Detail(r.Id, mara, false); err != nil || d.Public {
		t.Errorf("author detail = %+v, %v", d, err)
	}
	if _, err := svc.Detail(r.Id, nil, true); err != nil {
		t.Errorf("team err = %v", err)
	}
}

func TestDetailMergedIntoAndTimeline(t *testing.T) {
	svc, app, board, mara := setup(t)
	private := testutil.Board(t, app, "Internal", false, false)
	src := testutil.Request(t, app, board, mara, "Night theme", "pending", 0)
	dst := testutil.Request(t, app, board, mara, "Dark mode", "planned", 0)
	secret := testutil.Request(t, app, private, mara, "Secret", "pending", 0)
	other := testutil.Request(t, app, board, mara, "Dusk theme", "pending", 0)
	if err := svc.Merge(src.Id, dst.Id, mara); err != nil {
		t.Fatal(err)
	}
	if err := svc.Merge(other.Id, secret.Id, mara); err != nil {
		t.Fatal(err)
	}

	d, err := svc.Detail(src.Id, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if d.MergedInto == nil || d.MergedInto.Name != "Dark mode" {
		t.Fatalf("mergedInto = %+v", d.MergedInto)
	}
	if len(d.Activity) != 1 || d.Activity[0].Kind != "merged_in" || d.Activity[0].Ref == nil ||
		d.Activity[0].Ref.ID != dst.Id || d.Activity[0].Actor.Name != "mara" {
		t.Errorf("activity = %+v", d.Activity)
	}
	o, err := svc.Detail(other.Id, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if o.MergedInto != nil || o.Activity[0].Ref != nil {
		t.Errorf("a private target must not leak: %+v %+v", o.MergedInto, o.Activity[0].Ref)
	}
}
