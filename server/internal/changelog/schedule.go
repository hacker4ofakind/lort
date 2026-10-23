package changelog

import (
	"errors"
	"log"
	"time"

	"github.com/pocketbase/dbx"
	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/hacker4ofakind/lort/server/internal/schema"
)

const (
	// retryFor is how long a passing error (a busy database, a disk hiccup) is retried each
	// minute before the post goes back to drafts.
	retryFor = 10 * time.Minute
	// lateCutoff is how overdue a post may be and still go out by itself, after downtime or a
	// restored backup. Anything older waits for the team.
	lateCutoff = 72 * time.Hour

	msgRetryGaveUp = "Something went wrong while publishing it. Publish it now or pick a new time."
	msgTooLate     = "It was due more than 3 days ago, so it wasn't published. Publish it now or pick a new time."

	errorMax = 300
)

var (
	errSkip = errors.New("not due any more")
	errLate = errors.New(msgTooLate)
)

// PublishDue publishes every scheduled post whose time has come, oldest first. It runs every
// minute and once at boot. One post's failure never stops the others: a content problem sends it
// back to drafts with the reason, a passing error is retried next minute (for 10 minutes), and a
// post over 3 days late goes back to drafts without being published.
func (s *Service) PublishDue() error {
	now := s.Now()
	stamp, err := types.ParseDateTime(now)
	if err != nil {
		return err
	}
	var ids []string
	err = s.App.DB().Select("id").From(schema.Changelogs).
		Where(dbx.HashExp{"state": Scheduled}).
		AndWhere(dbx.NewExp("publishAt != '' AND publishAt <= {:now}", dbx.Params{"now": stamp.String()})).
		OrderBy("publishAt ASC", "id ASC").Column(&ids)
	if err != nil {
		return err
	}
	for _, id := range ids {
		if s.between != nil {
			s.between(id)
		}
		s.publishDue(id, now)
	}
	return nil
}

// publishDue publishes one due post on its own path, not Publish's: cron runs can overlap (the
// boot run and the first tick), so it goes on only while the post is still scheduled and due.
// Anything else (unscheduled, moved, already published by a click) is a quiet skip.
func (s *Service) publishDue(id string, now time.Time) {
	var title string
	var due time.Time
	err := s.App.RunInTransaction(func(tx core.App) error {
		r, err := tx.FindRecordById(schema.Changelogs, id)
		if err != nil {
			return errSkip
		}
		due = r.GetDateTime("publishAt").Time()
		if r.GetString("state") != Scheduled || due.IsZero() || due.After(now) {
			return errSkip
		}
		title = r.GetString("title")
		if now.Sub(due) > lateCutoff {
			return errLate
		}
		if s.failSave != nil {
			if err := s.failSave(id); err != nil {
				return err
			}
		}
		_, err = s.publish(tx, r, scheduler(tx, r))
		return err
	})
	switch {
	case err == nil, errors.Is(err, errSkip):
		return
	case errors.Is(err, errLate):
		s.fail(id, title, msgTooLate)
	case isContentError(err):
		s.fail(id, title, reason(err))
	case now.Sub(due) > retryFor:
		log.Printf("Couldn't publish “%s” on schedule after retrying: %v", title, err)
		s.fail(id, title, msgRetryGaveUp)
	default:
		log.Printf("Couldn't publish “%s” yet, trying again in a minute: %v", title, err)
	}
}

// scheduler is who completes a scheduled post's requests: whoever scheduled it, else its author.
func scheduler(app core.App, r *core.Record) *core.Record {
	for _, field := range []string{"scheduledBy", "author"} {
		if id := r.GetString(field); id != "" {
			if u, err := app.FindRecordById(schema.Users, id); err == nil {
				return u
			}
		}
	}
	return nil
}

// isContentError reports whether a publish failed because of the post itself, so retrying
// can't help.
func isContentError(err error) bool {
	var api *router.ApiError
	var verr validation.Errors
	return errors.Is(err, ErrNoTitle) || errors.Is(err, ErrNoSlug) || errors.As(err, &api) || errors.As(err, &verr)
}

// reason is the sentence the team sees for a content error.
func reason(err error) string {
	var api *router.ApiError
	if errors.As(err, &api) {
		return api.Message
	}
	return err.Error()
}

// fail sends a post that didn't go out back to drafts with why. It reads the post fresh in its
// own transaction (never the copy from the rolled-back attempt, which carries a publication date
// and pruned images) and acts only if the post is still scheduled. publishAt stays, so the banner
// can say when it was due.
func (s *Service) fail(id, title, msg string) {
	log.Printf("Couldn't publish “%s” on schedule: %s", title, msg)
	err := s.App.RunInTransaction(func(tx core.App) error {
		r, err := tx.FindRecordById(schema.Changelogs, id)
		if err != nil || r.GetString("state") != Scheduled {
			return nil
		}
		r.Set("state", Draft)
		r.Set("publishError", capRunes(msg, errorMax))
		// The post may be what failed validation, so its state change must not depend on it.
		return tx.SaveNoValidate(r)
	})
	if err != nil {
		log.Printf("Couldn't move “%s” back to drafts: %v", title, err)
	}
}

// capRunes cuts s to at most n runes.
func capRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
