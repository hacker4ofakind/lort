# Lort Phase 1A: Server Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development (can be usage intensive) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `lort`, the single Go binary that embeds PocketBase and holds Lort's data model, triage rules, voting, merging, search, team management, its `/api/lort` endpoints, HTTPS, and the proxy and supervisor for the Next.js app.

**Architecture:** One Go module in `server/`. PocketBase v0.40 is used as a framework: `schema.Ensure` creates every collection on each boot (idempotent), `hooks` enforces rules on PocketBase's own record API (so image uploads work unchanged), `requests` holds the business logic as a plain service, `api` exposes it under `/api/lort`, and `web` forwards everything else to Next.js and keeps it running. Every package is tested against a fresh PocketBase test app.

**Tech Stack:** Go 1.27, PocketBase v0.40.5 (`github.com/pocketbase/pocketbase`), `github.com/pocketbase/dbx`, SQLite FTS5 (built into PocketBase's modernc SQLite), PocketBase's built-in autocert for HTTPS.

**Spec:** `.superpowers/specs/2026-10-15-lort-design.md` (sections 1–4, 5.3, 5.4, 5.6, 6.1–6.2, 6.6 Team, 9 trending). This is plan 1 of the Phase 1 trio: 1A server (this), 1B web, 1C packaging (Dockerfile, setup scripts, CI).

## Global Constraints

- Module path: `github.com/hacker4ofakind/lort/server`, in the `server/` directory of the repo.
- Go 1.27 (PocketBase v0.40.5 requires it; `go` downloads the toolchain automatically).
- PocketBase pinned to `v0.40.5`. Before writing code, skim `go doc github.com/pocketbase/pocketbase/core App` if anything in this plan fails to compile; the plan's code was compiled and tested against v0.40.5.
- Statuses, exactly: `pending`, `reviewing`, `planned`, `progress`, `completed`, `closed`. Planned means "on the roadmap".
- Triage actions per status, exactly: Pending → close, accept; Reviewing → close, roadmap; Planned → rereview, start; In progress → complete; Completed → reopen (→ progress); Closed → reopen (→ pending). Merge and Skip are not status actions.
- Trending score: `votes / (ageHours + 2) ^ 1.5`.
- Undo window for Complete: 60 seconds.
- Admins are PocketBase superusers, each linked by email to a `users` record with `isAdmin = true`. Only superusers can call team endpoints.
- User-facing error messages are friendly, sentence case, and say what to do ("Pick a board for your idea.").
- Images: at most 3 per request or comment, 5 MB each, PNG/JPEG/WebP/GIF.
- Lort listens on `:4052` (plain HTTP) when `LORT_TLS=off`, and on `:80`/`:443` with Let's Encrypt when `LORT_TLS=auto`.
- Never write secrets to logs.
- Run `gofmt` on every file; `go vet ./...` must be clean.

## Decisions this plan makes (recorded in the spec)

- HTTPS uses PocketBase's built-in autocert (`serve <domain>`) instead of a separate certmagic setup. Same result, no extra dependency.
- `setup.sh --reset-admin` will wrap PocketBase's built-in `lort superuser update <email> <password>` command; no custom CLI is needed. *(Superseded in Phase 1C: `--reset-admin` runs Lort's own `lort reset-admin`, which reads the email and new password on the terminal so the password is never an argument. See the 1C plan.)*
- Requests and comments are created through PocketBase's record API (`POST /api/collections/requests/records`), guarded by hooks, so multipart image uploads work without custom code. Votes, triage, merges and team actions go through `/api/lort`.

## Changes after review (PR #1)

Two review rounds changed the code after this plan was written. The code blocks below show the plan as it was first executed; the code in `server/` is the source of truth. What differs:

- **Schema (Task 2):** owner-only rules use `mine = (@request.auth.id != '' && author = @request.auth.id)`, because a deleted account leaves `author` empty. The requests ViewRule is `(visible = true && board.isPublic = true) || mine`; the old `|| mergedInto != ''` exposed merged hidden requests. The UpdateRule also requires `@request.body.board:isset = false`. Request and comment `images` are protected files, set by `protectImages`, which also updates existing collections. The comments DeleteRule is `mine`.
- **Service (Task 3):** `ToggleVote` returns `ErrNotFound` unless the voter can see the request (public, their own, or `isAdmin`). New `Recount(app, requestID)` updates only `upvoteCount` and `trendScore`. `RecomputeTrending` writes only `trendScore` with a targeted UPDATE that skips rows whose vote count changed, and no longer bumps `updated`. `MarkSeen` re-reads inside its transaction. `AfterCreate(app, r, author)` takes the transaction that created the request.
- **Team (Task 5):** `Profile` revokes an existing unverified profile's password and sessions (`SetRandomPassword`, `RefreshTokenKey`) and marks it verified before promoting it.
- **Hooks (Task 6):** request creation runs `e.Next()` and `AfterCreate` in one transaction, so PocketBase sends the response after the commit. A new `OnRecordDeleteExecute("votes")` hook runs the delete and `Recount` in one transaction that it opens itself, because PocketBase's own delete handler (priority 99) commits before returning.
- **Tests:** new cases cover each of these, including anonymous access to authorless records, merged private requests, board moves, protected images, cascaded and failed recounts, atomic creation with and without an image, vote access, trending leaving `updated` alone, and invite credential revocation.

## Changes in Phase 1B (PR #4)

Phase 1B extended this server; its plan (`2026-10-16-phase-1b-web.md`) has the details. In short:

- **Search (Task 4):** `ftsQuery` is replaced by a typo-tolerant query built from the FTS5 vocabulary (`requests/search.go`, the `requests_fts_vocab` table), and `filter` (shared by `List` and the new `Queue`) returns an error.
- **Hooks (Task 6):** request creation accepts `onBehalf` from team profiles; deleting a comment deletes its replies; when the team makes a request visible it stops awaiting approval.
- **Schema (Task 2):** the logo field has a `64x64` thumb for the favicon.
- **Endpoints (Task 7):** `GET /api/lort/config` serves `site.Config` from a cache that the proxy also sends to Next in `X-Lort-Config`; new endpoints for the request page, board moves, reassigning, the queue, stats, ordering and board deletion.
- **Proxy (Task 8):** `web.Proxy(target, config)` sets that header; the supervisor logs its backoff as a string, and its test passes on Windows.

## File structure

```
server/
  go.mod, go.sum
  main.go                         wires config, PocketBase, hooks, routes, cron, proxy, supervisor
  internal/status/                statuses, triage actions, roadmap changes (pure)
  internal/trending/              the trending score (pure)
  internal/schema/                every collection, rule, index, FTS5 table and rate limit
  internal/testutil/              fresh test apps and record factories
  internal/requests/service.go    votes, triage, undo, merge, trending recompute, seen, after-create
  internal/requests/list.go       board feed and dashboard table, search, similar
  internal/team/                  admin profiles, first admin, invites, removal, bans, reset links
  internal/config/                environment and serve arguments
  internal/hooks/                 rules on PocketBase's record API
  internal/api/                   /api/lort routes
  internal/web/                   reverse proxy to Next.js and its supervisor
```

---

### Task 1: Module, statuses and trending

**Files:**
- Create: `server/go.mod`
- Create: `server/internal/status/status.go`, `server/internal/status/status_test.go`
- Create: `server/internal/trending/trending.go`, `server/internal/trending/trending_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `status.Status` (string type) with constants `Pending, Reviewing, Planned, Progress, Completed, Closed`; `status.All`, `status.Open []Status`; `status.Action` with `Close, Accept, Roadmap, Rereview, Start, Complete, Reopen`; `status.Next(from Status, a Action) (Status, error)`; `status.Valid(Status) bool`; `status.OnRoadmap(Status) bool`; `status.RoadmapChange(from, to Status) string` returning `"added"`, `"removed"` or `""`; `trending.Score(votes int, created, now time.Time) float64`.

- [ ] **Step 1: Create the module**

```bash
mkdir -p server && cd server
cat > go.mod <<'EOF'
module github.com/hacker4ofakind/lort/server

go 1.27
EOF
```

- [ ] **Step 2: Write the failing status tests**

`server/internal/status/status_test.go`:

```go
package status

import "testing"

func TestNext(t *testing.T) {
	cases := []struct {
		from   Status
		action Action
		want   Status
	}{
		{Pending, Accept, Reviewing},
		{Pending, Close, Closed},
		{Reviewing, Roadmap, Planned},
		{Reviewing, Close, Closed},
		{Planned, Rereview, Reviewing},
		{Planned, Start, Progress},
		{Progress, Complete, Completed},
		{Completed, Reopen, Progress},
		{Closed, Reopen, Pending},
	}
	for _, c := range cases {
		got, err := Next(c.from, c.action)
		if err != nil || got != c.want {
			t.Errorf("Next(%s, %s) = %q, %v; want %q", c.from, c.action, got, err, c.want)
		}
	}
}

func TestNextRejectsUnavailableActions(t *testing.T) {
	for _, c := range []struct {
		from   Status
		action Action
	}{
		{Pending, Complete},
		{Progress, Close},
		{Completed, Accept},
		{Planned, Roadmap},
	} {
		if _, err := Next(c.from, c.action); err == nil {
			t.Errorf("Next(%s, %s) should fail", c.from, c.action)
		}
	}
}

func TestRoadmapChange(t *testing.T) {
	if got := RoadmapChange(Reviewing, Planned); got != "added" {
		t.Errorf("reviewing→planned = %q", got)
	}
	if got := RoadmapChange(Planned, Reviewing); got != "removed" {
		t.Errorf("planned→reviewing = %q", got)
	}
	if got := RoadmapChange(Planned, Progress); got != "" {
		t.Errorf("planned→progress = %q", got)
	}
	if got := RoadmapChange(Closed, Pending); got != "" {
		t.Errorf("closed→pending = %q", got)
	}
}
```

- [ ] **Step 3: Write the failing trending test**

`server/internal/trending/trending_test.go`:

```go
package trending

import (
	"math"
	"testing"
	"time"
)

func TestScore(t *testing.T) {
	now := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	if got := Score(8, now, now); math.Abs(got-8/math.Pow(2, 1.5)) > 1e-9 {
		t.Errorf("fresh request = %v", got)
	}
	fresh := Score(5, now.Add(-2*time.Hour), now)
	old := Score(50, now.Add(-14*24*time.Hour), now)
	if fresh <= old {
		t.Errorf("a 2-hour-old request with 5 votes (%v) should outrank a 2-week-old one with 50 (%v)", fresh, old)
	}
	if got := Score(3, now.Add(time.Hour), now); got != Score(3, now, now) {
		t.Errorf("future created dates count as age 0, got %v", got)
	}
}
```

- [ ] **Step 4: Run them to make sure they fail**

Run: `cd server && go test ./internal/status ./internal/trending`
Expected: FAIL with `undefined: Next`, `undefined: Score` and similar.

- [ ] **Step 5: Implement statuses**

`server/internal/status/status.go`:

```go
// Package status holds Lort's request statuses and the triage rules between them.
package status

import "fmt"

type Status string

const (
	Pending   Status = "pending"
	Reviewing Status = "reviewing"
	Planned   Status = "planned"
	Progress  Status = "progress"
	Completed Status = "completed"
	Closed    Status = "closed"
)

// All lists every status in display order.
var All = []Status{Pending, Reviewing, Planned, Progress, Completed, Closed}

// Open is the default filter on the board and in the dashboard.
var Open = []Status{Pending, Reviewing, Planned, Progress}

type Action string

const (
	Close    Action = "close"
	Accept   Action = "accept"
	Roadmap  Action = "roadmap"
	Rereview Action = "rereview"
	Start    Action = "start"
	Complete Action = "complete"
	Reopen   Action = "reopen"
)

// actions maps a status to the actions the triage bar offers that change the status.
// Merge and Skip are not here: Merge has its own endpoint and Skip changes nothing.
var actions = map[Status]map[Action]Status{
	Pending:   {Close: Closed, Accept: Reviewing},
	Reviewing: {Close: Closed, Roadmap: Planned},
	Planned:   {Rereview: Reviewing, Start: Progress},
	Progress:  {Complete: Completed},
	Completed: {Reopen: Progress},
	Closed:    {Reopen: Pending},
}

// Valid reports whether s is a known status.
func Valid(s Status) bool {
	_, ok := actions[s]
	return ok
}

// Next returns the status that action moves a request in status from to.
func Next(from Status, action Action) (Status, error) {
	to, ok := actions[from][action]
	if !ok {
		return "", fmt.Errorf("%q is not available for a %s request", action, from)
	}
	return to, nil
}

// OnRoadmap reports whether a status is shown on the roadmap.
func OnRoadmap(s Status) bool {
	return s == Planned || s == Progress || s == Completed
}

// RoadmapChange describes how a move affects the roadmap: "added", "removed" or "".
func RoadmapChange(from, to Status) string {
	switch {
	case !OnRoadmap(from) && OnRoadmap(to):
		return "added"
	case OnRoadmap(from) && !OnRoadmap(to):
		return "removed"
	default:
		return ""
	}
}
```

- [ ] **Step 6: Implement the trending score**

`server/internal/trending/trending.go`:

```go
// Package trending scores requests for the Trending sort.
package trending

import (
	"math"
	"time"
)

// Score is votes / (ageHours + 2)^1.5: new requests with a few votes can outrank old ones with many.
func Score(votes int, created, now time.Time) float64 {
	age := now.Sub(created).Hours()
	if age < 0 {
		age = 0
	}
	return float64(votes) / math.Pow(age+2, 1.5)
}
```

- [ ] **Step 7: Run the tests**

Run: `cd server && go test ./internal/status ./internal/trending`
Expected: `ok` for both packages.

---

### Task 2: Schema and test helpers

**Files:**
- Create: `server/internal/schema/schema.go`, `server/internal/schema/schema_test.go`
- Create: `server/internal/testutil/testutil.go`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `schema.Ensure(app core.App) error` (idempotent; creates `boards, tags, requests, votes, comments, activity, settings`, extends `users`, sets superuser invite tokens to 7 days, creates the `requests_fts` FTS5 table with triggers, enables rate limits, seeds one `settings` record). Collection name constants `schema.Users, Boards, Tags, Requests, Votes, Comments, Activity, Settings`.
- Produces (testutil): `NewApp(t) *tests.TestApp`, `Board(t, app, name string, public, approval bool) *core.Record`, `User(t, app, email string) *core.Record` (verified, password `correcthorse`), `Superuser(t, app, email string) *core.Record`, `Request(t, app, board, author *core.Record, title, status string, votes int) *core.Record` (visible, bypasses hooks), `Token(t, r *core.Record) string`.
- Fields, exactly: `users{isAdmin bool, banned bool, notify json, unsubscribeToken text(hidden)}`; `boards{name, order, isPublic, requireApproval}`; `tags{name (unique), order}`; `requests{board→boards, author→users, title(3–140), body(≤10000), images(≤3), tags→tags(≤20), status(select), visible, awaitingApproval, upvoteCount, trendScore, mergedInto(text), teamSeenAt(date), created, updated}`; `votes{user→users, request→requests}` unique (user, request); `comments{request→requests, author→users, parent(text), body(≤5000), images(≤3), internal}`; `activity{request→requests, actor→users, actorName, kind(created|status_changed|merged_in|merged_from|board_changed), from, to}`; `settings{appName, logo, primaryColor(#rrggbb), showLandingCard, roadmapPublic}`.

- [ ] **Step 1: Write the test helpers**

These are used by every later test. `server/internal/testutil/testutil.go`:

```go
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
```

- [ ] **Step 2: Write the failing schema tests**

`server/internal/schema/schema_test.go`:

```go
package schema_test

import (
	"testing"

	"github.com/pocketbase/dbx"

	"github.com/hacker4ofakind/lort/server/internal/schema"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestEnsureIsIdempotent(t *testing.T) {
	app := testutil.NewApp(t)
	if err := schema.Ensure(app); err != nil {
		t.Fatalf("second Ensure: %v", err)
	}
	for _, name := range []string{"boards", "tags", "requests", "votes", "comments", "activity", "settings"} {
		if _, err := app.FindCollectionByNameOrId(name); err != nil {
			t.Errorf("missing collection %s", name)
		}
	}
	if n, _ := app.CountRecords("settings"); n != 1 {
		t.Errorf("settings records = %d, want 1", n)
	}
}

func TestSearchIndexFollowsRequests(t *testing.T) {
	app := testutil.NewApp(t)
	b := testutil.Board(t, app, "Features", true, false)
	u := testutil.User(t, app, "mara@example.com")
	r := testutil.Request(t, app, b, u, "Dark mode for the editor", "pending", 1)

	count := func(q string) int {
		var n int
		err := app.DB().NewQuery("SELECT count(*) FROM requests_fts WHERE requests_fts MATCH {:q}").
			Bind(dbx.Params{"q": q}).Row(&n)
		if err != nil {
			t.Fatal(err)
		}
		return n
	}
	if count("dark") != 1 {
		t.Fatal("new request not indexed")
	}
	r.Set("title", "Night theme for the editor")
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	if count("dark") != 0 || count("night") != 1 {
		t.Fatal("updated title not reindexed")
	}
	if err := app.Delete(r); err != nil {
		t.Fatal(err)
	}
	if count("night") != 0 {
		t.Fatal("deleted request still indexed")
	}
}
```

- [ ] **Step 3: Fetch PocketBase and run the tests to make sure they fail**

Run: `cd server && go get github.com/pocketbase/pocketbase@v0.40.5 && go test ./internal/schema`
Expected: FAIL with `undefined: schema.Ensure`.

- [ ] **Step 4: Implement the schema**

API rules here are the public boundary: the board and request rules hide private boards, hidden and merged requests; the `users` and `requests` update rules use `@request.body.x:isset = false` so people can't set admin, ban, status or count fields themselves.

`server/internal/schema/schema.go`:

```go
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
```

- [ ] **Step 5: Run the tests**

Run: `cd server && go mod tidy && go test ./internal/schema`
Expected: `ok`. Both tests pass, which proves the rules parse, the schema is idempotent and FTS5 follows inserts, updates and deletes.

---

### Task 3: Votes, triage, undo and merging

**Files:**
- Create: `server/internal/requests/service.go`, `server/internal/requests/service_test.go`

**Interfaces:**
- Consumes: `status.*`, `trending.Score`, `schema.Ensure` (through testutil).
- Produces: `requests.New(app core.App) *Service` with field `Now func() time.Time`; `(*Service).ToggleVote(requestID, userID string) (voted bool, count int, err error)`; `SetStatus(requestID string, a status.Action, actor *core.Record) (Change, error)`; `UndoComplete(requestID string) (Change, error)`; `Merge(sourceID, targetID string, actor *core.Record) error`; `RecomputeTrending() error`; `MarkSeen(requestID string) error`; `AfterCreate(app core.App, r, author *core.Record) error` (app is the creating transaction; see "Changes after review"); `Recount(app core.App, requestID string) error`. `requests.Change{From, To status.Status; Roadmap string}` (JSON `from`, `to`, `roadmap`). Errors `ErrNotFound, ErrNotVoting, ErrUndoGone, ErrBadMerge`. Constant `UndoWindow = 60 * time.Second`.

- [ ] **Step 1: Write the failing service tests**

`server/internal/requests/service_test.go`:

```go
package requests_test

import (
	"errors"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/status"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func setup(t *testing.T) (*requests.Service, core.App, *core.Record, *core.Record) {
	app := testutil.NewApp(t)
	board := testutil.Board(t, app, "Features", true, false)
	mara := testutil.User(t, app, "mara@example.com")
	return requests.New(app), app, board, mara
}

func TestToggleVote(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Dark mode", "pending", 0)
	devon := testutil.User(t, app, "devon@example.com")

	voted, count, err := svc.ToggleVote(r.Id, devon.Id)
	if err != nil || !voted || count != 1 {
		t.Fatalf("first toggle = %v %d %v", voted, count, err)
	}
	voted, count, err = svc.ToggleVote(r.Id, devon.Id)
	if err != nil || voted || count != 0 {
		t.Fatalf("second toggle = %v %d %v", voted, count, err)
	}
	r, _ = app.FindRecordById("requests", r.Id)
	if r.GetInt("upvoteCount") != 0 {
		t.Errorf("stored count = %d", r.GetInt("upvoteCount"))
	}
}

func TestToggleVoteRejectsClosed(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Old idea", "closed", 0)
	if _, _, err := svc.ToggleVote(r.Id, mara.Id); !errors.Is(err, requests.ErrNotVoting) {
		t.Fatalf("err = %v", err)
	}
}

func TestSetStatusAcceptApproves(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Hidden one", "pending", 1)
	r.Set("visible", false)
	r.Set("awaitingApproval", true)
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	ch, err := svc.SetStatus(r.Id, status.Accept, mara)
	if err != nil || ch.To != status.Reviewing || ch.Roadmap != "" {
		t.Fatalf("change = %+v, %v", ch, err)
	}
	r, _ = app.FindRecordById("requests", r.Id)
	if !r.GetBool("visible") || r.GetBool("awaitingApproval") {
		t.Error("accepting should make the request visible")
	}
	acts, _ := app.FindAllRecords("activity", dbx.HashExp{"request": r.Id})
	if len(acts) != 1 || acts[0].GetString("to") != "reviewing" || acts[0].GetString("actor") != mara.Id {
		t.Errorf("activity = %v", acts)
	}
}

func TestSetStatusReportsRoadmapChange(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Export", "reviewing", 1)
	ch, err := svc.SetStatus(r.Id, status.Roadmap, mara)
	if err != nil || ch.Roadmap != "added" {
		t.Fatalf("change = %+v, %v", ch, err)
	}
	if _, err := svc.SetStatus(r.Id, status.Complete, mara); err == nil {
		t.Fatal("planned → complete should not be allowed")
	}
}

func TestUndoComplete(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Tags", "progress", 3)
	if _, err := svc.SetStatus(r.Id, status.Complete, mara); err != nil {
		t.Fatal(err)
	}
	ch, err := svc.UndoComplete(r.Id)
	if err != nil || ch.To != status.Progress {
		t.Fatalf("undo = %+v, %v", ch, err)
	}
	if n, _ := app.CountRecords("activity", dbx.HashExp{"request": r.Id}); n != 0 {
		t.Errorf("undo should remove the completion from the timeline, %d left", n)
	}
}

func TestUndoCompleteExpires(t *testing.T) {
	svc, app, board, mara := setup(t)
	r := testutil.Request(t, app, board, mara, "Tags", "progress", 3)
	if _, err := svc.SetStatus(r.Id, status.Complete, mara); err != nil {
		t.Fatal(err)
	}
	svc.Now = func() time.Time { return time.Now().Add(2 * time.Minute) }
	if _, err := svc.UndoComplete(r.Id); !errors.Is(err, requests.ErrUndoGone) {
		t.Fatalf("err = %v", err)
	}
}

func TestMergeMovesVotersWithoutDuplicates(t *testing.T) {
	svc, app, board, mara := setup(t)
	devon := testutil.User(t, app, "devon@example.com")
	ade := testutil.User(t, app, "ade@example.com")
	src := testutil.Request(t, app, board, devon, "Night theme", "pending", 0)
	dst := testutil.Request(t, app, board, mara, "Dark mode", "planned", 0)
	for _, v := range []struct{ u, r *core.Record }{{devon, src}, {ade, src}, {ade, dst}, {mara, dst}} {
		if _, _, err := svc.ToggleVote(v.r.Id, v.u.Id); err != nil {
			t.Fatal(err)
		}
	}
	if err := svc.Merge(src.Id, dst.Id, mara); err != nil {
		t.Fatal(err)
	}
	dst, _ = app.FindRecordById("requests", dst.Id)
	src, _ = app.FindRecordById("requests", src.Id)
	if dst.GetInt("upvoteCount") != 3 {
		t.Errorf("target votes = %d, want 3 (mara, ade, devon)", dst.GetInt("upvoteCount"))
	}
	if src.GetString("status") != "closed" || src.GetString("mergedInto") != dst.Id {
		t.Errorf("source = %s / %s", src.GetString("status"), src.GetString("mergedInto"))
	}
	if err := svc.Merge(dst.Id, dst.Id, mara); !errors.Is(err, requests.ErrBadMerge) {
		t.Errorf("self-merge err = %v", err)
	}
}

func TestRecomputeTrendingSkipsFinished(t *testing.T) {
	svc, app, board, mara := setup(t)
	open := testutil.Request(t, app, board, mara, "Open", "pending", 4)
	done := testutil.Request(t, app, board, mara, "Done", "completed", 4)
	if err := svc.RecomputeTrending(); err != nil {
		t.Fatal(err)
	}
	open, _ = app.FindRecordById("requests", open.Id)
	done, _ = app.FindRecordById("requests", done.Id)
	if open.GetFloat("trendScore") <= 0 || done.GetFloat("trendScore") != 0 {
		t.Errorf("scores = %v / %v", open.GetFloat("trendScore"), done.GetFloat("trendScore"))
	}
}
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd server && go test ./internal/requests`
Expected: FAIL with `undefined: requests.New`.

- [ ] **Step 3: Implement the service**

Rules to notice: the vote count is always recounted from `votes` (never incremented), Accept on an approval-board request also makes it visible, Undo deletes the completion's timeline entry so the request looks untouched, and Merge moves every source voter who hasn't voted on the target.

`server/internal/requests/service.go`:

```go
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
```

- [ ] **Step 4: Run the tests**

Run: `cd server && go test ./internal/requests`
Expected: `ok`.

---

### Task 4: Board feed, dashboard table and search

**Files:**
- Create: `server/internal/requests/list.go`, `server/internal/requests/list_test.go`

**Interfaces:**
- Consumes: `requests.Service`, the `requests_fts` table from Task 2.
- Produces: `requests.Query{Sort string; Statuses, Boards, Tags []string; Visibility, Search string; Page, PerPage int}`; `(*Service).List(q Query, viewer *core.Record, team bool) (Page, error)`; `(*Service).Similar(text string, limit int) ([]Item, error)`. `Item{ID, Title, Body, Status string; Board Ref; Author Person; Tags []Ref; Comments, Votes int; Voted, Visible, AwaitingApproval, New bool; Created time.Time}` with JSON keys `id, title, body, status, board, author, tags, comments, votes, voted, visible, awaitingApproval, new, created`; `Ref{ID, Name}`; `Person{ID, Name, Avatar string; Team bool}`; `Page{Items []Item; Page, PerPage, TotalItems int}`. Sorts: `trending` (default), `newest`, `oldest`, `top`, `updated`.

- [ ] **Step 1: Write the failing list tests**

`server/internal/requests/list_test.go`:

```go
package requests_test

import (
	"testing"

	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestListPublicScope(t *testing.T) {
	svc, app, board, mara := setup(t)
	private := testutil.Board(t, app, "Internal", false, false)
	devon := testutil.User(t, app, "devon@example.com")
	testutil.Request(t, app, board, mara, "Dark mode", "planned", 48)
	testutil.Request(t, app, private, mara, "Secret roadmap", "pending", 1)
	hidden := testutil.Request(t, app, board, devon, "Waiting one", "pending", 1)
	hidden.Set("visible", false)
	hidden.Set("awaitingApproval", true)
	if err := app.Save(hidden); err != nil {
		t.Fatal(err)
	}

	anon, err := svc.List(requests.Query{}, nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if anon.TotalItems != 1 || anon.Items[0].Title != "Dark mode" {
		t.Fatalf("anonymous sees %+v", anon.Items)
	}
	own, _ := svc.List(requests.Query{}, devon, false)
	if own.TotalItems != 2 {
		t.Errorf("author should also see their request awaiting approval, got %d", own.TotalItems)
	}
	team, _ := svc.List(requests.Query{}, nil, true)
	if team.TotalItems != 3 || !team.Items[0].New {
		t.Errorf("team sees %d items, new=%v", team.TotalItems, team.Items[0].New)
	}
}

func TestListFiltersSortAndVoted(t *testing.T) {
	svc, app, board, mara := setup(t)
	bugs := testutil.Board(t, app, "Bugs", true, false)
	a := testutil.Request(t, app, board, mara, "Export entries as Markdown", "progress", 0)
	testutil.Request(t, app, bugs, mara, "Sync drops entries", "reviewing", 0)
	testutil.Request(t, app, board, mara, "Calendar heatmap", "completed", 0)
	if _, _, err := svc.ToggleVote(a.Id, mara.Id); err != nil {
		t.Fatal(err)
	}

	open, _ := svc.List(requests.Query{Statuses: []string{"pending", "reviewing", "planned", "progress"}, Sort: "top"}, mara, false)
	if open.TotalItems != 2 || open.Items[0].ID != a.Id || !open.Items[0].Voted {
		t.Fatalf("open = %+v", open.Items)
	}
	inBugs, _ := svc.List(requests.Query{Boards: []string{bugs.Id}}, nil, false)
	if inBugs.TotalItems != 1 || inBugs.Items[0].Board.Name != "Bugs" {
		t.Errorf("bugs = %+v", inBugs.Items)
	}
	found, _ := svc.List(requests.Query{Search: "markdown export"}, nil, false)
	if found.TotalItems != 1 || found.Items[0].ID != a.Id {
		t.Errorf("search = %+v", found.Items)
	}
	none, _ := svc.List(requests.Query{Search: `"); DROP TABLE requests; --`}, nil, false)
	if none.TotalItems != 0 {
		t.Errorf("hostile search matched %d", none.TotalItems)
	}
}

func TestSimilarOnlyOpen(t *testing.T) {
	svc, app, board, mara := setup(t)
	testutil.Request(t, app, board, mara, "Dark mode for the editor", "planned", 9)
	testutil.Request(t, app, board, mara, "Dark mode for widgets", "completed", 3)
	got, err := svc.Similar("dark mod", 3)
	if err != nil || len(got) != 1 || got[0].Status != "planned" {
		t.Fatalf("similar = %+v, %v", got, err)
	}
}
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd server && go test ./internal/requests -run 'List|Similar'`
Expected: FAIL with `undefined: requests.Query`.

- [ ] **Step 3: Implement listing and search**

Public scope is: visible, on a public board, not merged; plus the viewer's own requests (so authors see theirs while awaiting approval). Team scope sees everything except merged requests and marks unseen ones `new`. Search input is reduced to quoted prefix terms before it reaches FTS5, so user text can never inject FTS syntax.

`server/internal/requests/list.go`:

```go
package requests

import (
	"strings"
	"time"
	"unicode"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Query is what the board and the dashboard table ask for.
type Query struct {
	Sort       string   // trending (default), newest, oldest, top, updated
	Statuses   []string // empty means every status
	Boards     []string // board ids
	Tags       []string // tag ids; a request matches if it has any of them
	Visibility string   // team only: "public", "hidden" or ""
	Search     string
	Page       int // 1-based
	PerPage    int
}

// Item is one request as the board and the table show it.
type Item struct {
	ID               string    `json:"id"`
	Title            string    `json:"title"`
	Body             string    `json:"body"`
	Status           string    `json:"status"`
	Board            Ref       `json:"board"`
	Author           Person    `json:"author"`
	Tags             []Ref     `json:"tags"`
	Comments         int       `json:"comments"`
	Votes            int       `json:"votes"`
	Voted            bool      `json:"voted"`
	Visible          bool      `json:"visible"`
	AwaitingApproval bool      `json:"awaitingApproval"`
	New              bool      `json:"new"`
	Created          time.Time `json:"created"`
}

type Ref struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Person struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
	Team   bool   `json:"team"`
}

type Page struct {
	Items      []Item `json:"items"`
	Page       int    `json:"page"`
	PerPage    int    `json:"perPage"`
	TotalItems int    `json:"totalItems"`
}

// List returns one page of requests. viewer may be nil. team switches to the dashboard's
// view: every board, hidden requests, internal comments counted, "New" markers.
func (s *Service) List(q Query, viewer *core.Record, team bool) (Page, error) {
	if q.PerPage <= 0 || q.PerPage > 100 {
		q.PerPage = 20
	}
	if q.Page < 1 {
		q.Page = 1
	}
	where := []dbx.Expression{dbx.HashExp{"r.mergedInto": ""}}
	if !team {
		public := dbx.And(dbx.HashExp{"r.visible": true}, dbx.NewExp("b.isPublic = 1"))
		if viewer != nil {
			public = dbx.Or(public, dbx.HashExp{"r.author": viewer.Id})
		}
		where = append(where, public)
	} else {
		switch q.Visibility {
		case "public":
			where = append(where, dbx.HashExp{"r.visible": true})
		case "hidden":
			where = append(where, dbx.HashExp{"r.visible": false})
		}
	}
	if len(q.Statuses) > 0 {
		where = append(where, dbx.In("r.status", anys(q.Statuses)...))
	}
	if len(q.Boards) > 0 {
		where = append(where, dbx.In("r.board", anys(q.Boards)...))
	}
	if len(q.Tags) > 0 {
		ors := make([]dbx.Expression, 0, len(q.Tags))
		for i, tag := range q.Tags {
			p := "tag" + string(rune('a'+i))
			ors = append(ors, dbx.NewExp("EXISTS (SELECT 1 FROM json_each(r.tags) WHERE value = {:"+p+"})", dbx.Params{p: tag}))
		}
		where = append(where, dbx.Or(ors...))
	}
	if m := ftsQuery(q.Search); m != "" {
		where = append(where, dbx.NewExp("r.rowid IN (SELECT rowid FROM requests_fts WHERE requests_fts MATCH {:fts})", dbx.Params{"fts": m}))
	}

	base := s.App.DB().Select().From("requests r").InnerJoin("boards b", dbx.NewExp("b.id = r.board")).Where(dbx.And(where...))

	var total int
	if err := base.Select("count(*)").Row(&total); err != nil {
		return Page{}, err
	}

	order := map[string][]string{
		"newest":  {"r.created DESC"},
		"oldest":  {"r.created ASC"},
		"top":     {"r.upvoteCount DESC", "r.created DESC"},
		"updated": {"r.updated DESC"},
	}[q.Sort]
	if order == nil {
		order = []string{"r.trendScore DESC", "r.created DESC"}
	}
	var ids []string
	err := base.Select("r.id").OrderBy(order...).Limit(int64(q.PerPage)).Offset(int64((q.Page - 1) * q.PerPage)).Column(&ids)
	if err != nil {
		return Page{}, err
	}
	items, err := s.items(ids, viewer, team)
	if err != nil {
		return Page{}, err
	}
	return Page{Items: items, Page: q.Page, PerPage: q.PerPage, TotalItems: total}, nil
}

// Similar finds up to limit public, open requests whose title or body match text.
func (s *Service) Similar(text string, limit int) ([]Item, error) {
	page, err := s.List(Query{Search: text, Statuses: []string{"pending", "reviewing", "planned", "progress"}, PerPage: limit, Sort: "top"}, nil, false)
	return page.Items, err
}

// items loads records for ids (keeping their order) and decorates them.
func (s *Service) items(ids []string, viewer *core.Record, team bool) ([]Item, error) {
	out := make([]Item, 0, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	recs, err := s.App.FindRecordsByIds("requests", ids)
	if err != nil {
		return nil, err
	}
	if errs := s.App.ExpandRecords(recs, []string{"board", "author", "tags"}, nil); len(errs) > 0 {
		for _, e := range errs {
			return nil, e
		}
	}
	byID := make(map[string]*core.Record, len(recs))
	for _, r := range recs {
		byID[r.Id] = r
	}

	voted := map[string]bool{}
	if viewer != nil {
		var mine []string
		err := s.App.DB().Select("request").From("votes").
			Where(dbx.And(dbx.HashExp{"user": viewer.Id}, dbx.In("request", anys(ids)...))).Column(&mine)
		if err != nil {
			return nil, err
		}
		for _, id := range mine {
			voted[id] = true
		}
	}

	type countRow struct {
		Request string `db:"request"`
		N       int    `db:"n"`
	}
	var counts []countRow
	cq := s.App.DB().Select("request", "count(*) AS n").From("comments").Where(dbx.In("request", anys(ids)...)).GroupBy("request")
	if !team {
		cq.AndWhere(dbx.HashExp{"internal": false})
	}
	if err := cq.All(&counts); err != nil {
		return nil, err
	}
	comments := map[string]int{}
	for _, c := range counts {
		comments[c.Request] = c.N
	}

	for _, id := range ids {
		r := byID[id]
		if r == nil {
			continue
		}
		it := Item{
			ID: r.Id, Title: r.GetString("title"), Body: r.GetString("body"), Status: r.GetString("status"),
			Comments: comments[r.Id], Votes: r.GetInt("upvoteCount"), Voted: voted[r.Id],
			Visible: r.GetBool("visible"), AwaitingApproval: r.GetBool("awaitingApproval"),
			Created: r.GetDateTime("created").Time(), Tags: []Ref{},
		}
		if team {
			it.New = r.GetDateTime("teamSeenAt").IsZero()
		}
		if b := r.ExpandedOne("board"); b != nil {
			it.Board = Ref{ID: b.Id, Name: b.GetString("name")}
		}
		if a := r.ExpandedOne("author"); a != nil {
			it.Author = Person{ID: a.Id, Name: a.GetString("name"), Avatar: a.GetString("avatar"), Team: a.GetBool("isAdmin")}
		}
		for _, tg := range r.ExpandedAll("tags") {
			it.Tags = append(it.Tags, Ref{ID: tg.Id, Name: tg.GetString("name")})
		}
		out = append(out, it)
	}
	return out, nil
}

// ftsQuery turns free text into a safe FTS5 prefix query: `"dark"* "mode"*`.
func ftsQuery(text string) string {
	words := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	parts := make([]string, 0, len(words))
	for _, w := range words {
		if len(w) < 2 {
			continue
		}
		parts = append(parts, `"`+w+`"*`)
		if len(parts) == 8 {
			break
		}
	}
	return strings.Join(parts, " ")
}

func anys(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}
```

- [ ] **Step 4: Run the tests**

Run: `cd server && go test ./internal/requests`
Expected: `ok`.

---

### Task 5: Team, bans and configuration

**Files:**
- Create: `server/internal/team/team.go`, `server/internal/team/team_test.go`
- Create: `server/internal/config/config.go`, `server/internal/config/config_test.go`

**Interfaces:**
- Consumes: testutil.
- Produces (team): `NameFromEmail(email string) string`; `Profile(app, superuser *core.Record) (*core.Record, error)`; `SeedFirstAdmin(app, email, password string) error`; `List(app) ([]Member, error)` with `Member{ID, Email, Name string; Created time.Time}`; `Invite(app, baseURL, email string) (link string, err error)` (link `<base>/dashboard/invite?token=…`, valid 7 days); `Remove(app, actor *core.Record, superuserID string) error`; `ResetLink(app, baseURL, userID string) (string, error)` (link `<base>/reset-password?token=…`); `UserSummary(app, userID string) (Summary, error)` with `Summary{ID, Name, Email string; Joined time.Time; Requests, Votes int64; Verified, Banned, Team bool}`; `SetBanned(app, userID string, banned bool) error`; errors `ErrRemoveSelf, ErrLastAdmin`.
- Produces (config): `config.Config{URL, TLS, DataDir, WebURL string; WebCmd []string; AdminEmail, AdminPassword string; PBAdmin bool}`, `config.FromEnv() Config` reading `LORT_URL` (default `http://localhost:4052`), `LORT_TLS` (default `off`), `LORT_DATA` (default `./pb_data`), `LORT_WEB_URL` (default `http://127.0.0.1:3000`), `LORT_WEB_CMD`, `LORT_ADMIN_EMAIL`, `LORT_ADMIN_PASSWORD`, `LORT_PB_ADMIN`; `(Config).ServeArgs() []string`.

- [ ] **Step 1: Write the failing tests**

`server/internal/team/team_test.go`:

```go
package team_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/team"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

func TestNameFromEmail(t *testing.T) {
	if got := team.NameFromEmail("priya.s@example.com"); got != "priya.s" {
		t.Errorf("got %q", got)
	}
}

func TestSeedFirstAdminOnlyOnce(t *testing.T) {
	app := testutil.NewApp(t)
	if err := team.SeedFirstAdmin(app, "luk@driftnote.app", "correcthorse"); err != nil {
		t.Fatal(err)
	}
	if err := team.SeedFirstAdmin(app, "someone@else.com", "correcthorse"); err != nil {
		t.Fatal(err)
	}
	if n, _ := app.CountRecords(core.CollectionNameSuperusers); n != 1 {
		t.Fatalf("superusers = %d", n)
	}
	p, err := app.FindAuthRecordByEmail("users", "luk@driftnote.app")
	if err != nil || !p.GetBool("isAdmin") || p.GetString("name") != "luk" {
		t.Fatalf("profile = %v, %v", p, err)
	}
}

func TestInviteAndRemove(t *testing.T) {
	app := testutil.NewApp(t)
	luk := testutil.Superuser(t, app, "luk@driftnote.app")
	link, err := team.Invite(app, "https://feedback.driftnote.app/", "sofia@driftnote.app")
	if err != nil || !strings.HasPrefix(link, "https://feedback.driftnote.app/dashboard/invite?token=") {
		t.Fatalf("link = %q, %v", link, err)
	}
	members, _ := team.List(app)
	if len(members) != 2 || members[1].Name != "sofia" {
		t.Fatalf("members = %+v", members)
	}
	if err := team.Remove(app, luk, luk.Id); !errors.Is(err, team.ErrRemoveSelf) {
		t.Errorf("remove self = %v", err)
	}
	if err := team.Remove(app, luk, members[1].ID); err != nil {
		t.Fatal(err)
	}
	p, _ := app.FindAuthRecordByEmail("users", "sofia@driftnote.app")
	if p.GetBool("isAdmin") {
		t.Error("removed admin's profile should be demoted")
	}
}

func TestRemoveRefusesLastAdmin(t *testing.T) {
	app := testutil.NewApp(t)
	luk := testutil.Superuser(t, app, "luk@driftnote.app")
	other := testutil.Superuser(t, app, "x@driftnote.app")
	if err := app.Delete(luk); err != nil {
		t.Fatal(err)
	}
	if err := team.Remove(app, luk, other.Id); !errors.Is(err, team.ErrLastAdmin) {
		t.Errorf("err = %v", err)
	}
}

func TestBanAndSummary(t *testing.T) {
	app := testutil.NewApp(t)
	b := testutil.Board(t, app, "Features", true, false)
	devon := testutil.User(t, app, "devon@example.com")
	testutil.Request(t, app, b, devon, "Export", "pending", 0)
	if err := team.SetBanned(app, devon.Id, true); err != nil {
		t.Fatal(err)
	}
	s, err := team.UserSummary(app, devon.Id)
	if err != nil || !s.Banned || s.Requests != 1 || s.Email != "devon@example.com" {
		t.Fatalf("summary = %+v, %v", s, err)
	}
	link, err := team.ResetLink(app, "https://f.example", devon.Id)
	if err != nil || !strings.HasPrefix(link, "https://f.example/reset-password?token=") {
		t.Fatalf("reset link = %q, %v", link, err)
	}
}
```

`server/internal/config/config_test.go`:

```go
package config

import (
	"reflect"
	"testing"
)

func TestServeArgs(t *testing.T) {
	auto := Config{URL: "https://feedback.driftnote.app", TLS: "auto"}
	want := []string{"serve", "--http=0.0.0.0:80", "--https=0.0.0.0:443", "feedback.driftnote.app"}
	if got := auto.ServeArgs(); !reflect.DeepEqual(got, want) {
		t.Errorf("auto = %v", got)
	}
	off := Config{URL: "https://feedback.driftnote.app", TLS: "off"}
	if got := off.ServeArgs(); !reflect.DeepEqual(got, []string{"serve", "--http=0.0.0.0:4052"}) {
		t.Errorf("off = %v", got)
	}
}

func TestFromEnv(t *testing.T) {
	t.Setenv("LORT_URL", "https://f.example/")
	t.Setenv("LORT_WEB_CMD", "node /app/web/server.js")
	c := FromEnv()
	if c.URL != "https://f.example" || !reflect.DeepEqual(c.WebCmd, []string{"node", "/app/web/server.js"}) || c.TLS != "off" {
		t.Errorf("config = %+v", c)
	}
}
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd server && go test ./internal/team ./internal/config`
Expected: FAIL with undefined identifiers.

- [ ] **Step 3: Implement team management**

Invites reuse PocketBase's superuser password-reset token (Task 2 set its lifetime to 7 days); the invite page in plan 1B posts the token and new password to PocketBase's `POST /api/collections/_superusers/confirm-password-reset`.

`server/internal/team/team.go`:

```go
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
```

- [ ] **Step 4: Implement configuration**

`server/internal/config/config.go`:

```go
// Package config reads Lort's environment.
package config

import (
	"net/url"
	"os"
	"strings"
)

type Config struct {
	URL           string // public URL, e.g. https://feedback.driftnote.app
	TLS           string // "auto": Lort serves :80/:443 with Let's Encrypt; "off": plain HTTP on :4052
	DataDir       string
	WebURL        string   // where the Next.js server listens
	WebCmd        []string // how to start it; empty means it is run separately (development)
	AdminEmail    string
	AdminPassword string
	PBAdmin       bool // expose PocketBase's own admin UI at /_/
}

func FromEnv() Config {
	c := Config{
		URL:           strings.TrimRight(env("LORT_URL", "http://localhost:4052"), "/"),
		TLS:           env("LORT_TLS", "off"),
		DataDir:       env("LORT_DATA", "./pb_data"),
		WebURL:        env("LORT_WEB_URL", "http://127.0.0.1:3000"),
		AdminEmail:    os.Getenv("LORT_ADMIN_EMAIL"),
		AdminPassword: os.Getenv("LORT_ADMIN_PASSWORD"),
		PBAdmin:       os.Getenv("LORT_PB_ADMIN") == "1",
	}
	if cmd := os.Getenv("LORT_WEB_CMD"); cmd != "" {
		c.WebCmd = strings.Fields(cmd)
	}
	return c
}

// ServeArgs are the PocketBase serve arguments for this config.
// With TLS on, PocketBase's built-in autocert gets and renews the certificate.
func (c Config) ServeArgs() []string {
	if c.TLS == "auto" {
		host := c.URL
		if u, err := url.Parse(c.URL); err == nil && u.Host != "" {
			host = u.Hostname()
		}
		return []string{"serve", "--http=0.0.0.0:80", "--https=0.0.0.0:443", host}
	}
	return []string{"serve", "--http=0.0.0.0:4052"}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 5: Run the tests**

Run: `cd server && go test ./internal/team ./internal/config`
Expected: `ok` for both.

---

### Task 6: Rules on PocketBase's record API

**Files:**
- Create: `server/internal/hooks/hooks.go`, `server/internal/hooks/hooks_test.go`

**Interfaces:**
- Consumes: `requests.New`, `(*Service).AfterCreate`, `team.NameFromEmail`.
- Produces: `hooks.Register(app core.App, svc *requests.Service)`. Behaviour: sign-up ignores `isAdmin`/`banned`, defaults `name` to the email prefix and rejects a filled `website` honeypot; request creation forces author, `pending`, visibility (approval boards → hidden + awaitingApproval; admins may send `internal: true` → hidden), then adds the author's vote and the `created` timeline entry; banned users get 403 on request create/update and comment create; comments force author, allow `internal` for admins only and allow replies to top-level comments only; boards with requests can't be deleted.

- [ ] **Step 1: Write the failing hook tests**

These go through PocketBase's real HTTP API with `tests.ApiScenario`.

`server/internal/hooks/hooks_test.go`:

```go
package hooks_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/hacker4ofakind/lort/server/internal/hooks"
	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

type fixture struct {
	app                *tests.TestApp
	features, approval *core.Record
	mara, banned       *core.Record
	admin              *core.Record
}

func newFixture(t testing.TB) *fixture {
	app := testutil.NewApp(t)
	hooks.Register(app, requests.New(app))
	f := &fixture{app: app}
	f.features = testutil.Board(t, app, "Features", true, false)
	f.approval = testutil.Board(t, app, "Bugs", true, true)
	f.mara = testutil.User(t, app, "mara@example.com")
	f.banned = testutil.User(t, app, "spam@example.com")
	f.banned.Set("banned", true)
	f.admin = testutil.User(t, app, "luk@driftnote.app")
	f.admin.Set("isAdmin", true)
	for _, r := range []*core.Record{f.banned, f.admin} {
		if err := app.Save(r); err != nil {
			t.Fatal(err)
		}
	}
	return f
}

func (f *fixture) scenario(t *testing.T, s tests.ApiScenario, after func(*testing.T, *tests.TestApp)) {
	s.TestAppFactory = func(testing.TB) *tests.TestApp { return f.app }
	s.DisableTestAppCleanup = true
	if after != nil {
		s.AfterTestFunc = func(t testing.TB, app *tests.TestApp, _ *http.Response) { after(t.(*testing.T), app) }
	}
	s.Test(t)
}

func TestSignupDefaultsNameAndBlocksHoneypot(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/users/records",
		Body:           strings.NewReader(`{"email":"priya.s@example.com","password":"correcthorse","passwordConfirm":"correcthorse","isAdmin":true}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"name":"priya.s"`, `"isAdmin":false`},
	}, nil)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/users/records",
		Body:           strings.NewReader(`{"email":"bot@example.com","password":"correcthorse","passwordConfirm":"correcthorse","website":"http://spam"}`),
		ExpectedStatus: 400, ExpectedContent: []string{"Something went wrong"},
	}, nil)
}

func TestCreateRequestFillsServerFields(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/requests/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"Dark mode","status":"completed","upvoteCount":999,"author":"x"}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"status":"pending"`, `"visible":true`},
	}, func(t *testing.T, app *tests.TestApp) {
		r, err := app.FindFirstRecordByData("requests", "title", "Dark mode")
		if err != nil {
			t.Fatal(err)
		}
		if r.GetString("author") != f.mara.Id || r.GetInt("upvoteCount") != 1 {
			t.Errorf("author=%s votes=%d", r.GetString("author"), r.GetInt("upvoteCount"))
		}
		if n, _ := app.CountRecords("activity", dbx.HashExp{"request": r.Id, "kind": "created"}); n != 1 {
			t.Errorf("created activity = %d", n)
		}
	})
}

func TestCreateRequestOnApprovalBoardIsHidden(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/requests/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"board":"` + f.approval.Id + `","title":"Crash on paste"}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"visible":false`, `"awaitingApproval":true`},
	}, nil)
}

func TestAdminCanCreateInternalRequest(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/requests/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.admin)},
		Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"Refactor sync","internal":true}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"visible":false`, `"awaitingApproval":false`},
	}, nil)
}

func TestBannedUserCannotPost(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/requests/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.banned)},
		Body:           strings.NewReader(`{"board":"` + f.features.Id + `","title":"Buy cheap stuff"}`),
		ExpectedStatus: 403, ExpectedContent: []string{"can't post"},
	}, nil)
}

func TestCommentsInternalAndReplies(t *testing.T) {
	f := newFixture(t)
	req := testutil.Request(t, f.app, f.features, f.mara, "Export", "pending", 1)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/comments/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"request":"` + req.Id + `","body":"Me too","internal":true}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"internal":false`},
	}, nil)
	top, _ := f.app.FindFirstRecordByData("comments", "body", "Me too")
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/comments/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.admin)},
		Body:           strings.NewReader(`{"request":"` + req.Id + `","body":"Thanks!","parent":"` + top.Id + `"}`),
		ExpectedStatus: 200, ExpectedContent: []string{`"parent":"` + top.Id + `"`},
	}, nil)
	reply, _ := f.app.FindFirstRecordByData("comments", "body", "Thanks!")
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPost, URL: "/api/collections/comments/records",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"request":"` + req.Id + `","body":"Nested","parent":"` + reply.Id + `"}`),
		ExpectedStatus: 400, ExpectedContent: []string{"top-level comment"},
	}, nil)
}

func TestBoardWithRequestsCannotBeDeleted(t *testing.T) {
	f := newFixture(t)
	testutil.Request(t, f.app, f.features, f.mara, "Export", "pending", 1)
	su := testutil.Superuser(t, f.app, "root@example.com")
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodDelete, URL: "/api/collections/boards/records/" + f.features.Id,
		Headers:        map[string]string{"Authorization": testutil.Token(t, su)},
		ExpectedStatus: 400, ExpectedContent: []string{"Move this board"},
	}, nil)
}

func TestUsersCannotPromoteThemselves(t *testing.T) {
	f := newFixture(t)
	f.scenario(t, tests.ApiScenario{
		Method: http.MethodPatch, URL: "/api/collections/users/records/" + f.mara.Id,
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		Body:           strings.NewReader(`{"isAdmin":true}`),
		ExpectedStatus: 404, ExpectedContent: []string{`"data":{}`},
	}, nil)
}
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd server && go test ./internal/hooks`
Expected: FAIL with `undefined: hooks.Register`.

- [ ] **Step 3: Implement the hooks**

`server/internal/hooks/hooks.go`:

```go
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
	if err := e.Next(); err != nil {
		return err
	}
	return svc.AfterCreate(r, author)
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
```

- [ ] **Step 4: Run the tests**

Run: `cd server && go test ./internal/hooks`
Expected: `ok`.

---

### Task 7: The /api/lort endpoints

**Files:**
- Create: `server/internal/api/api.go`, `server/internal/api/api_test.go`

**Interfaces:**
- Consumes: `requests.Service` (List, Similar, ToggleVote, SetStatus, UndoComplete, Merge, MarkSeen), `team.*`, `config.Config`, `status.Action`.
- Produces: `api.Deps{Svc *requests.Service; Cfg config.Config}` and `api.Register(se *core.ServeEvent, d Deps)`. Routes (all JSON):
-   - Public: `GET /api/lort/health` → `{ok}`; `GET /api/lort/config` → `{appName, logo, primaryColor, showLandingCard, roadmapPublic, boards[{id,name}], tags[{id,name}], features{email, voice, turnstile}}`; `GET /api/lort/requests?sort&status=a,b&board=&tag=&visibility=&q=&page=&perPage=` → `Page` (team scope with a superuser token); `GET /api/lort/similar?q=` → `{items}`.
-   - Users token: `POST /api/lort/requests/{id}/vote` → `{voted, votes}`.
-   - Superuser token: `POST /requests/{id}/status {action}` → `Change`; `POST /requests/{id}/undo` → `Change`; `POST /requests/{id}/merge {target}` → 204; `POST /requests/{id}/seen` → 204; `GET /team` → `{items: Member[], you}`; `GET /team/me` → `{profile, token}` (the admin's users profile and an auth token for it); `POST /team/invite {email}` → `{link}`; `DELETE /team/{id}` → 204; `GET /users/{id}` → `Summary`; `POST /users/{id}/ban {banned}` → 204; `POST /users/{id}/reset-link` → `{link}` (all under `/api/lort`).
-   - Errors: 401 without a token, 403 with the wrong kind of token, 400/404 with a friendly `message`.

- [ ] **Step 1: Write the failing endpoint tests**

`server/internal/api/api_test.go`:

```go
package api_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/hacker4ofakind/lort/server/internal/api"
	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/testutil"
)

type fixture struct {
	app         *tests.TestApp
	board, mara *core.Record
	su          *core.Record
	req         *core.Record
}

func newFixture(t testing.TB) *fixture {
	app := testutil.NewApp(t)
	svc := requests.New(app)
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		api.Register(se, api.Deps{Svc: svc, Cfg: config.Config{URL: "https://f.example"}})
		return se.Next()
	})
	f := &fixture{app: app}
	f.board = testutil.Board(t, app, "Features", true, false)
	f.mara = testutil.User(t, app, "mara@example.com")
	f.su = testutil.Superuser(t, app, "luk@driftnote.app")
	f.req = testutil.Request(t, app, f.board, f.mara, "Dark mode for the editor", "reviewing", 0)
	return f
}

func (f *fixture) run(t *testing.T, s tests.ApiScenario) {
	s.TestAppFactory = func(testing.TB) *tests.TestApp { return f.app }
	s.DisableTestAppCleanup = true
	s.Test(t)
}

func TestPublicEndpoints(t *testing.T) {
	f := newFixture(t)
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/health", ExpectedStatus: 200, ExpectedContent: []string{`"ok":true`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/config", ExpectedStatus: 200,
		ExpectedContent: []string{`"primaryColor":"#cc3a6d"`, `"name":"Features"`, `"email":false`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/requests?status=reviewing&sort=top", ExpectedStatus: 200,
		ExpectedContent: []string{`"title":"Dark mode for the editor"`, `"totalItems":1`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/similar?q=dark", ExpectedStatus: 200,
		ExpectedContent: []string{`"Dark mode for the editor"`}})
}

func TestVoteNeedsAUser(t *testing.T) {
	f := newFixture(t)
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/vote", ExpectedStatus: 401, ExpectedContent: []string{`"data":{}`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/vote",
		Headers:        map[string]string{"Authorization": testutil.Token(t, f.mara)},
		ExpectedStatus: 200, ExpectedContent: []string{`"voted":true`, `"votes":1`}})
}

func TestTriageIsTeamOnly(t *testing.T) {
	f := newFixture(t)
	body := `{"action":"roadmap"}`
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/status",
		Headers: map[string]string{"Authorization": testutil.Token(t, f.mara)}, Body: strings.NewReader(body),
		ExpectedStatus: 403, ExpectedContent: []string{`"data":{}`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/status",
		Headers: map[string]string{"Authorization": testutil.Token(t, f.su)}, Body: strings.NewReader(body),
		ExpectedStatus: 200, ExpectedContent: []string{`"to":"planned"`, `"roadmap":"added"`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/requests/" + f.req.Id + "/status",
		Headers: map[string]string{"Authorization": testutil.Token(t, f.su)}, Body: strings.NewReader(`{"action":"complete"}`),
		ExpectedStatus: 400, ExpectedContent: []string{"not available"}})
}

func TestTeamMeReturnsProfileToken(t *testing.T) {
	f := newFixture(t)
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/team/me",
		Headers: map[string]string{"Authorization": testutil.Token(t, f.su)}, ExpectedStatus: 200,
		ExpectedContent: []string{`"isAdmin":true`, `"token":"`}})
}

func TestTeamInviteAndResetLink(t *testing.T) {
	f := newFixture(t)
	auth := map[string]string{"Authorization": testutil.Token(t, f.su)}
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/team/invite", Headers: auth,
		Body: strings.NewReader(`{"email":"sofia@driftnote.app"}`), ExpectedStatus: 200,
		ExpectedContent: []string{`https://f.example/dashboard/invite?token=`}})
	f.run(t, tests.ApiScenario{Method: http.MethodPost, URL: "/api/lort/users/" + f.mara.Id + "/reset-link", Headers: auth,
		ExpectedStatus: 200, ExpectedContent: []string{`https://f.example/reset-password?token=`}})
	f.run(t, tests.ApiScenario{Method: http.MethodGet, URL: "/api/lort/users/" + f.mara.Id, Headers: auth,
		ExpectedStatus: 200, ExpectedContent: []string{`"email":"mara@example.com"`, `"requests":1`}})
}
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd server && go test ./internal/api`
Expected: FAIL with `undefined: api.Register`.

- [ ] **Step 3: Implement the endpoints**

`features` is hard-coded to all-false in this phase; phases 3 and 5 switch each flag on when its feature is configured.

`server/internal/api/api.go`:

```go
// Package api serves Lort's own endpoints under /api/lort.
package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/status"
	"github.com/hacker4ofakind/lort/server/internal/team"
)

type Deps struct {
	Svc *requests.Service
	Cfg config.Config
}

// Register adds every /api/lort route.
func Register(se *core.ServeEvent, d Deps) {
	g := se.Router.Group("/api/lort")
	g.GET("/health", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"ok": true})
	})
	g.GET("/config", d.config)
	g.GET("/requests", d.list)
	g.GET("/similar", d.similar)
	g.POST("/requests/{id}/vote", d.vote).Bind(apis.RequireAuth("users"))

	team := g.Group("").Bind(apis.RequireSuperuserAuth())
	team.POST("/requests/{id}/status", d.setStatus)
	team.POST("/requests/{id}/undo", d.undo)
	team.POST("/requests/{id}/merge", d.merge)
	team.POST("/requests/{id}/seen", d.seen)
	team.GET("/team", d.teamList)
	team.GET("/team/me", d.teamMe)
	team.POST("/team/invite", d.teamInvite)
	team.DELETE("/team/{id}", d.teamRemove)
	team.GET("/users/{id}", d.userSummary)
	team.POST("/users/{id}/ban", d.userBan)
	team.POST("/users/{id}/reset-link", d.userResetLink)
}

// fail maps service errors to friendly HTTP errors.
func fail(e *core.RequestEvent, err error) error {
	switch {
	case errors.Is(err, requests.ErrNotFound):
		return e.NotFoundError("That request is gone.", nil)
	case errors.Is(err, requests.ErrNotVoting), errors.Is(err, requests.ErrUndoGone),
		errors.Is(err, requests.ErrBadMerge), errors.Is(err, team.ErrRemoveSelf), errors.Is(err, team.ErrLastAdmin):
		return e.BadRequestError(err.Error(), nil)
	default:
		return e.BadRequestError(err.Error(), nil)
	}
}

// actor is the signed-in superuser's users profile, used for timeline entries and comments.
func actor(e *core.RequestEvent) (*core.Record, error) {
	return team.Profile(e.App, e.Auth)
}

func (d Deps) config(e *core.RequestEvent) error {
	settings, err := e.App.FindFirstRecordByFilter("settings", "")
	if err != nil {
		return err
	}
	logo := ""
	if f := settings.GetString("logo"); f != "" {
		logo = "/api/files/settings/" + settings.Id + "/" + f
	}
	boards, err := e.App.FindRecordsByFilter("boards", "isPublic = true", "order", 0, 0)
	if err != nil {
		return err
	}
	tags, err := e.App.FindRecordsByFilter("tags", "", "order", 0, 0)
	if err != nil {
		return err
	}
	type ref struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	toRefs := func(rs []*core.Record) []ref {
		out := make([]ref, len(rs))
		for i, r := range rs {
			out[i] = ref{r.Id, r.GetString("name")}
		}
		return out
	}
	return e.JSON(http.StatusOK, map[string]any{
		"appName":         settings.GetString("appName"),
		"logo":            logo,
		"primaryColor":    settings.GetString("primaryColor"),
		"showLandingCard": settings.GetBool("showLandingCard"),
		"roadmapPublic":   settings.GetBool("roadmapPublic"),
		"boards":          toRefs(boards),
		"tags":            toRefs(tags),
		"features":        map[string]bool{"email": false, "voice": false, "turnstile": false},
	})
}

func csv(v string) []string {
	if v == "" {
		return nil
	}
	return strings.Split(v, ",")
}

func (d Deps) list(e *core.RequestEvent) error {
	q := e.Request.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	perPage, _ := strconv.Atoi(q.Get("perPage"))
	var viewer *core.Record
	if e.Auth != nil && e.Auth.Collection().Name == "users" {
		viewer = e.Auth
	}
	res, err := d.Svc.List(requests.Query{
		Sort: q.Get("sort"), Statuses: csv(q.Get("status")), Boards: csv(q.Get("board")),
		Tags: csv(q.Get("tag")), Visibility: q.Get("visibility"), Search: q.Get("q"),
		Page: page, PerPage: perPage,
	}, viewer, e.HasSuperuserAuth())
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, res)
}

func (d Deps) similar(e *core.RequestEvent) error {
	items, err := d.Svc.Similar(e.Request.URL.Query().Get("q"), 3)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{"items": items})
}

func (d Deps) vote(e *core.RequestEvent) error {
	if e.Auth.GetBool("banned") {
		return e.ForbiddenError("Your account can't vote on this board.", nil)
	}
	voted, count, err := d.Svc.ToggleVote(e.Request.PathValue("id"), e.Auth.Id)
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, map[string]any{"voted": voted, "votes": count})
}

func (d Deps) setStatus(e *core.RequestEvent) error {
	var body struct {
		Action status.Action `json:"action"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Send an action.", err)
	}
	who, err := actor(e)
	if err != nil {
		return err
	}
	ch, err := d.Svc.SetStatus(e.Request.PathValue("id"), body.Action, who)
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, ch)
}

func (d Deps) undo(e *core.RequestEvent) error {
	ch, err := d.Svc.UndoComplete(e.Request.PathValue("id"))
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, ch)
}

func (d Deps) merge(e *core.RequestEvent) error {
	var body struct {
		Target string `json:"target"`
	}
	if err := e.BindBody(&body); err != nil || body.Target == "" {
		return e.BadRequestError("Pick a request to merge into.", err)
	}
	who, err := actor(e)
	if err != nil {
		return err
	}
	if err := d.Svc.Merge(e.Request.PathValue("id"), body.Target, who); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (d Deps) seen(e *core.RequestEvent) error {
	if err := d.Svc.MarkSeen(e.Request.PathValue("id")); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (d Deps) teamList(e *core.RequestEvent) error {
	members, err := team.List(e.App)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{"items": members, "you": e.Auth.Id})
}

// teamMe returns the admin's public profile and a token for it, so the dashboard can
// comment, vote and suggest as that profile on the public board.
func (d Deps) teamMe(e *core.RequestEvent) error {
	p, err := actor(e)
	if err != nil {
		return err
	}
	token, err := p.NewAuthToken()
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{"profile": p, "token": token})
}

func (d Deps) teamInvite(e *core.RequestEvent) error {
	var body struct {
		Email string `json:"email"`
	}
	if err := e.BindBody(&body); err != nil || !strings.Contains(body.Email, "@") {
		return e.BadRequestError("Enter an email address.", err)
	}
	link, err := team.Invite(e.App, d.Cfg.URL, strings.TrimSpace(body.Email))
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, map[string]any{"link": link})
}

func (d Deps) teamRemove(e *core.RequestEvent) error {
	if err := team.Remove(e.App, e.Auth, e.Request.PathValue("id")); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (d Deps) userSummary(e *core.RequestEvent) error {
	s, err := team.UserSummary(e.App, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("That person is gone.", nil)
	}
	return e.JSON(http.StatusOK, s)
}

func (d Deps) userBan(e *core.RequestEvent) error {
	var body struct {
		Banned bool `json:"banned"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Send banned: true or false.", err)
	}
	if err := team.SetBanned(e.App, e.Request.PathValue("id"), body.Banned); err != nil {
		return fail(e, err)
	}
	return e.NoContent(http.StatusNoContent)
}

func (d Deps) userResetLink(e *core.RequestEvent) error {
	link, err := team.ResetLink(e.App, d.Cfg.URL, e.Request.PathValue("id"))
	if err != nil {
		return fail(e, err)
	}
	return e.JSON(http.StatusOK, map[string]any{"link": link})
}
```

- [ ] **Step 4: Run the tests**

Run: `cd server && go test ./internal/api`
Expected: `ok`.

---

### Task 8: Proxy, supervisor, main and a smoke run

**Files:**
- Create: `server/internal/web/web.go`, `server/internal/web/web_test.go`
- Create: `server/main.go`
- Modify: `.gitignore` (add `server/pb_data/` and `server/lort`)

**Interfaces:**
- Consumes: everything above.
- Produces: `web.Proxy(target *url.URL) func(*core.RequestEvent) error` (friendly 502 page with `Retry-After: 5` when Next is down); `web.Supervise(ctx context.Context, cmd []string, log *slog.Logger)` (restarts with 1s→30s backoff, resets after a minute of uptime, sets `HOSTNAME=127.0.0.1 PORT=3000`). The `lort` binary: with no arguments it serves according to `LORT_TLS`; any arguments go to PocketBase's CLI (`lort superuser update <email> <password>`, `lort serve …`).

- [ ] **Step 1: Write the failing proxy and supervisor tests**

`server/internal/web/web_test.go`:

```go
package web_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/hacker4ofakind/lort/server/internal/testutil"
	"github.com/hacker4ofakind/lort/server/internal/web"
)

func TestProxyForwardsAndExplainsOutages(t *testing.T) {
	next := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "next says hi to "+r.URL.Path)
	}))
	up, _ := url.Parse(next.URL)
	down, _ := url.Parse("http://127.0.0.1:1")

	for _, c := range []struct {
		target *url.URL
		status int
		want   string
	}{{up, 200, "next says hi to /feedback"}, {down, 502, "starting up"}} {
		app := testutil.NewApp(t)
		target := c.target
		app.OnServe().BindFunc(func(se *core.ServeEvent) error {
			se.Router.Any("/{path...}", web.Proxy(target))
			return se.Next()
		})
		(&tests.ApiScenario{
			Method: http.MethodGet, URL: "/feedback", ExpectedStatus: c.status, ExpectedContent: []string{c.want},
			TestAppFactory: func(testing.TB) *tests.TestApp { return app }, DisableTestAppCleanup: true,
		}).Test(t)
	}
}

func TestSuperviseRestarts(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "runs")
	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()
	web.Supervise(ctx, []string{"sh", "-c", "echo x >> " + marker}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	data, _ := os.ReadFile(marker)
	if runs := strings.Count(string(data), "x"); runs < 2 {
		t.Errorf("runs = %d, want at least 2", runs)
	}
}
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd server && go test ./internal/web`
Expected: FAIL with `undefined: web.Proxy`.

- [ ] **Step 3: Implement the proxy and supervisor**

`server/internal/web/web.go`:

```go
// Package web proxies page requests to the Next.js server and keeps that server running.
package web

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const unavailable = `<!doctype html><meta charset="utf-8"><title>Starting up</title>
<body style="font-family:system-ui;background:#1a1716;color:#f5efea;display:grid;place-items:center;height:100vh;margin:0">
<p>The board is starting up. Refresh in a few seconds.</p>`

// Proxy returns a handler that forwards everything to target.
func Proxy(target *url.URL) func(*core.RequestEvent) error {
	p := httputil.NewSingleHostReverseProxy(target)
	p.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, _ error) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Retry-After", "5")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(unavailable))
	}
	return func(e *core.RequestEvent) error {
		p.ServeHTTP(e.Response, e.Request)
		return nil
	}
}

// Supervise runs cmd until ctx ends, restarting it with backoff (1s doubling to 30s)
// whenever it exits. A run that lasted over a minute resets the backoff.
func Supervise(ctx context.Context, cmd []string, log *slog.Logger) {
	backoff := time.Second
	for ctx.Err() == nil {
		started := time.Now()
		c := exec.CommandContext(ctx, cmd[0], cmd[1:]...)
		c.Stdout, c.Stderr = os.Stdout, os.Stderr
		c.Env = append(os.Environ(), "HOSTNAME=127.0.0.1", "PORT=3000")
		err := c.Run()
		if ctx.Err() != nil {
			return
		}
		if time.Since(started) > time.Minute {
			backoff = time.Second
		}
		log.Warn("web server exited, restarting", "err", err, "in", backoff)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, 30*time.Second)
	}
}
```

- [ ] **Step 4: Run the tests**

Run: `cd server && go test ./internal/web`
Expected: `ok` (the supervisor test takes about 2.5 s).

- [ ] **Step 5: Write main**

On every serve: ensure the schema, seed the first admin from `LORT_ADMIN_*` (only when no superuser exists), schedule the hourly trending job, hide PocketBase's own admin UI unless `LORT_PB_ADMIN=1`, register `/api/lort`, send every other path to Next.js, and start Next.js under the supervisor when `LORT_WEB_CMD` is set.

`server/main.go`:

```go
// Command lort is the whole Lort server: PocketBase, Lort's rules and API, HTTPS, and the
// supervisor and proxy for the Next.js web app.
package main

import (
	"context"
	"log"
	"net/url"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"github.com/hacker4ofakind/lort/server/internal/api"
	"github.com/hacker4ofakind/lort/server/internal/config"
	"github.com/hacker4ofakind/lort/server/internal/hooks"
	"github.com/hacker4ofakind/lort/server/internal/requests"
	"github.com/hacker4ofakind/lort/server/internal/schema"
	"github.com/hacker4ofakind/lort/server/internal/team"
	"github.com/hacker4ofakind/lort/server/internal/web"
)

func main() {
	cfg := config.FromEnv()
	if len(os.Args) == 1 {
		os.Args = append(os.Args, cfg.ServeArgs()...)
	}

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: cfg.DataDir})
	svc := requests.New(app)
	hooks.Register(app, svc)

	webURL, err := url.Parse(cfg.WebURL)
	if err != nil {
		log.Fatalf("LORT_WEB_URL: %v", err)
	}

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if err := schema.Ensure(se.App); err != nil {
			return err
		}
		if err := team.SeedFirstAdmin(se.App, cfg.AdminEmail, cfg.AdminPassword); err != nil {
			return err
		}
		se.App.Cron().MustAdd("lort_trending", "0 * * * *", func() {
			if err := svc.RecomputeTrending(); err != nil {
				se.App.Logger().Error("trending", "err", err)
			}
		})

		if !cfg.PBAdmin {
			se.Router.BindFunc(func(e *core.RequestEvent) error {
				if strings.HasPrefix(e.Request.URL.Path, "/_/") {
					return e.NotFoundError("", nil)
				}
				return e.Next()
			})
		}
		api.Register(se, api.Deps{Svc: svc, Cfg: cfg})
		se.Router.Any("/{path...}", web.Proxy(webURL))

		if len(cfg.WebCmd) > 0 {
			ctx, cancel := context.WithCancel(context.Background())
			se.App.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
				cancel()
				return e.Next()
			})
			go web.Supervise(ctx, cfg.WebCmd, se.App.Logger())
		}
		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 6: Ignore local data**

Append to the repo's `.gitignore`:

```
# Local Lort server data and binary
server/pb_data/
server/lort
```

- [ ] **Step 7: Run the whole suite, vet and build**

Run: `cd server && go mod tidy && gofmt -l . && go vet ./... && go test ./... && CGO_ENABLED=0 go build -o lort .`
Expected: `gofmt -l` prints nothing, vet is clean, every package is `ok`, and `server/lort` is built (about 36 MB).

- [ ] **Step 8: Smoke-test the binary**

```bash
cd server
LORT_DATA=$PWD/pb_data LORT_ADMIN_EMAIL=admin@example.com LORT_ADMIN_PASSWORD=correcthorse ./lort &
sleep 3
curl -s localhost:4052/api/lort/health                       # {"ok":true}
curl -s localhost:4052/api/lort/config                       # appName "My app", primaryColor "#cc3a6d"
curl -s -o /dev/null -w '%{http_code}\n' localhost:4052/feedback   # 502 (Next isn't running yet)
curl -s -o /dev/null -w '%{http_code}\n' localhost:4052/_/         # 404
curl -s -X POST localhost:4052/api/collections/_superusers/auth-with-password \
  -H 'content-type: application/json' -d '{"identity":"admin@example.com","password":"correcthorse"}' | head -c 60   # {"record":…
kill %1
LORT_DATA=$PWD/pb_data ./lort superuser update admin@example.com anotherpassword   # Successfully changed superuser …
rm -rf pb_data lort
```
Expected: each command prints what its comment says.

- [ ] **Step 9: Commit**

```bash
git add server .gitignore
git commit -m "Add the Lort server: schema, triage, votes, merge, search, team and /api/lort"
```

---

## Self-review notes

- Spec coverage for this plan: data model (spec 3) → Task 2; statuses and triage (4.1, 4.2) → Tasks 1, 3, 7; merge (4.3) → Task 3; trending (4.4) → Tasks 1, 3, 8 (hourly cron); votes (5.3) → Tasks 3, 7; comments (5.4) → Task 6; approval boards and internal requests (5.2) → Task 6; dashboard table filters, "New" markers and search (6.1) → Tasks 4, 7; avatar popover, ban and reset link (6.2) → Tasks 5, 7; Settings → Team (6.6) → Tasks 5, 7; rate limits and honeypot (5.7) → Tasks 2, 6; first admin and `--reset-admin` support (1.3, 1.4) → Tasks 5, 8; routing and `/_/` (2.2) → Task 8; HTTPS (1.2 step 7) → Task 5 `ServeArgs`.
- Left for later plans: the web app and every page (1B); Dockerfile, setup scripts and CI (1C); the 60-second email and webhook jobs behind Complete (phases 3 and 4 add a `jobs` collection and cancel them in `UndoComplete`); `features` flags (phases 3 and 5).
