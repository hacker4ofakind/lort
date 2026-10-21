package requests

import (
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// restoring holds the requests whose statusChangedAt is being put back by Undo. Inferring that
// from the value (it differs from the stored one) fails when the restored time happens to equal
// the stored millisecond, so the caller says so outright.
var restoring sync.Map

// keepStatusTime tells the stamp hook to leave request id's statusChangedAt as the caller set it,
// until the returned function is called.
func keepStatusTime(id string) (release func()) {
	restoring.Store(id, struct{}{})
	return func() { restoring.Delete(id) }
}

// BindStatusTime keeps requests.statusChangedAt true for every write path: a new request gets
// now, and a save that changes the status gets now unless the caller set the field itself
// (UndoComplete does, to restore the old time). It uses the model-level hooks, so SetStatus,
// Merge, the roadmap move, a superuser's record-API edit and later integrations all stamp it.
// Writes that go through DB() directly (RecomputeTrending, Recount) run no hooks and never stamp.
func BindStatusTime(app core.App) {
	app.OnRecordCreate("requests").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetDateTime("statusChangedAt").IsZero() {
			e.Record.Set("statusChangedAt", time.Now())
		}
		return e.Next()
	})
	app.OnRecordUpdate("requests").BindFunc(func(e *core.RecordEvent) error {
		orig := e.Record.Original()
		_, keep := restoring.Load(e.Record.Id)
		if !keep && orig != nil &&
			e.Record.GetString("status") != orig.GetString("status") &&
			e.Record.GetDateTime("statusChangedAt").Time().Equal(orig.GetDateTime("statusChangedAt").Time()) {
			e.Record.Set("statusChangedAt", time.Now())
		}
		return e.Next()
	})
}

// previousStatusTime is when a request entered the status it had before its latest status
// change or merge was undone: the time of the latest remaining such activity, else its creation.
func previousStatusTime(app core.App, r *core.Record) (types.DateTime, error) {
	last, err := app.FindRecordsByFilter("activity", "request = {:r} && (kind = 'status_changed' || kind = 'merged_in')",
		"-created", 1, 0, dbx.Params{"r": r.Id})
	if err != nil {
		return types.DateTime{}, err
	}
	if len(last) > 0 {
		return last[0].GetDateTime("created"), nil
	}
	return r.GetDateTime("created"), nil
}
