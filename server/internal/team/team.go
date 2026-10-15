// Package team manages admins: PocketBase superusers, each linked by email to a users profile.
package team

import (
	"errors"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

var (
	ErrRemoveSelf = errors.New("you can't remove yourself")
	ErrLastAdmin  = errors.New("a board needs at least one admin")
)

// InviteValidity is how long an invite link works.
const InviteValidity = 7 * 24 * time.Hour

// NameFromEmail is the default display name: the part before the @.
func NameFromEmail(email string) string {
	name, _, _ := strings.Cut(email, "@")
	if len(name) > 60 {
		name = name[:60]
	}
	return name
}

// Profile returns the users record linked to superuser, creating or promoting it as needed.
func Profile(app core.App, superuser *core.Record) (*core.Record, error) {
	email := superuser.Email()
	p, err := app.FindAuthRecordByEmail("users", email)
	if err != nil {
		c, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return nil, err
		}
		p = core.NewRecord(c)
		p.SetEmail(email)
		p.SetRandomPassword()
		p.SetVerified(true)
		p.Set("name", NameFromEmail(email))
	}
	if p.IsNew() || !p.GetBool("isAdmin") {
		p.Set("isAdmin", true)
		if err := app.Save(p); err != nil {
			return nil, err
		}
	}
	return p, nil
}

// SeedFirstAdmin creates the first superuser and profile from setup's answers.
// It does nothing once any superuser exists.
func SeedFirstAdmin(app core.App, email, password string) error {
	if email == "" || password == "" {
		return nil
	}
	if n, err := app.CountRecords(core.CollectionNameSuperusers); err != nil || n > 0 {
		return err
	}
	c, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		return err
	}
	su := core.NewRecord(c)
	su.SetEmail(email)
	su.SetPassword(password)
	if err := app.Save(su); err != nil {
		return err
	}
	_, err = Profile(app, su)
	return err
}

// Member is one row of Settings → Team.
type Member struct {
	ID      string    `json:"id"`
	Email   string    `json:"email"`
	Name    string    `json:"name"`
	Created time.Time `json:"created"`
}

// List returns every admin, oldest first.
func List(app core.App) ([]Member, error) {
	sus, err := app.FindRecordsByFilter(core.CollectionNameSuperusers, "", "created", 0, 0)
	if err != nil {
		return nil, err
	}
	out := make([]Member, 0, len(sus))
	for _, su := range sus {
		m := Member{ID: su.Id, Email: su.Email(), Created: su.GetDateTime("created").Time()}
		if p, err := app.FindAuthRecordByEmail("users", su.Email()); err == nil {
			m.Name = p.GetString("name")
		}
		out = append(out, m)
	}
	return out, nil
}

// Invite creates a superuser for email (if needed) and returns a link that lets them set a password.
func Invite(app core.App, baseURL, email string) (string, error) {
	su, err := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, email)
	if err != nil {
		c, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
		if err != nil {
			return "", err
		}
		su = core.NewRecord(c)
		su.SetEmail(email)
		su.SetPassword(security.RandomString(32))
		if err := app.Save(su); err != nil {
			return "", err
		}
	}
	if _, err := Profile(app, su); err != nil {
		return "", err
	}
	token, err := su.NewPasswordResetToken()
	if err != nil {
		return "", err
	}
	return strings.TrimRight(baseURL, "/") + "/dashboard/invite?token=" + token, nil
}

// Remove deletes an admin's superuser and demotes their profile.
func Remove(app core.App, actor *core.Record, id string) error {
	if actor.Id == id {
		return ErrRemoveSelf
	}
	return app.RunInTransaction(func(tx core.App) error {
		if n, err := tx.CountRecords(core.CollectionNameSuperusers); err != nil || n <= 1 {
			if err != nil {
				return err
			}
			return ErrLastAdmin
		}
		su, err := tx.FindRecordById(core.CollectionNameSuperusers, id)
		if err != nil {
			return err
		}
		if p, err := tx.FindAuthRecordByEmail("users", su.Email()); err == nil {
			p.Set("isAdmin", false)
			if err := tx.Save(p); err != nil {
				return err
			}
		}
		return tx.Delete(su)
	})
}

// ResetLink returns a password reset link for a board user (works without email).
func ResetLink(app core.App, baseURL, userID string) (string, error) {
	u, err := app.FindRecordById("users", userID)
	if err != nil {
		return "", err
	}
	token, err := u.NewPasswordResetToken()
	if err != nil {
		return "", err
	}
	return strings.TrimRight(baseURL, "/") + "/reset-password?token=" + token, nil
}

// Summary is what the avatar popover shows about a user.
type Summary struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Email    string    `json:"email"`
	Joined   time.Time `json:"joined"`
	Requests int64     `json:"requests"`
	Votes    int64     `json:"votes"`
	Verified bool      `json:"verified"`
	Banned   bool      `json:"banned"`
	Team     bool      `json:"team"`
}

func UserSummary(app core.App, userID string) (Summary, error) {
	u, err := app.FindRecordById("users", userID)
	if err != nil {
		return Summary{}, err
	}
	reqs, _ := app.CountRecords("requests", dbx.HashExp{"author": u.Id})
	votes, _ := app.CountRecords("votes", dbx.HashExp{"user": u.Id})
	return Summary{
		ID: u.Id, Name: u.GetString("name"), Email: u.Email(), Joined: u.GetDateTime("created").Time(),
		Requests: reqs, Votes: votes, Verified: u.Verified(), Banned: u.GetBool("banned"), Team: u.GetBool("isAdmin"),
	}, nil
}

// SetBanned bans or unbans a board user. Admins can't be banned.
func SetBanned(app core.App, userID string, banned bool) error {
	u, err := app.FindRecordById("users", userID)
	if err != nil {
		return err
	}
	if u.GetBool("isAdmin") && banned {
		return errors.New("admins can't be banned")
	}
	u.Set("banned", banned)
	return app.Save(u)
}
