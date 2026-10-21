package requests

import (
	"testing"
	"time"

	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

// Undo's bypass covers the record it is saving and nothing else: an independent save of the
// same request, running at the same time, is still stamped.
func TestKeepStatusTimeOnlyCoversTheRecordInstanceItWasGiven(t *testing.T) {
	app := testutil.NewApp(t)
	BindStatusTime(app)
	board := testutil.Board(t, app, "Features", true, false)
	user := testutil.User(t, app, "mara@example.com")
	req := testutil.Request(t, app, board, user, "Overlap", "progress", 0)
	old := time.Now().Add(-90 * 24 * time.Hour)
	testutil.SetStatusTime(t, app, req, old)

	undoing, err := app.FindRecordById("requests", req.Id)
	if err != nil {
		t.Fatal(err)
	}
	other, err := app.FindRecordById("requests", req.Id)
	if err != nil {
		t.Fatal(err)
	}
	release := keepStatusTime(undoing)
	defer release()

	// The other save changes the status while the bypass is in force for `undoing`.
	other.Set("status", "completed")
	if err := app.Save(other); err != nil {
		t.Fatal(err)
	}
	got, _ := app.FindRecordById("requests", req.Id)
	if d := time.Since(got.GetDateTime("statusChangedAt").Time()); d > time.Minute {
		t.Errorf("an independent save kept a %s old timestamp", d)
	}

	// ...while the instance the bypass was given keeps the time its caller set.
	undoing.Set("status", "progress")
	undoing.Set("statusChangedAt", old)
	if err := app.Save(undoing); err != nil {
		t.Fatal(err)
	}
	got, _ = app.FindRecordById("requests", req.Id)
	if d := time.Since(got.GetDateTime("statusChangedAt").Time()); d < 89*24*time.Hour {
		t.Errorf("the guarded save was stamped anyway (%s old)", d)
	}
}
