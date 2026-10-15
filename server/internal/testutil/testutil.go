// Package testutil builds throwaway Lort apps for tests.
package testutil

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/hacker4ofakind/lort/server/internal/schema"
)

// NewApp returns a bootstrapped PocketBase test app with Lort's schema and no data.
func NewApp(t testing.TB) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := app.RunAllMigrations(); err != nil {
		t.Fatal(err)
	}
	if err := schema.Ensure(app); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	return app
}

// Board creates a board.
func Board(t testing.TB, app core.App, name string, public, approval bool) *core.Record {
	t.Helper()
	return save(t, app, "boards", map[string]any{"name": name, "isPublic": public, "requireApproval": approval})
}

// User creates a verified user.
func User(t testing.TB, app core.App, email string) *core.Record {
	t.Helper()
	c, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(c)
	r.SetEmail(email)
	r.SetPassword("correcthorse")
	r.SetVerified(true)
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	return r
}

// Superuser creates a superuser.
func Superuser(t testing.TB, app core.App, email string) *core.Record {
	t.Helper()
	c, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(c)
	r.SetEmail(email)
	r.SetPassword("correcthorse")
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	return r
}

// Request inserts a request directly, bypassing the create hooks.
func Request(t testing.TB, app core.App, board, author *core.Record, title, status string, votes int) *core.Record {
	t.Helper()
	return save(t, app, "requests", map[string]any{
		"board": board.Id, "author": author.Id, "title": title, "status": status,
		"visible": true, "upvoteCount": votes,
	})
}

// Token returns an auth token for r.
func Token(t testing.TB, r *core.Record) string {
	t.Helper()
	tok, err := r.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func save(t testing.TB, app core.App, collection string, data map[string]any) *core.Record {
	t.Helper()
	c, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		t.Fatal(err)
	}
	r := core.NewRecord(c)
	for k, v := range data {
		r.Set(k, v)
	}
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	return r
}
