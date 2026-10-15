// Package requests holds the rules for votes, triage and merging.
package requests

import (
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/status"
	"github.com/hacker4ofakind/lort/server/internal/trending"
)

var (
	ErrNotFound  = errors.New("request not found")
	ErrNotVoting = errors.New("this request can't take votes any more")
	ErrUndoGone  = errors.New("it's too late to undo that")
	ErrBadMerge  = errors.New("pick a different request to merge into")
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

// SetStatus applies a triage action. actor is the team member's users profile.
func (s *Service) SetStatus(requestID string, action status.Action, actor *core.Record) (Change, error) {
	var ch Change
	err := s.App.RunInTransaction(func(tx core.App) error {
		r, err := s.find(tx, requestID)
		if err != nil {
			return err
		}
		from := status.Status(r.GetString("status"))
		to, err := status.Next(from, action)
		if err != nil {
			return err
		}
		r.Set("status", string(to))
		if action == status.Accept && r.GetBool("awaitingApproval") {
			r.Set("awaitingApproval", false)
			r.Set("visible", true)
		}
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
		r.Set("status", string(from))
		if err := tx.Save(r); err != nil {
			return err
		}
		ch = Change{From: status.Completed, To: from, Roadmap: status.RoadmapChange(status.Completed, from)}
		return tx.Delete(last[0])
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
func (s *Service) RecomputeTrending() error {
	open, err := s.App.FindAllRecords("requests", dbx.NotIn("status", "completed", "closed"))
	if err != nil {
		return err
	}
	for _, r := range open {
		r.Set("trendScore", trending.Score(r.GetInt("upvoteCount"), r.GetDateTime("created").Time(), s.Now()))
		if err := s.App.SaveNoValidate(r); err != nil {
			return fmt.Errorf("trending %s: %w", r.Id, err)
		}
	}
	return nil
}

// MarkSeen records that the team has opened a request, which clears its "New" marker.
func (s *Service) MarkSeen(requestID string) error {
	r, err := s.find(s.App, requestID)
	if err != nil {
		return err
	}
	if !r.GetDateTime("teamSeenAt").IsZero() {
		return nil
	}
	r.Set("teamSeenAt", s.Now())
	return s.App.Save(r)
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
func (s *Service) AfterCreate(r, author *core.Record) error {
	return s.App.RunInTransaction(func(tx core.App) error {
		if err := addVote(tx, author.Id, r.Id); err != nil {
			return err
		}
		if _, err := s.recount(tx, r); err != nil {
			return err
		}
		return logActivity(tx, r.Id, author, "created", "", "")
	})
}
