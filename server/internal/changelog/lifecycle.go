package changelog

import (
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/schema"
	"github.com/hacker4ofakind/lort/server/internal/status"
)

// Publish puts a post live now. actor (the publishing admin's team profile; may be nil) is who
// completes the attached requests when the post asks for that.
func (s *Service) Publish(id string, actor *core.Record) (PublishResult, error) {
	var res PublishResult
	err := s.App.RunInTransaction(func(tx core.App) error {
		r, err := find(tx, id)
		if err != nil {
			return err
		}
		if r.GetString("state") == Published {
			return ErrLive
		}
		n, err := s.publish(tx, r, actor)
		if err != nil {
			return err
		}
		res = PublishResult{Post: teamPost(tx, r), Completed: n}
		return nil
	})
	return res, err
}

// readyToGo refuses a post that would go out without a title or an address.
func readyToGo(r *core.Record) error {
	if strings.TrimSpace(r.GetString("title")) == "" {
		return ErrNoTitle
	}
	if r.GetString("slug") == "" {
		return ErrNoSlug
	}
	return nil
}

// publish is the shared part of Publish and the scheduled publish, inside tx: it sets the post
// live, keeps the first publication date, drops images the body no longer uses and completes the
// attached requests when asked. It returns how many requests it completed.
func (s *Service) publish(tx core.App, r, actor *core.Record) (int, error) {
	if err := readyToGo(r); err != nil {
		return 0, err
	}
	r.Set("state", Published)
	if r.GetDateTime("publishedAt").IsZero() {
		r.Set("publishedAt", s.Now().UTC())
	}
	r.Set("publishAt", "")
	r.Set("scheduledBy", "")
	r.Set("publishError", "")
	// Only here: on autosave this would race an upload whose body save hasn't landed yet.
	body := r.GetString("body")
	var keep []string
	for _, name := range r.GetStringSlice("images") {
		if referenced(body, name) {
			keep = append(keep, name)
		}
	}
	r.Set("images", keep)
	if err := tx.Save(r); err != nil {
		return 0, err
	}
	if !r.GetBool("completeAttached") {
		return 0, nil
	}
	svc := requests.New(tx)
	completed := 0
	for _, rid := range r.GetStringSlice("requests") {
		req, err := tx.FindRecordById(schema.Requests, rid)
		if err != nil || req.GetString("mergedInto") != "" || status.Ship(status.Status(req.GetString("status"))) != nil {
			continue
		}
		if _, err := svc.Ship(rid, actor); err != nil {
			return 0, err
		}
		completed++
	}
	return completed, nil
}

// referenced reports whether body links to the post's file name: "/<name>" followed by
// something that can't continue a file name, so "a.png" isn't found inside "/a.png2".
func referenced(body, name string) bool {
	needle := "/" + name
	for i := 0; ; {
		j := strings.Index(body[i:], needle)
		if j < 0 {
			return false
		}
		end := i + j + len(needle)
		if end == len(body) || !fileNameChar(body[end]) {
			return true
		}
		i = i + j + 1
	}
}

func fileNameChar(c byte) bool {
	return c == '_' || c == '-' || c == '.' || c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
}

// Schedule makes a post go live at `at` (rescheduling moves the time). It refuses a past time
// and, like Publish, a post without a title or address, so it can't fail later for that.
func (s *Service) Schedule(id string, at time.Time, actor *core.Record) (TeamPost, error) {
	if !at.After(s.Now()) {
		return TeamPost{}, ErrPast
	}
	return s.change(id, func(tx core.App, r *core.Record) error {
		if r.GetString("state") == Published {
			return ErrLive
		}
		if err := readyToGo(r); err != nil {
			return err
		}
		r.Set("state", Scheduled)
		r.Set("publishAt", at.UTC())
		r.Set("scheduledBy", "")
		if actor != nil {
			r.Set("scheduledBy", actor.Id)
		}
		r.Set("publishError", "")
		return nil
	})
}

// Unschedule takes a scheduled post back to drafts. Nothing goes out.
func (s *Service) Unschedule(id string) (TeamPost, error) {
	return s.change(id, func(tx core.App, r *core.Record) error {
		if r.GetString("state") != Scheduled {
			return ErrNotScheduled
		}
		r.Set("state", Draft)
		r.Set("publishAt", "")
		r.Set("scheduledBy", "")
		return nil
	})
}

// Unpublish takes a live post back to drafts. Its address and first publication date stay.
func (s *Service) Unpublish(id string) (TeamPost, error) {
	return s.change(id, func(tx core.App, r *core.Record) error {
		if r.GetString("state") != Published {
			return ErrNotLive
		}
		r.Set("state", Draft)
		return nil
	})
}

// change re-reads the post inside a transaction, lets apply change it and saves it, so a click
// and the cron can't both act on the same state.
func (s *Service) change(id string, apply func(tx core.App, r *core.Record) error) (TeamPost, error) {
	var p TeamPost
	err := s.App.RunInTransaction(func(tx core.App) error {
		r, err := find(tx, id)
		if err != nil {
			return err
		}
		if err := apply(tx, r); err != nil {
			return err
		}
		if err := tx.Save(r); err != nil {
			return err
		}
		p = teamPost(tx, r)
		return nil
	})
	return p, err
}
