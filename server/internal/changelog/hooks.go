package changelog

import (
	"database/sql"
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	validation "github.com/pocketbase/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/spf13/cast"

	"github.com/hacker4ofakind/lort/server/internal/schema"
)

// Post states.
const (
	Draft     = "draft"
	Scheduled = "scheduled"
	Published = "published"
)

// These are shown to the team as they are, so they read as sentences.
const (
	msgLive         = "This post is live. Unpublish it to make changes."
	msgConflict     = "This post changed in another window. Reload to see it."
	msgFixedSlug    = "The address is fixed once a post has been published."
	msgBadSlug      = "Use lowercase letters, numbers and hyphens."
	msgTakenSlug    = "Another post already uses this address."
	msgDeleteLive   = "Unpublish this post before deleting it."
	msgUseLifecycle = "Use Publish, Schedule or Unpublish to change that."
	msgUseNewPost   = "Use New post to start one."
	msgNotUntouched = "This post isn't an empty draft any more."
)

// expectedRevision is the edit precondition the dashboard sends with every draft save. The
// update hook checks and consumes it; it is never stored.
const expectedRevision = "expectedRevision"

// ifUntouched is the query parameter of the dashboard's quiet clean-up of an abandoned new post:
// delete only while the post is still an untouched draft at the revision the window last saw.
const ifUntouched = "ifUntouched"

// editable is everything the dashboard may write through the record API. It is an allowlist,
// so fields added later are closed until they are named here. publishError may only be cleared.
var editable = map[string]bool{
	"title": true, "body": true, "slug": true, "labels": true, "requests": true,
	"completeAttached": true, "cover": true, "images": true, "publishError": true,
	expectedRevision: true,
}

// locked are the fields a live post refuses to change.
var locked = []string{"title", "body", "slug", "cover", "images", "labels", "requests"}

// revised are the fields whose change counts as an edit and bumps the revision. State-only
// saves (publish, schedule, the cron, unpublish, a failure) leave the revision alone.
var revised = append(slices.Clone(locked), "completeAttached")

// Bind guards the changelogs collection: the record API (creates refused, an allowlist of draft
// fields, the revision precondition) and every save, whichever route makes it (slugs, excerpts,
// live posts are read-only, published posts can't be deleted).
func Bind(app core.App) {
	app.OnRecordCreateRequest(schema.Changelogs).BindFunc(func(e *core.RecordRequestEvent) error {
		return apis.NewBadRequestError(msgUseNewPost, nil)
	})
	app.OnRecordUpdateRequest(schema.Changelogs).BindFunc(onUpdateRequest)
	app.OnRecordCreate(schema.Changelogs).BindFunc(func(e *core.RecordEvent) error {
		normalizeTitle(e.Record)
		e.Record.Set("excerpt", Excerpt(e.Record.GetString("body")))
		if err := applySlug(e.App, e.Record, nil); err != nil {
			return err
		}
		return e.Next()
	})
	app.OnRecordUpdate(schema.Changelogs).BindFunc(onUpdate)
	app.OnRecordDeleteRequest(schema.Changelogs).BindFunc(onDeleteRequest)
	app.OnRecordDelete(schema.Changelogs).BindFunc(onDelete)
}

// onDeleteRequest makes the clean-up of an abandoned new post conditional, in the same
// transaction as the delete. A window that opened the post and was left alone must not remove
// what another window saved in the meantime.
func onDeleteRequest(e *core.RecordRequestEvent) error {
	raw := e.Request.URL.Query().Get(ifUntouched)
	if raw == "" {
		return e.Next()
	}
	want, err := strconv.Atoi(raw)
	if err != nil {
		return apis.NewBadRequestError("Send the revision you last saw.", nil)
	}
	outer := e.App
	defer func() { e.App = outer }()
	return outer.RunInTransaction(func(txApp core.App) error {
		e.App = txApp
		fresh, err := txApp.FindRecordById(schema.Changelogs, e.Record.Id)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			return e.Next()
		case err != nil:
			return err
		}
		if fresh.GetInt("revision") != want {
			return e.Error(http.StatusConflict, msgConflict, nil)
		}
		if fresh.GetString("state") != Draft || !fresh.GetDateTime("publishAt").IsZero() ||
			!fresh.GetDateTime("publishedAt").IsZero() || fresh.GetString("publishError") != "" {
			return e.Error(http.StatusConflict, msgNotUntouched, nil)
		}
		e.Record = fresh
		return e.Next()
	})
}

// onDelete checks the stored state and deletes in one transaction. The record in the event was
// read earlier, so it can still say scheduled after the cron or a click has published the post.
func onDelete(e *core.RecordEvent) error {
	outer := e.App
	defer func() { e.App = outer }()
	return outer.RunInTransaction(func(txApp core.App) error {
		e.App = txApp
		fresh, err := txApp.FindRecordById(schema.Changelogs, e.Record.Id)
		switch {
		case errors.Is(err, sql.ErrNoRows):
			return e.Next()
		case err != nil:
			return err
		}
		if fresh.GetString("state") == Published {
			return apis.NewBadRequestError(msgDeleteLive, nil)
		}
		e.Record = fresh
		return e.Next()
	})
}

// onUpdateRequest answers the dashboard's draft saves. The record API read the post before this
// hook runs, and a save overwrites every column, so a stale copy would undo whatever landed in
// between: another window's edit, a publish, the cron. The checks and the save therefore run in
// one transaction (writes are serialised), on a fresh read with the submitted fields applied.
func onUpdateRequest(e *core.RecordRequestEvent) error {
	info, err := e.RequestInfo()
	if err != nil {
		return err
	}
	for k, v := range info.Body {
		if !editable[k] || (k == "publishError" && cast.ToString(v) != "") {
			return apis.NewBadRequestError(msgUseLifecycle, nil)
		}
	}
	var want *int
	if raw, ok := info.Body[expectedRevision]; ok {
		n, err := cast.ToIntE(raw)
		if err != nil {
			return apis.NewBadRequestError("Send the revision you last saw.", nil)
		}
		want = &n
	}
	outer := e.App
	defer func() { e.App = outer }()
	return outer.RunInTransaction(func(txApp core.App) error {
		e.App = txApp
		r, err := txApp.FindRecordById(schema.Changelogs, e.Record.Id)
		if err != nil {
			return err
		}
		for k, v := range info.Body {
			r.SetIfFieldExists(k, v)
		}
		// Sending an address pins it; sending "" hands it back to the title.
		if v, ok := info.Body["slug"]; ok {
			r.Set("slugCustom", cast.ToString(v) != "")
		}
		normalizeTitle(r)
		// A post that went live meanwhile says so, rather than claiming a conflict.
		if err := checkLive(txApp, r); err != nil {
			return err
		}
		if want != nil && *want != r.Original().GetInt("revision") {
			return e.Error(409, msgConflict, nil)
		}
		e.Record = r
		return e.Next()
	})
}

func onUpdate(e *core.RecordEvent) error {
	r := e.Record
	orig := r.Original()
	normalizeTitle(r)
	if err := checkLive(e.App, r); err != nil {
		return err
	}
	if r.GetString("body") != orig.GetString("body") {
		r.Set("excerpt", Excerpt(r.GetString("body")))
	}
	if err := applySlug(e.App, r, orig); err != nil {
		return err
	}
	for _, f := range revised {
		if changed(e.App, r, orig, f) {
			r.Set("revision", orig.GetInt("revision")+1)
			break
		}
	}
	return e.Next()
}

// normalizeTitle keeps titles on one line, without edge spaces.
func normalizeTitle(r *core.Record) {
	t := strings.NewReplacer("\r\n", " ", "\n", " ", "\r", " ").Replace(r.GetString("title"))
	r.Set("title", strings.TrimSpace(t))
}

// checkLive refuses content changes to a post that is live. Unpublishing is a state-only save,
// so it passes.
func checkLive(app core.App, r *core.Record) error {
	if r.IsNew() {
		return nil
	}
	orig := r.Original()
	if orig.GetString("state") != Published {
		return nil
	}
	for _, f := range locked {
		if changed(app, r, orig, f) {
			return apis.NewBadRequestError(msgLive, nil)
		}
	}
	return nil
}

// changed reports whether field f differs from the stored post. A requests change that only drops
// requests which no longer exist doesn't count: deleting a request strips it from every post that
// lists it, and that save must pass even on a live post.
func changed(app core.App, r, orig *core.Record, f string) bool {
	switch f {
	case "cover", "images":
		return !slices.Equal(fileNames(r.GetRaw(f)), fileNames(orig.GetRaw(f)))
	case "labels":
		return !slices.Equal(r.GetStringSlice(f), orig.GetStringSlice(f))
	case "requests":
		now, was := r.GetStringSlice(f), orig.GetStringSlice(f)
		if slices.Equal(now, was) {
			return false
		}
		return !onlyDropsMissing(app, was, now)
	case "completeAttached":
		return r.GetBool(f) != orig.GetBool(f)
	default:
		return r.GetString(f) != orig.GetString(f)
	}
}

// onlyDropsMissing reports whether now is was with only deleted requests taken out.
func onlyDropsMissing(app core.App, was, now []string) bool {
	keep := 0
	for _, id := range was {
		if keep < len(now) && now[keep] == id {
			keep++
			continue
		}
		if _, err := app.FindRecordById(schema.Requests, id); err == nil {
			return false
		}
	}
	return keep == len(now)
}

// fileNames lists a file field's names, new uploads included (they are named before saving).
func fileNames(raw any) []string {
	var out []string
	add := func(v any) {
		switch f := v.(type) {
		case string:
			if f != "" {
				out = append(out, f)
			}
		case *filesystem.File:
			out = append(out, f.Name)
		}
	}
	switch v := raw.(type) {
	case []any:
		for _, x := range v {
			add(x)
		}
	case []string:
		for _, x := range v {
			add(x)
		}
	case []*filesystem.File:
		for _, x := range v {
			add(x)
		}
	default:
		add(v)
	}
	return out
}

func slugError(msg string) error {
	return apis.NewBadRequestError(msg, validation.Errors{"slug": validation.NewError("validation_invalid_slug", msg)})
}

// applySlug keeps the address right: fixed once the post has ever been published, otherwise
// following the title until someone sets it by hand, and always valid and unique.
func applySlug(app core.App, r, orig *core.Record) error {
	slug := r.GetString("slug")
	if orig != nil && !orig.GetDateTime("publishedAt").IsZero() {
		if slug != orig.GetString("slug") {
			return slugError(msgFixedSlug)
		}
		return nil
	}
	if !r.GetBool("slugCustom") {
		follow := orig == nil || r.GetString("title") != orig.GetString("title") ||
			orig.GetBool("slugCustom") || slug != orig.GetString("slug")
		if follow {
			s, err := uniqueSlug(app, Slugify(r.GetString("title")), r.Id)
			if err != nil {
				return err
			}
			r.Set("slug", s)
		}
		return nil
	}
	if orig != nil && slug == orig.GetString("slug") {
		return nil
	}
	if !ValidSlug(slug) {
		return slugError(msgBadSlug)
	}
	taken, err := slugTaken(app, slug, r.Id)
	if err != nil {
		return err
	}
	if taken {
		return slugError(msgTakenSlug)
	}
	return nil
}

// uniqueSlug is base, or base-2, base-3… when another post has it. "" stays "".
func uniqueSlug(app core.App, base, self string) (string, error) {
	if base == "" {
		return "", nil
	}
	for n := 1; ; n++ {
		s := base
		if n > 1 {
			suffix := "-" + cast.ToString(n)
			s = strings.TrimRight(base[:min(len(base), slugMax-len(suffix))], "-") + suffix
		}
		taken, err := slugTaken(app, s, self)
		if err != nil || !taken {
			return s, err
		}
	}
}

func slugTaken(app core.App, slug, self string) (bool, error) {
	var n int
	err := app.DB().Select("count(*)").From(schema.Changelogs).
		Where(dbx.HashExp{"slug": slug}).AndWhere(dbx.Not(dbx.HashExp{"id": self})).Row(&n)
	return n > 0, err
}
