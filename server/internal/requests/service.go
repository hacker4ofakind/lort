// Package requests holds the rules for votes, triage and merging.
package requests

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/hacker4ofakind/lort/server/internal/status"
	"github.com/hacker4ofakind/lort/server/internal/trending"
)

var (
	ErrNotFound  = errors.New("request not found")
	ErrNotVoting = errors.New("this request can't take votes any more")
	ErrUndoGone  = errors.New("it's too late to undo that")
	ErrBadMerge  = errors.New("pick a different request to merge into")

	// These two are shown to the team as they are, so they read as sentences.
	ErrNotOnRoadmap = errors.New("That request isn't on the roadmap any more.")
	ErrMoved        = errors.New("Someone moved that card meanwhile.")
)

// UndoWindow is how long a completion can be undone (and how long its emails wait).
const UndoWindow = 60 * time.Second

type Service struct {
	App core.App
	Now func() time.Time
}

func New(app core.App) *Service {
	return &Service{App: app, Now: time.Now}
}

// Change is the result of a status change.
type Change struct {
	From    status.Status `json:"from"`
	To      status.Status `json:"to"`
	Roadmap string        `json:"roadmap"` // "added", "removed" or ""
}

func (s *Service) find(app core.App, id string) (*core.Record, error) {
	r, err := app.FindRecordById("requests", id)
	if err != nil {
		return nil, ErrNotFound
	}
	return r, nil
}

// ToggleVote adds userID's vote to the request, or removes it if it is already there.
func (s *Service) ToggleVote(requestID, userID string) (voted bool, count int, err error) {
	err = s.App.RunInTransaction(func(tx core.App) error {
		r, err := s.find(tx, requestID)
		if err != nil {
			return err
		}
		if ok, err := canSee(tx, r, userID); err != nil || !ok {
			return ErrNotFound
		}
		if st := status.Status(r.GetString("status")); st == status.Closed || r.GetString("mergedInto") != "" {
			return ErrNotVoting
		}
		existing, _ := tx.FindFirstRecordByFilter("votes", "user = {:u} && request = {:r}", dbx.Params{"u": userID, "r": requestID})
		if existing != nil {
			if err := tx.Delete(existing); err != nil {
				return err
			}
		} else {
			if err := addVote(tx, userID, requestID); err != nil {
				return err
			}
			voted = true
		}
		count, err = s.recount(tx, r)
		return err
	})
	return voted, count, err
}

// canSee reports whether a user may see (and so vote on) a request: it is public,
// it is theirs, or they are on the team.
func canSee(app core.App, r *core.Record, userID string) (bool, error) {
	u, err := app.FindRecordById("users", userID)
	if err != nil {
		return false, err
	}
	if u.GetBool("isAdmin") || r.GetString("author") == userID {
		return true, nil
	}
	if !r.GetBool("visible") {
		return false, nil
	}
	b, err := app.FindRecordById("boards", r.GetString("board"))
	if err != nil {
		return false, err
	}
	return b.GetBool("isPublic"), nil
}

func addVote(app core.App, userID, requestID string) error {
	c, err := app.FindCollectionByNameOrId("votes")
	if err != nil {
		return err
	}
	v := core.NewRecord(c)
	v.Set("user", userID)
	v.Set("request", requestID)
	return app.Save(v)
}

// recount stores the request's real vote count and trend score and returns the count.
func (s *Service) recount(app core.App, r *core.Record) (int, error) {
	n, err := app.CountRecords("votes", dbx.HashExp{"request": r.Id})
	if err != nil {
		return 0, err
	}
	r.Set("upvoteCount", n)
	r.Set("trendScore", trending.Score(int(n), r.GetDateTime("created").Time(), s.Now()))
	return int(n), app.Save(r)
}

// Recount refreshes a request's stored vote count and trend score from its votes.
// It updates only those two columns, so it is safe inside other writes (the votes hook
// calls it when a deleted account takes its votes with it). A missing request is skipped.
func (s *Service) Recount(app core.App, requestID string) error {
	var row struct {
		Created string `db:"created"`
		N       int    `db:"n"`
	}
	err := app.DB().NewQuery("SELECT created, (SELECT count(*) FROM votes WHERE request = {:id}) AS n FROM requests WHERE id = {:id}").
		Bind(dbx.Params{"id": requestID}).One(&row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	created, err := types.ParseDateTime(row.Created)
	if err != nil {
		return err
	}
	_, err = app.DB().Update("requests", dbx.Params{
		"upvoteCount": row.N,
		"trendScore":  trending.Score(row.N, created.Time(), s.Now()),
	}, dbx.HashExp{"id": requestID}).Execute()
	return err
}

// SetStatus applies a triage action. actor is the team member's users profile.
func (s *Service) SetStatus(requestID string, action status.Action, actor *core.Record) (Change, error) {
	return s.changeStatus(requestID, actor, func(r *core.Record) (status.Status, error) {
		to, err := status.Next(status.Status(r.GetString("status")), action)
		if err != nil {
			return "", err
		}
		if action == status.Accept && r.GetBool("awaitingApproval") {
			r.Set("awaitingApproval", false)
			r.Set("visible", true)
		}
		return to, nil
	})
}

// changeStatus is the one place a request's status changes by a team decision: it finds the
// request, lets decide pick the new status (and apply side effects to the record), then saves
// and logs the change in one transaction. decide returning the status the request already has
// means there is nothing to do: no save and no timeline entry. Completion emails, webhooks and
// the like belong here, so every route that changes a status gets them.
func (s *Service) changeStatus(requestID string, actor *core.Record, decide func(r *core.Record) (status.Status, error)) (Change, error) {
	var ch Change
	err := s.App.RunInTransaction(func(tx core.App) error {
		r, err := s.find(tx, requestID)
		if err != nil {
			return err
		}
		from := status.Status(r.GetString("status"))
		to, err := decide(r)
		if err != nil {
			return err
		}
		if to == from {
			ch = Change{From: from, To: to}
			return nil
		}
		r.Set("status", string(to))
		if err := tx.Save(r); err != nil {
			return err
		}
		ch = Change{From: from, To: to, Roadmap: status.RoadmapChange(from, to)}
		return logActivity(tx, r.Id, actor, "status_changed", string(from), string(to))
	})
	return ch, err
}

// UndoComplete reverts a completion made less than UndoWindow ago and removes it from the timeline.
func (s *Service) UndoComplete(requestID string) (Change, error) {
	var ch Change
	err := s.App.RunInTransaction(func(tx core.App) error {
		r, err := s.find(tx, requestID)
		if err != nil {
			return err
		}
		if r.GetString("status") != string(status.Completed) {
			return ErrUndoGone
		}
		last, err := tx.FindRecordsByFilter("activity", "request = {:r} && kind = 'status_changed'", "-created", 1, 0, dbx.Params{"r": r.Id})
		if err != nil || len(last) == 0 || last[0].GetString("to") != string(status.Completed) {
			return ErrUndoGone
		}
		if s.Now().Sub(last[0].GetDateTime("created").Time()) > UndoWindow {
			return ErrUndoGone
		}
		from := status.Status(last[0].GetString("from"))
		if err := tx.Delete(last[0]); err != nil {
			return err
		}
		// The request goes back to the time it entered the old status, which the stamp hook
		// leaves alone because the field changed with the status.
		since, err := previousStatusTime(tx, r)
		if err != nil {
			return err
		}
		r.Set("status", string(from))
		r.Set("statusChangedAt", since)
		if err := tx.Save(r); err != nil {
			return err
		}
		ch = Change{From: status.Completed, To: from, Roadmap: status.RoadmapChange(status.Completed, from)}
		return nil
	})
	return ch, err
}

// Merge closes source, points it at target and moves its voters over.
func (s *Service) Merge(sourceID, targetID string, actor *core.Record) error {
	if sourceID == targetID {
		return ErrBadMerge
	}
	return s.App.RunInTransaction(func(tx core.App) error {
		src, err := s.find(tx, sourceID)
		if err != nil {
			return err
		}
		dst, err := s.find(tx, targetID)
		if err != nil {
			return err
		}
		if dst.GetString("mergedInto") != "" || src.GetString("mergedInto") != "" {
			return ErrBadMerge
		}
		votes, err := tx.FindAllRecords("votes", dbx.HashExp{"request": src.Id})
		if err != nil {
			return err
		}
		for _, v := range votes {
			user := v.GetString("user")
			dup, _ := tx.FindFirstRecordByFilter("votes", "user = {:u} && request = {:r}", dbx.Params{"u": user, "r": dst.Id})
			if dup == nil {
				if err := addVote(tx, user, dst.Id); err != nil {
					return err
				}
			}
		}
		from := src.GetString("status")
		src.Set("status", string(status.Closed))
		src.Set("mergedInto", dst.Id)
		if err := tx.Save(src); err != nil {
			return err
		}
		if _, err := s.recount(tx, dst); err != nil {
			return err
		}
		if err := logActivity(tx, src.Id, actor, "merged_in", from, dst.Id); err != nil {
			return err
		}
		return logActivity(tx, dst.Id, actor, "merged_from", src.Id, "")
	})
}

// RecomputeTrending refreshes the trend score of every open request. Run hourly.
// It writes only trendScore, and only while the vote count it read is still current, so it
// never undoes a vote or a status change made meanwhile and leaves "updated" alone.
func (s *Service) RecomputeTrending() error {
	var rows []struct {
		ID      string `db:"id"`
		Created string `db:"created"`
		Votes   int    `db:"upvoteCount"`
	}
	err := s.App.DB().Select("id", "created", "upvoteCount").From("requests").
		Where(dbx.NotIn("status", "completed", "closed")).All(&rows)
	if err != nil {
		return err
	}
	for _, r := range rows {
		created, err := types.ParseDateTime(r.Created)
		if err != nil {
			return fmt.Errorf("trending %s: %w", r.ID, err)
		}
		_, err = s.App.DB().Update("requests",
			dbx.Params{"trendScore": trending.Score(r.Votes, created.Time(), s.Now())},
			dbx.HashExp{"id": r.ID, "upvoteCount": r.Votes}).Execute()
		if err != nil {
			return fmt.Errorf("trending %s: %w", r.ID, err)
		}
	}
	return nil
}

// MarkSeen records that the team has opened a request, which clears its "New" marker.
// It reads the request inside the write transaction so it can't save over a concurrent change.
func (s *Service) MarkSeen(requestID string) error {
	return s.App.RunInTransaction(func(tx core.App) error {
		r, err := s.find(tx, requestID)
		if err != nil {
			return err
		}
		if !r.GetDateTime("teamSeenAt").IsZero() {
			return nil
		}
		r.Set("teamSeenAt", s.Now())
		return tx.Save(r)
	})
}

func logActivity(app core.App, requestID string, actor *core.Record, kind, from, to string) error {
	c, err := app.FindCollectionByNameOrId("activity")
	if err != nil {
		return err
	}
	a := core.NewRecord(c)
	a.Set("request", requestID)
	if actor != nil {
		a.Set("actor", actor.Id)
		a.Set("actorName", actor.GetString("name"))
	}
	a.Set("kind", kind)
	a.Set("from", from)
	a.Set("to", to)
	return app.Save(a)
}

// AfterCreate gives a new request its author's vote, its trend score and its "posted this" entry.
// app is the transaction that created r, so a failure here undoes the request too.
func (s *Service) AfterCreate(app core.App, r, author *core.Record) error {
	return app.RunInTransaction(func(tx core.App) error {
		if err := addVote(tx, author.Id, r.Id); err != nil {
			return err
		}
		if _, err := s.recount(tx, r); err != nil {
			return err
		}
		return logActivity(tx, r.Id, author, "created", "", "")
	})
}

// LogJoinedRoadmap records that a request was created straight into a roadmap column, as the
// team member who did it, so the timeline reads "posted this", then "Pending → Planned".
func (s *Service) LogJoinedRoadmap(app core.App, r, actor *core.Record, to status.Status) error {
	return logActivity(app, r.Id, actor, "status_changed", string(status.Pending), string(to))
}
