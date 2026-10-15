// Package hooks enforces Lort's rules on PocketBase's own record API.
package hooks

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/team"
)

// Register binds every hook to app.
func Register(app core.App, svc *requests.Service) {
	app.OnRecordCreateRequest("users").BindFunc(onUserCreate)
	app.OnRecordCreateRequest("requests").BindFunc(func(e *core.RecordRequestEvent) error {
		return onRequestCreate(e, svc)
	})
	app.OnRecordUpdateRequest("requests").BindFunc(rejectBanned)
	app.OnRecordCreateRequest("comments").BindFunc(onCommentCreate)
	app.OnRecordDeleteRequest("boards").BindFunc(onBoardDelete)
	// Keep upvoteCount true when votes go away without ToggleVote, e.g. when a deleted
	// account cascades into its votes. PocketBase's own delete handler runs after this one
	// and commits its transaction before returning, so the delete and the recount share a
	// transaction opened here (inside a cascade it is the outer one, reused).
	app.OnRecordDeleteExecute("votes").BindFunc(func(e *core.RecordEvent) error {
		original := e.App
		defer func() { e.App = original }()
		return e.App.RunInTransaction(func(tx core.App) error {
			e.App = tx
			if err := e.Next(); err != nil {
				return err
			}
			return svc.Recount(tx, e.Record.GetString("request"))
		})
	})
}

// honeypot rejects requests whose hidden "website" field was filled in (bots fill every field).
func honeypot(e *core.RecordRequestEvent) error {
	info, err := e.RequestInfo()
	if err != nil {
		return err
	}
	if v, _ := info.Body["website"].(string); v != "" {
		return e.BadRequestError("Something went wrong. Please try again.", nil)
	}
	return nil
}

func onUserCreate(e *core.RecordRequestEvent) error {
	if err := honeypot(e); err != nil {
		return err
	}
	if !e.HasSuperuserAuth() {
		e.Record.Set("isAdmin", false)
		e.Record.Set("banned", false)
	}
	if e.Record.GetString("name") == "" {
		e.Record.Set("name", team.NameFromEmail(e.Record.Email()))
	}
	return e.Next()
}

func rejectBanned(e *core.RecordRequestEvent) error {
	if e.Auth != nil && e.Auth.GetBool("banned") {
		return e.ForbiddenError("Your account can't post on this board.", nil)
	}
	return e.Next()
}

func onRequestCreate(e *core.RecordRequestEvent, svc *requests.Service) error {
	if err := honeypot(e); err != nil {
		return err
	}
	author := e.Auth
	if author == nil || author.GetBool("banned") {
		return e.ForbiddenError("Your account can't post on this board.", nil)
	}
	board, err := e.App.FindRecordById("boards", e.Record.GetString("board"))
	if err != nil || (!board.GetBool("isPublic") && !author.GetBool("isAdmin")) {
		return e.BadRequestError("Pick a board for your idea.", nil)
	}
	info, err := e.RequestInfo()
	if err != nil {
		return err
	}
	internal, _ := info.Body["internal"].(bool)

	r := e.Record
	r.Set("author", author.Id)
	r.Set("status", "pending")
	r.Set("mergedInto", "")
	r.Set("upvoteCount", 0)
	r.Set("teamSeenAt", nil)
	switch {
	case author.GetBool("isAdmin") && internal:
		r.Set("visible", false)
		r.Set("awaitingApproval", false)
	case board.GetBool("requireApproval") && !author.GetBool("isAdmin"):
		r.Set("visible", false)
		r.Set("awaitingApproval", true)
	default:
		r.Set("visible", true)
		r.Set("awaitingApproval", false)
	}
	// Save the request, its author's vote and its timeline entry in one transaction.
	// PocketBase holds the response until the transaction commits, so the reply carries
	// the real vote count and a failure leaves nothing behind.
	return e.App.RunInTransaction(func(tx core.App) error {
		e.App = tx
		if err := e.Next(); err != nil {
			return err
		}
		return svc.AfterCreate(tx, r, author)
	})
}

func onCommentCreate(e *core.RecordRequestEvent) error {
	if err := honeypot(e); err != nil {
		return err
	}
	author := e.Auth
	if author == nil || author.GetBool("banned") {
		return e.ForbiddenError("Your account can't post on this board.", nil)
	}
	c := e.Record
	req, err := e.App.FindRecordById("requests", c.GetString("request"))
	if err != nil {
		return e.NotFoundError("That request is gone.", nil)
	}
	admin := author.GetBool("isAdmin")
	board, _ := e.App.FindRecordById("boards", req.GetString("board"))
	public := req.GetBool("visible") && board != nil && board.GetBool("isPublic")
	if !admin && !public && req.GetString("author") != author.Id {
		return e.NotFoundError("That request is gone.", nil)
	}
	if !admin {
		c.Set("internal", false)
	}
	if parentID := c.GetString("parent"); parentID != "" {
		parent, err := e.App.FindRecordById("comments", parentID)
		if err != nil || parent.GetString("request") != req.Id || parent.GetString("parent") != "" {
			return e.BadRequestError("You can only reply to a top-level comment.", nil)
		}
	}
	c.Set("author", author.Id)
	return e.Next()
}

func onBoardDelete(e *core.RecordRequestEvent) error {
	n, err := e.App.CountRecords("requests", dbx.HashExp{"board": e.Record.Id})
	if err != nil {
		return err
	}
	if n > 0 {
		return e.BadRequestError("Move this board's requests to another board first.", nil)
	}
	return e.Next()
}
