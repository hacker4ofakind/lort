// Package schema creates and updates Lort's PocketBase collections.
//
// Ensure is idempotent: it is registered as a migration for real installs and called
// directly by tests, so the schema lives in exactly one place.
package schema

import (
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	Users    = "users"
	Boards   = "boards"
	Tags     = "tags"
	Requests = "requests"
	Votes    = "votes"
	Comments = "comments"
	Activity = "activity"
	Settings = "settings"
)

const imageMax = 5 << 20

var imageTypes = []string{"image/png", "image/jpeg", "image/webp", "image/gif"}

// Ensure creates or updates every Lort collection, the FTS index and the rate limits.
func Ensure(app core.App) error {
	return app.RunInTransaction(func(tx core.App) error {
		steps := []func(core.App) error{
			ensureUsers, ensureSuperusers, ensureBoards, ensureTags, ensureRequests, ensureVotes,
			ensureComments, ensureActivity, ensureSettings, ensureSearch, ensureRateLimits,
		}
		for _, step := range steps {
			if err := step(tx); err != nil {
				return err
			}
		}
		return nil
	})
}

// collection returns the existing collection or a new base collection with created/updated fields.
func collection(app core.App, name string) *core.Collection {
	c, err := app.FindCollectionByNameOrId(name)
	if err == nil {
		return c
	}
	c = core.NewBaseCollection(name)
	c.Fields.Add(
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	return c
}

// add adds f unless a field with the same name already exists.
func add(c *core.Collection, fields ...core.Field) {
	for _, f := range fields {
		if c.Fields.GetByName(f.GetName()) == nil {
			c.Fields.Add(f)
		}
	}
}

func id(app core.App, name string) string {
	c, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		panic("schema: " + name + " must be created first")
	}
	return c.Id
}

func ensureUsers(app core.App) error {
	c, err := app.FindCollectionByNameOrId(Users)
	if err != nil {
		return err
	}
	add(c,
		&core.BoolField{Name: "isAdmin"},
		&core.BoolField{Name: "banned"},
		&core.JSONField{Name: "notify", MaxSize: 2000},
		&core.TextField{Name: "unsubscribeToken", Hidden: true},
	)
	// People may edit their own name and avatar, never their admin or ban flags.
	c.UpdateRule = types.Pointer("id = @request.auth.id && @request.body.isAdmin:isset = false && @request.body.banned:isset = false")
	// Public profiles: anyone may read name and avatar; the email stays hidden by PocketBase.
	c.ListRule = types.Pointer("")
	c.ViewRule = types.Pointer("")
	return app.Save(c)
}

// ensureSuperusers makes admin invite links (password reset tokens) last 7 days.
func ensureSuperusers(app core.App) error {
	c, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		return err
	}
	c.PasswordResetToken.Duration = 7 * 24 * 60 * 60
	return app.Save(c)
}

func ensureBoards(app core.App) error {
	c := collection(app, Boards)
	add(c,
		&core.TextField{Name: "name", Required: true, Max: 60},
		&core.NumberField{Name: "order", OnlyInt: true},
		&core.BoolField{Name: "isPublic"},
		&core.BoolField{Name: "requireApproval"},
	)
	c.ListRule = types.Pointer("isPublic = true")
	c.ViewRule = types.Pointer("isPublic = true")
	return app.Save(c)
}

func ensureTags(app core.App) error {
	c := collection(app, Tags)
	add(c,
		&core.TextField{Name: "name", Required: true, Max: 40},
		&core.NumberField{Name: "order", OnlyInt: true},
	)
	c.ListRule = types.Pointer("")
	c.ViewRule = types.Pointer("")
	c.AddIndex("idx_tags_name", true, "name", "")
	return app.Save(c)
}

// publicRequest is the filter for requests anyone may see: visible, on a public board, not merged.
const publicRequest = "visible = true && board.isPublic = true && mergedInto = ''"

func ensureRequests(app core.App) error {
	c := collection(app, Requests)
	add(c,
		&core.RelationField{Name: "board", CollectionId: id(app, Boards), MaxSelect: 1, Required: true},
		&core.RelationField{Name: "author", CollectionId: id(app, Users), MaxSelect: 1},
		&core.TextField{Name: "title", Required: true, Min: 3, Max: 140},
		&core.TextField{Name: "body", Max: 10000},
		&core.FileField{Name: "images", MaxSelect: 3, MaxSize: imageMax, MimeTypes: imageTypes},
		&core.RelationField{Name: "tags", CollectionId: id(app, Tags), MaxSelect: 20},
		&core.SelectField{Name: "status", MaxSelect: 1, Required: true,
			Values: []string{"pending", "reviewing", "planned", "progress", "completed", "closed"}},
		&core.BoolField{Name: "visible"},
		&core.BoolField{Name: "awaitingApproval"},
		&core.NumberField{Name: "upvoteCount", OnlyInt: true},
		&core.NumberField{Name: "trendScore"},
		&core.TextField{Name: "mergedInto", Max: 15},
		&core.DateField{Name: "teamSeenAt"},
	)
	c.ListRule = types.Pointer(publicRequest + " || author = @request.auth.id")
	c.ViewRule = types.Pointer(publicRequest + " || author = @request.auth.id || mergedInto != ''")
	// Creation goes through the record API so files work; the hooks package fills in
	// author, status, visibility and counts and rejects banned users.
	c.CreateRule = types.Pointer("@request.auth.id != '' && @request.auth.collectionName = 'users'")
	// Authors may edit their own request while it is still pending; triage happens in /api/lort.
	c.UpdateRule = types.Pointer("author = @request.auth.id && status = 'pending' && @request.body.status:isset = false && @request.body.visible:isset = false && @request.body.awaitingApproval:isset = false && @request.body.upvoteCount:isset = false && @request.body.trendScore:isset = false && @request.body.mergedInto:isset = false && @request.body.teamSeenAt:isset = false && @request.body.author:isset = false")
	c.DeleteRule = nil
	c.AddIndex("idx_requests_board_status", false, "board, status", "")
	c.AddIndex("idx_requests_trend", false, "trendScore", "")
	return app.Save(c)
}

func ensureVotes(app core.App) error {
	c := collection(app, Votes)
	add(c,
		&core.RelationField{Name: "user", CollectionId: id(app, Users), MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "request", CollectionId: id(app, Requests), MaxSelect: 1, Required: true, CascadeDelete: true},
	)
	// Votes are only written by /api/lort/requests/{id}/vote and merges.
	c.ListRule = types.Pointer("user = @request.auth.id")
	c.ViewRule = types.Pointer("user = @request.auth.id")
	c.AddIndex("idx_votes_user_request", true, "user, request", "")
	return app.Save(c)
}

func ensureComments(app core.App) error {
	c := collection(app, Comments)
	add(c,
		&core.RelationField{Name: "request", CollectionId: id(app, Requests), MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "author", CollectionId: id(app, Users), MaxSelect: 1},
		&core.TextField{Name: "parent", Max: 15},
		&core.TextField{Name: "body", Required: true, Max: 5000},
		&core.FileField{Name: "images", MaxSelect: 3, MaxSize: imageMax, MimeTypes: imageTypes},
		&core.BoolField{Name: "internal"},
	)
	c.ListRule = types.Pointer("internal = false && request.visible = true && request.board.isPublic = true")
	c.ViewRule = c.ListRule
	c.CreateRule = types.Pointer("@request.auth.id != '' && @request.auth.collectionName = 'users'")
	c.DeleteRule = types.Pointer("author = @request.auth.id")
	return app.Save(c)
}

func ensureActivity(app core.App) error {
	c := collection(app, Activity)
	add(c,
		&core.RelationField{Name: "request", CollectionId: id(app, Requests), MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "actor", CollectionId: id(app, Users), MaxSelect: 1},
		&core.TextField{Name: "actorName", Max: 120},
		&core.SelectField{Name: "kind", MaxSelect: 1, Required: true,
			Values: []string{"created", "status_changed", "merged_in", "merged_from", "board_changed"}},
		&core.TextField{Name: "from", Max: 40},
		&core.TextField{Name: "to", Max: 40},
	)
	c.ListRule = types.Pointer("request.visible = true && request.board.isPublic = true")
	c.ViewRule = c.ListRule
	return app.Save(c)
}

func ensureSettings(app core.App) error {
	c := collection(app, Settings)
	add(c,
		&core.TextField{Name: "appName", Max: 60},
		&core.FileField{Name: "logo", MaxSelect: 1, MaxSize: 2 << 20, MimeTypes: []string{"image/png", "image/svg+xml", "image/webp"}},
		&core.TextField{Name: "primaryColor", Pattern: `^#[0-9a-fA-F]{6}$`},
		&core.BoolField{Name: "showLandingCard"},
		&core.BoolField{Name: "roadmapPublic"},
	)
	// Superusers only. Public values are served by GET /api/lort/config.
	c.ListRule, c.ViewRule, c.CreateRule, c.UpdateRule, c.DeleteRule = nil, nil, nil, nil, nil
	if err := app.Save(c); err != nil {
		return err
	}
	if n, _ := app.CountRecords(c); n > 0 {
		return nil
	}
	r := core.NewRecord(c)
	r.Set("appName", "My app")
	r.Set("primaryColor", "#cc3a6d")
	r.Set("showLandingCard", true)
	r.Set("roadmapPublic", true)
	return app.Save(r)
}

// ensureSearch keeps an FTS5 index of request titles and bodies in sync with triggers.
func ensureSearch(app core.App) error {
	_, err := app.DB().NewQuery(`
		CREATE VIRTUAL TABLE IF NOT EXISTS requests_fts USING fts5(
			title, body, content='requests', content_rowid='rowid', tokenize='porter unicode61'
		);
		CREATE TRIGGER IF NOT EXISTS requests_fts_ai AFTER INSERT ON requests BEGIN
			INSERT INTO requests_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
		END;
		CREATE TRIGGER IF NOT EXISTS requests_fts_ad AFTER DELETE ON requests BEGIN
			INSERT INTO requests_fts(requests_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
		END;
		CREATE TRIGGER IF NOT EXISTS requests_fts_au AFTER UPDATE OF title, body ON requests BEGIN
			INSERT INTO requests_fts(requests_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
			INSERT INTO requests_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
		END;
	`).Execute()
	return err
}

func ensureRateLimits(app core.App) error {
	s := app.Settings()
	s.RateLimits.Enabled = true
	s.RateLimits.Rules = []core.RateLimitRule{
		{Label: "*:auth", MaxRequests: 5, Duration: 10},
		{Label: "users:create", MaxRequests: 3, Duration: 60},
		{Label: "requests:create", MaxRequests: 5, Duration: 60},
		{Label: "comments:create", MaxRequests: 10, Duration: 60},
		{Label: "/api/lort/requests/", Audience: "@auth", MaxRequests: 60, Duration: 60},
		{Label: "/api/", MaxRequests: 300, Duration: 10},
	}
	return app.Save(s)
}
