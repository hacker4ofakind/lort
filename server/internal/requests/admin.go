package requests

import (
	"errors"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

var (
	ErrNoBoard       = errors.New("pick a board")
	ErrLastBoard     = errors.New("a board needs somewhere to live, so keep at least one")
	ErrBoardNotEmpty = errors.New("move this board's requests to another board first")
)

// MoveBoard moves a request to another board and notes it on the timeline.
func (s *Service) MoveBoard(requestID, boardID string, actor *core.Record) error {
	return s.App.RunInTransaction(func(tx core.App) error {
		r, err := s.find(tx, requestID)
		if err != nil {
			return err
		}
		return moveBoard(tx, r, boardID, actor)
	})
}

func moveBoard(app core.App, r *core.Record, boardID string, actor *core.Record) error {
	to, err := app.FindRecordById("boards", boardID)
	if err != nil {
		return ErrNoBoard
	}
	fromID := r.GetString("board")
	if fromID == to.Id {
		return nil
	}
	fromName := ""
	if from, err := app.FindRecordById("boards", fromID); err == nil {
		fromName = from.GetString("name")
	}
	r.Set("board", to.Id)
	if err := app.Save(r); err != nil {
		return err
	}
	return logActivity(app, r.Id, actor, "board_changed", fromName, to.GetString("name"))
}

// DeleteBoard deletes a board. A board with requests needs moveTo, the board that takes them.
func (s *Service) DeleteBoard(boardID, moveTo string, actor *core.Record) error {
	return s.App.RunInTransaction(func(tx core.App) error {
		b, err := tx.FindRecordById("boards", boardID)
		if err != nil {
			return ErrNoBoard
		}
		if n, err := tx.CountRecords("boards"); err != nil || n <= 1 {
			if err != nil {
				return err
			}
			return ErrLastBoard
		}
		recs, err := tx.FindAllRecords("requests", dbx.HashExp{"board": b.Id})
		if err != nil {
			return err
		}
		if len(recs) > 0 && (moveTo == "" || moveTo == b.Id) {
			return ErrBoardNotEmpty
		}
		for _, r := range recs {
			if err := moveBoard(tx, r, moveTo, actor); err != nil {
				return err
			}
		}
		return tx.Delete(b)
	})
}

// Reassign makes author the author of a request that a team member posted for them: the
// request, its "posted this" timeline entry and its automatic vote move to the new author.
func (s *Service) Reassign(requestID string, author *core.Record) error {
	return s.App.RunInTransaction(func(tx core.App) error {
		r, err := s.find(tx, requestID)
		if err != nil {
			return err
		}
		old := r.GetString("author")
		if old == author.Id {
			return nil
		}
		if old != "" {
			v, _ := tx.FindFirstRecordByFilter("votes", "user = {:u} && request = {:r}", dbx.Params{"u": old, "r": r.Id})
			if v != nil {
				if err := tx.Delete(v); err != nil {
					return err
				}
			}
		}
		dup, _ := tx.FindFirstRecordByFilter("votes", "user = {:u} && request = {:r}", dbx.Params{"u": author.Id, "r": r.Id})
		if dup == nil {
			if err := addVote(tx, author.Id, r.Id); err != nil {
				return err
			}
		}
		r.Set("author", author.Id)
		if _, err := s.recount(tx, r); err != nil {
			return err
		}
		created, _ := tx.FindFirstRecordByFilter("activity", "request = {:r} && kind = 'created'", dbx.Params{"r": r.Id})
		if created != nil {
			created.Set("actor", author.Id)
			created.Set("actorName", author.GetString("name"))
			return tx.Save(created)
		}
		return nil
	})
}

// Stats are the dashboard's counts. Merged requests are left out.
type Stats struct {
	Total   int `json:"total"`
	Waiting int `json:"waiting"` // pending or reviewing: waiting for the team
	New     int `json:"new"`     // not opened by the team yet
}

func (s *Service) Stats() (Stats, error) {
	var st Stats
	err := s.App.DB().NewQuery(`SELECT
		count(*) AS total,
		coalesce(sum(status IN ('pending', 'reviewing')), 0) AS waiting,
		coalesce(sum(teamSeenAt = ''), 0) AS new
		FROM requests WHERE mergedInto = ''`).Row(&st.Total, &st.Waiting, &st.New)
	return st, err
}
