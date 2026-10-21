# Lort Phase 2A: Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. This plan gives structure and decisions, not code. You write the implementation (TDD per task). Track tasks with the checkboxes. After all tasks, run the **Manual Verification Checklist** (or hand it to the user if they asked to do it), then fill in **Implementation Notes**.

**Goal:** Ship the roadmap: a read-only public `/roadmap` (with `/roadmap/shipped`), a drag-and-drop `/dashboard/roadmap` with keyboard moves and the Complete undo, and Settings → Roadmap.
**Specs:** `.superpowers/specs/2026-10-15-lort-design.md` (parent): 3 (requests), 4.1–4.2, 5.1 `/roadmap`, 5.3, 5.6, 6 (sidebar), 6.3, 6.6 Roadmap, 13 (phase 2), 14.4–14.5, 15.1 `/roadmap`, 15.2 Roadmap. Canvases: `design/canvas/P-Roadmap.dc.html`, `D-Roadmap.dc.html`, `S-Roadmap.dc.html`. The spec already records this plan's decisions (below).
**Architecture:** Go gains one stored field (`requests.statusChangedAt`, the time a request entered its current status), a roadmap read (`GET /api/lort/roadmap`, `GET /api/lort/roadmap/shipped`), a roadmap-only move (`POST /api/lort/requests/{id}/roadmap`) and a team-only `roadmapStatus` on create. The web app adds the public pages under `app/(board)`, the dashboard board under `app/dashboard/(app)` built on dnd-kit (already a dependency), and one Settings section. Data loads in the browser through the existing SDK clients and TanStack Query, like every Phase 1 page.
**Tech Stack:** as Phase 1: Go 1.27 + PocketBase v0.40.5; Next.js 16.4, React 19.3, shadcn (`base-nova`, Base UI), Tailwind 4.3, Motion 14, TanStack Query 5, PocketBase JS SDK 0.28, `@dnd-kit/core` 6; Vitest 5, Playwright 1.64 + axe.

This is plan 1 of Phase 2: **2A roadmap (this)**, 2B changelog (editor, scheduling, public pages; planned separately).

## Global Constraints

- `CLAUDE.md` frontend rules hold: shadcn components from the CLI only (`pnpm dlx shadcn@latest add …`, then `pnpm ui:fix`), Tailwind utilities on Lort's tokens, no hand-written component CSS, never copy `design/` code into `web/`.
- Base UI, not Radix: `render={…}` not `asChild`; menu items take `onClick`. Merge classes only with `cn()` (never template-literal classNames).
- Statuses, exactly: `pending reviewing planned progress completed closed`. Roadmap statuses: `planned progress completed`. Labels Planned, In progress, Completed.
- Status Label Rule (icon + ink label, or coloured text, never both); Owner's Colour Rule (primary only for live states; one primary button per view); Only-Stickers-Tilt Rule: the dragged card does **not** tilt (the canvas's 2.5° is overruled by the design rule), it scales to 1.02 with `shadow-card-float`.
- Features switched off are absent, never disabled: with the public roadmap off, the nav pill is gone and the pages show the friendly message.
- WCAG 2.2 AA both themes, full keyboard operation of drag-and-drop, 3px focus ring (don't add `outline-none`), `prefers-reduced-motion` (no drop animation, no pulse).
- Public copy speaks for "the team"; "Lort" stays in the footer and the optional card only.
- Email is off in this phase: completion toasts have no "N people will be notified" part (Phase 3 adds it, as `useTriage` already prepares).
- `gofmt`, `go vet ./...`, `pnpm typecheck`, `pnpm lint`, `pnpm test` clean after every task. React 19 lint: no synchronous `setState` in effects, no ref reads during render.
- Branch `phase-2a-roadmap`; one commit at the end, then a PR (review rounds and the docs commit follow `CLAUDE.md`).

## File Map

**Server**
- `server/internal/schema/schema.go`: `statusChangedAt` date field on `requests`, index `idx_requests_status_time (status, statusChangedAt)`, one-time backfill.
- `server/internal/status/status.go` (+test): `RoadmapMove(from, to Status) error`.
- `server/internal/requests/statustime.go` (+test): the hook that stamps `statusChangedAt`, and `previousStatusTime`.
- `server/internal/requests/service.go`: `UndoComplete` restores `statusChangedAt`.
- `server/internal/requests/list.go`: `Item.StatusChangedAt`; sort `shipped`.
- `server/internal/requests/roadmap.go` (+test): `Roadmap`, `Shipped`, `MoveOnRoadmap`, `ErrNotOnRoadmap`.
- `server/internal/hooks/hooks.go` (+test): registers the stamp; `roadmapStatus` on create.
- `server/internal/api/api.go` (+test): the three routes and the roadmap-off rule.
- `server/internal/testutil/testutil.go`: direct inserts set `statusChangedAt`.

**Web**
- `web/lib/api.ts`: `Roadmap`, `RoadmapStatus`, `roadmap()`, `shipped()`, `moveOnRoadmap()`; `RequestItem.statusChangedAt`.
- `web/lib/query.ts` (+test): `keys.roadmap`, `keys.shipped`; `patchRequest`, `voteSnapshot`, `restoreVotes` understand the roadmap shape.
- `web/lib/time.ts` (+test): `agoText`.
- `web/lib/roadmap.ts` (+test): column metadata and copy, `whenText`, `moveCard`, collapsed-columns storage.
- `web/components/board/links.ts`, `board-shell.tsx`: `boardNav(config)`.
- `web/app/(board)/roadmap/page.tsx`, `web/app/(board)/roadmap/shipped/page.tsx`.
- `web/components/board/roadmap/`: `public-roadmap.tsx`, `roadmap-item.tsx`, `shipped-list.tsx`, `roadmap-off.tsx`, `public-roadmap-skeleton.tsx`.
- `web/components/dashboard/settings/roadmap-section.tsx`, `settings-page.tsx` (TOC).
- `web/app/dashboard/(app)/roadmap/page.tsx`.
- `web/components/dashboard/roadmap/`: `roadmap-board.tsx` (DndContext, freeze, optimistic move), `roadmap-column.tsx`, `roadmap-card.tsx`, `roadmap-skeleton.tsx`, `keyboard.ts` (coordinate getter, announcements), `use-roadmap-move.ts`.
- `web/components/dashboard/use-triage.ts`: export the shared completion toast.
- `web/components/board/suggest-dialog.tsx` (+test): `roadmapStatus` prop and payload.
- `web/components/dashboard/app-sidebar.tsx`, `dashboard-shell.tsx`, `web/components/ui/sidebar.tsx`: Roadmap item; dense pages open as the rail.
- `web/e2e/roadmap.spec.ts`, `web/e2e/a11y.spec.ts`, `web/e2e/settings.spec.ts`.

## Key Decisions & Gotchas

**Data**
- **`statusChangedAt`** drives "Planned 3 weeks ago", "Started 4 days ago", "Shipped 09 Oct", the 30-day Completed window and the shipped order. Reading it from `activity` per item would be N queries per page and wrong after an undo; a stored field is one indexed range scan.
- **One stamp for every route.** Register a model-level hook (`OnRecordCreate` / `OnRecordUpdate` on `requests`, not the `*Request` variants) that sets `statusChangedAt = now` on create when empty, and on update when `status` differs from `Original()` **and** the caller didn't change `statusChangedAt` itself. That covers `SetStatus`, `Merge`, `MoveOnRoadmap`, a superuser's record-API edit and Phase 4's MCP. `RecomputeTrending` writes through `DB().Update` (no hooks); `recount` uses `app.Save`, so the hook runs but sees no status change. Neither stamps.
- **Clients can't write it.** The `requests` UpdateRule is a deny-list: append `&& @request.body.statusChangedAt:isset = false`, and the create hook always sets it to now (ignoring any sent value). Test both.
- **Index `activity`.** It has none today. Add `idx_activity_request_created (request, created)` in `ensureActivity`; the backfill, `previousStatusTime` and the existing `UndoComplete` lookup all search by request.
- **Undo restores the old time.** `UndoComplete` deletes the completion's activity row, then sets `statusChangedAt` to `previousStatusTime`: the `created` of the latest remaining `status_changed` or `merged_in` row, else the request's `created`. Because it sets the field explicitly, the stamp leaves it alone.
- **Backfill** as its own last step of `schema.Ensure` (after `ensureActivity`: inside `ensureRequests` a fresh install has no `activity` table yet), idempotent, every boot: one `UPDATE requests SET statusChangedAt = COALESCE((SELECT MAX(created) FROM activity WHERE request = requests.id AND kind IN ('status_changed','merged_in')), created) WHERE statusChangedAt = '' OR statusChangedAt IS NULL`. Both columns use PocketBase's `2006-01-02 15:04:05.000Z` text format, so plain comparisons and `MAX` sort correctly.
- **`testutil.Request` bypasses hooks**: make it set `statusChangedAt` (to `created`, or a value a test passes) so service tests see realistic rows.

**Roadmap reads**
- `GET /api/lort/roadmap` → `Roadmap{Planned, Progress, Completed []Item; Shipped int}`. Planned and In progress sort `upvoteCount DESC, created DESC` (the canvas order); Completed holds `statusChangedAt >= now − 30 days`, sorted by the new `shipped` order (`statusChangedAt DESC, created DESC`). `Shipped` counts every completed request the caller can see. Each column is capped at 200 items (`roadmapMax`); counts in the UI are the array lengths. A board with more than 200 planned items is out of scope, so say so in a comment.
- **Visibility.** Public view: `visible` requests on public boards, not merged, **without** the author's own-hidden exception the feed has (call `filter` with a nil viewer, then `items` with the real viewer so the read-only stickers still show "voted"). Team view (superuser auth): every board and hidden requests, not merged; cards carry the existing `Visible` flag for a "Hidden" pill.
- **Roadmap off.** When `roadmapPublic` is false, both GET endpoints answer 404 `There's no public roadmap yet.` to anyone without superuser auth. That includes an admin browsing `/roadmap` as their team profile (`pb`, a `users` token): the public page behaves the same for everyone. The page also reads `config.roadmapPublic` from the brand header and doesn't fetch when it's off.
- `GET /api/lort/roadmap/shipped?page=N` → `Page` of completed items, 20 per page, `shipped` order, same visibility and off rule. It reuses `filter` + `order` + `items`; don't fork the list code.
- Both are reusable by Phase 4's `get_roadmap` MCP tool: keep them on `requests.Service`, with no HTTP types.
- **The 30-day cutoff is bound as `types.DateTime` (`.String()`)**, PocketBase's stored text format. An RFC3339 string (`…T…`) sorts after the stored `… ` and puts boundary-day items on the wrong side. Test 29d23h and 30d1h.
- **No bodies on the roadmap.** Give `items` an option to blank `Body`; the cards never show it and every viewer refetches the whole roadmap on each realtime change.
- **`team` comes only from `e.HasSuperuserAuth()`**, never a query parameter or the profile's `isAdmin`. API test: a `users` token with `isAdmin=true` plus `?team=true` still gets the public view.
- **Responses differ by caller:** both GETs set `Cache-Control: private, no-store` and `Vary: Authorization`.
- **One off-guard:** write the roadmap-off check once in `api.go` as a small helper (`publicFeature(e, on bool, msg string) error`) that 2B's changelog reuses.

**Moves**
- **Any roadmap column to any other** (the owner's choice). `status.RoadmapMove(from, to)` accepts `from` and `to` both in `{planned, progress, completed}` and different; anything else is an error. The triage bar and the status chip keep their Phase 1 actions; only the roadmap board uses this move.
- **One status-change core (owner's call).** `SetStatus` and `MoveOnRoadmap` are thin wrappers over one private `changeStatus(id, actor, decide func(r *core.Record) (to status.Status, err error)) (Change, error)`. It does the find, the transaction, the save (Accept's approval side effect stays inside `SetStatus`'s `decide`), the `status_changed` row and the `Change`. Phases 3 and 4 add completion emails, webhooks and MCP logging there once. The triage table (`status.Next`) and `status.RoadmapMove` are the two `decide` rules. Phase 1's `SetStatus` tests must pass unchanged.
- `MoveOnRoadmap(id, from, to, actor) (Change, error)` in one transaction: find and read the current status. Refuse with `ErrNotOnRoadmap` ("That request isn't on the roadmap any more.", 400) when it left the roadmap. Refuse with `ErrMoved` ("Someone moved that card meanwhile.", 409) when it isn't `from`: the client sends the column it saw, so a stale board can't silently undo a teammate's Complete. If `to` equals the current status, return the unchanged `Change` with no activity row (check this before `RoadmapMove`). Otherwise save and write one `status_changed` row. Add both errors to `fail`.
- **A drop into Completed behaves like Complete:** the client shows the 60-second Undo toast and Undo calls the existing `POST /requests/{id}/undo`, which restores whichever status the activity row says it came from (Planned works too). Phase 3 will queue the shipped emails on both completion paths, so keep the move in `requests.Service`, next to `SetStatus`.
- **Create into a column.** The request create hook accepts `roadmapStatus` (`planned` or `progress`) from team profiles only: a non-team sender gets 403 `Only the team can put a request on the roadmap.`, any other value 400 `Pick Planned or In progress.`. A non-string value is a 400 too (don't use the `, _ :=` pattern that silently drops it). Set the status after the hook's `pending` default, before `e.Next()`. `AfterCreate` then writes `created`, followed by a `status_changed` row `pending → <status>`, so the timeline shows it joined the roadmap. That row's actor is the team member (`e.Auth`), not the `onBehalf` person who becomes the author. Everything stays in the existing transaction, and `onBehalf` and `internal` still work alongside it.
- **Same-millisecond timeline rows.** Both rows usually share `created`, and `buildTimeline` sorts newest first with a stable sort, so "posted this" would show above "Pending → Planned". Break ties by reverse input index in `buildTimeline` (the server already returns activity oldest first).

**Web data**
- **Query keys start with `"requests"`**: `keys.roadmap(scope) = ["requests", "roadmap", scope]`, `keys.shipped = ["requests", "shipped"]`, so the triage, merge and vote invalidations already refresh the roadmap. The catch: `patchRequest`, `voteSnapshot` and `restoreVotes` walk every `["requests"]` cache and only know the paged-list, single-page and array shapes. Today a cached `Roadmap` makes `patchCached` treat it as one request and `voteSnapshot` throw on `data.items`. Don't add a fourth ternary to each function: put the shapes behind two helpers, `itemsOf(data)` and `mapItems(data, fn)`, add the `Roadmap` branch there once, and have unknown shapes give `[]` or come back unchanged. Unit-test all three callers against a `Roadmap` value.
- `agoText(iso, now)`: `relativeTime` under 7 days, then "last week" (7–13 days), "N weeks ago" (14–29), "last month" (30–59), "N months ago" (to 11), "over a year ago". `whenText(item, column)`: `Planned <ago>`, `Started <ago>`, `Shipped <shortDate>` (keep `shortDate`'s padded day, as everywhere else in the app).
- `lib/roadmap.ts` holds the column table (label, blurb, verb, drop hint, empty copy: see Copy below) so the public page, the dashboard and the tests share one source.

**Dashboard board (dnd-kit)**
- Use `useDraggable` cards and `useDroppable` columns (no `@dnd-kit/sortable`: there is no manual order inside a column). Collision: `pointerWithin`, falling back to `rectIntersection`. A `DragOverlay` renders the floating card; the source slot shows the canvas's 84px dashed placeholder (`border-2 border-dashed border-dot-empty`). The column under the card gets `bg-surface-2` + an inset 2px `primary-text` ring and its drop hint at the bottom; `dropAnimation={null}` under reduced motion.
- **Sensors:** `MouseSensor` (`distance: 4`, so a click still opens the request), `TouchSensor` (`delay: 250, tolerance: 5`, so phones can still scroll; `PointerSensor` would need `touch-action: none`), and `KeyboardSensor` with `keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] }` and the coordinate getter below. Enter on a card (not dragging) opens `/dashboard/requests/<id>`; the card is one tab stop, `role="button"`, `aria-roledescription="draggable card"`, named by its title and described by "Press Space to move it, Enter to open it."
- **Keyboard moves jump between columns.** The default getter moves the overlay 25px per arrow press, which is useless across 300px columns. Sketch:
  ```ts
  // keyboard.ts: Left/Right (and Up/Down) go to the previous/next column's top-left corner.
  coordinateGetter = (event, { context: { droppableRects, over, active } }) => {
    const order = ["planned", "progress", "completed"]
    const from = order.indexOf(String(over?.id ?? active?.data.current?.column))
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.code]
    if (!step) return undefined
    event.preventDefault()
    const rect = droppableRects.get(order[Math.min(2, Math.max(0, from + step))])
    return rect ? { x: rect.left + 16, y: rect.top + 16 } : undefined
  }
  ```
- **Announcements** (DndContext `accessibility`): instructions "To move a card, press Space. Use the arrow keys to pick a column, Space to drop it there, or Escape to cancel."; picked up "Picked up <title>. It's in <Column>."; over "<title> is over <Column>."; dropped "Moved <title> to <Column>." (or "<title> stays in <Column>." on the same column); cancelled "Cancelled. <title> stays in <Column>.". The e2e keyboard test waits on these, like the Phase 1 board reorder.
- **Freeze while dragging.** Realtime invalidations keep arriving (`useLiveRefresh` on `requests`); a refetch that reorders or removes the dragged card mid-drag breaks dnd-kit. Render columns from a snapshot taken at drag start until the drop settles.
- **Optimistic moves as an overlay, not a cache write.** `moveCard(roadmap, id, to, now)` (pure) moves the item into the target column at its sorted place, with `status = to` and `statusChangedAt = now`. The board renders the fetched roadmap with every pending move reapplied through `moveCard`. Pending moves are a map keyed by request id, held with the mutations (`mutationKey: ["roadmap-move"]`).
  - A refetch during a move, or a second card's move, can't snap a card back.
  - On error, drop only that card's entry and toast `Couldn't move “<title>”. <errorMessage>`. On a 409, also refetch.
  - Invalidate `["requests"]` and `keys.stats` only when the last pending move settles (`qc.isMutating({ mutationKey: ["roadmap-move"] }) === 1` in `onSettled`).
  - One move per card is in flight at a time. A pending card can't be lifted (`useDraggable({ disabled })`) and shows `aria-busy` at reduced opacity.
- **No fly-back on drop.** Swap the frozen view for the moved one synchronously in `onDragEnd`, before any `await`. Use `dropAnimation={null}` for cross-column drops (dnd-kit's default animates to the old slot).
- **After a drop:** the moved card gets the `primary-soft` tint that fades (as realtime arrivals do) and `scrollIntoView({ block: "nearest" })`. After a keyboard drop, focus returns to the moved card. A card created with "+" gets the same treatment.
- **Keyboard drops on a collapsed strip.** Keyboard drags have no pointer, so `pointerWithin` finds nothing and `rectIntersection` picks the wider neighbour over the narrow strip. The coordinate getter records the column it moved to (a ref), and the collision detection returns that column for keyboard drags.
- **Undo toasts:** one per request (sonner `id` = request id), dismissed when that card moves again, so a stale toast can't undo a later move.
- **Touch:** cards are `select-none [-webkit-touch-callout:none]` with no `<a>` inside (Enter/click navigate), and the avatar image is `draggable={false}`, so a long press lifts instead of selecting.
- **File split:** `roadmap-board.tsx` is layout plus DndContext wiring only. The overlay and the freeze live in `use-roadmap-move.ts`, collapse state in `use-collapsed-columns.ts`, and announcements are built in `keyboard.ts` from `ROADMAP_COLUMNS`.
- **Toasts:** to Planned or In progress, `Moved to <Column>`; to Completed, the Undo toast `Marked “<title>” as completed` for 60 s. Extract the completion toast from `useTriage` into one exported helper both use, so Phase 3's "· N people will be notified" lands in one place. Undo answers `Moved back to <Status>` (existing).
- **Collapsible columns.** Each column header has "Collapse <Column>" (Tabler `arrows-minimize`); a collapsed column is a full-height vertical strip button (`writing-mode: vertical-rl` via Tailwind's `[writing-mode:vertical-rl]`), labelled "Planned, 4 requests. Expand" / "In progress, 1 request. Expand" / "Completed, 6 in the last 30 days. Expand". A collapsed strip is still a drop target. It's remembered per browser in `localStorage` key `lort_roadmap_collapsed` (an array of statuses), with every read and write in try/catch. Default: all expanded. Read it with `useSyncExternalStore`:
  - The snapshot is the raw string, parsed with `useMemo`, because an array snapshot loops forever (the trap `lib/auth.ts` documents).
  - Writes notify same-tab subscribers, since `storage` events only fire in other tabs.
  - The server snapshot is `"[]"`, so there's no hydration mismatch.
- **"+" buttons** on Planned and In progress ("Add a planned request", "Add an in-progress request") open the existing `SuggestDialog` in team mode with `roadmapStatus`; it adds the line "It goes straight into Planned." / "…into In progress." under the title, and on success stays on the roadmap, toasts `Added to the roadmap` and invalidates. No "+" on Completed.
- **Dense page rail.** Spec 15.2: the roadmap opens with the sidebar as the 76px rail. Add a `persist` prop (default `true`) to `SidebarProvider` in `components/ui/sidebar.tsx` that skips the cookie write; `DashboardShell` controls `open` with two pieces of state:
  - A remembered one, seeded from the cookie's `defaultOpen` and updated by toggles on normal pages.
  - A per-visit one for dense pages, which resets to closed when the pathname changes. Use the "store the previous pathname in state" pattern during render, not an effect.

  On `/dashboard/roadmap` it passes the per-visit value with `persist={false}`. Don't key the provider on the path: remounting reuses the stale cookie value and rebuilds the whole dashboard on every navigation.
- **Phones (< 768px):** columns stack; the collapsed strip becomes a full-width row button with the same label. Each card also gets a "Move to…" menu (shadcn `DropdownMenu`, trigger an icon button `Move <title>`, items for the other two columns). It's phones only: hidden from `md` up (`md:hidden`), so the desktop card stays as drawn (the owner's call). It goes through the same overlay, API call and toasts as a drop, and the trigger stops pointer propagation so it never starts a drag.

**Public pages**
- `/roadmap` and `/roadmap/shipped` live in `app/(board)` so they get the shell, the footer and the "Get your own board" card. `boardNav(config)` returns Feedback, plus Roadmap when `config.roadmapPublic` (Changelog joins in 2B). `isCurrent` already handles prefixes.
- Items use the read-only compact `VoteSticker` (`size="sm" readOnly`, showing the visitor's vote), a title linking to `/feedback/<id>`, a board pill and `whenText`. Columns are `bg-ground-sunken` cards with a status icon + ink label + count pill and the blurb; three columns from `md`, stacked below. "View all N shipped" (Tabler `arrow-right` icon, not a glyph) shows only when `Shipped` > the Completed column's length.
- Both pages subscribe with `useLiveRefresh(pb, "requests", [keys.roadmap("board")])` (or `keys.shipped`), like the feed. `/roadmap/shipped` uses `useInfiniteQuery` and the existing `LoadMore`.
- **Error and off states.** A 404 from either GET renders the off message: the team turned the roadmap off while the page was open. Any other failure renders `The roadmap didn't load.` with a secondary `Try again` button (`refetch`) instead of the empty-column copy. The dashboard board uses the same error state.

**Copy** (exact)
- Public headline `What's coming to <App>?`, lede `Everything the team has committed to, what's being built right now, and what just shipped.`
- Blurbs: `Committed and up next.`, `Being built right now.`, `Shipped in the last 30 days.` Public empty columns: `Nothing planned yet. The ideas with the most dots get here first.`, `Nothing being built right now.`, `Nothing shipped in the last 30 days.`
- Off: title `No public roadmap yet`, body `The team hasn't shared its plans here. You can still suggest ideas and vote on the board.`, secondary button `Go to the board` → `/feedback`.
- Shipped page: back link `Roadmap`, headline `Everything <App> has shipped`, lede `Newest first. Thanks to everyone who stuck a dot on these.`, empty `Nothing has shipped yet. It's coming.`
- Dashboard: title `Roadmap`, lede `Drag a card to change its status. Planned and later show on the public roadmap.`; with the public roadmap off the second sentence is `The public roadmap is off. Turn it on in Settings.` (link to `/dashboard/settings#roadmap`). Drop hints: `Drop to plan it`, `Drop to start working on it`, `Drop to mark it completed`. Dashboard empty column: `Nothing here yet.`
- Settings → Roadmap: switch `Show the roadmap publicly`, description `People can see what's planned, in progress and shipped at /roadmap.`; toasts `The roadmap is public.` / `The roadmap is hidden from the board.`

## Tasks

### Task 1: When a request entered its status
**Files:** `server/internal/schema/schema.go`, `server/internal/requests/statustime.go` (+`statustime_test.go`), `server/internal/requests/service.go` (UndoComplete), `server/internal/requests/list.go` (Item, order), `server/internal/hooks/hooks.go` (register), `server/internal/testutil/testutil.go`, `server/internal/schema/schema_test.go`
**Interfaces:**
- Produces: field `requests.statusChangedAt` (DateField); `requests.BindStatusTime(app core.App)`; `Item.StatusChangedAt time.Time \`json:"statusChangedAt"\``; sort name `"shipped"` in `order`.

**Build:**
- Field, index and backfill as in Key Decisions; the stamp hook registered from `hooks.Register` (model-level hooks).
- `UndoComplete` sets `statusChangedAt` from `previousStatusTime` after deleting the completion row.

**Tests (behaviours):**
- A new request (record API and direct save) gets `statusChangedAt ≈ now`.
- `SetStatus` and `Merge` move it to now; editing the title or a vote recount leaves it alone.
- Complete then undo: status and `statusChangedAt` are back to their values before the completion (fake `Now`).
- Backfill: a row with an empty field gets its latest status activity's time, or `created` without one; a second `Ensure` changes nothing; a fresh empty database boots.
- An author's record-API update sending `statusChangedAt` is refused; a create sending it gets now instead.
- `order("shipped")` sorts by `statusChangedAt` descending.

**Done when:** `cd server && go test -race ./...` passes, `go vet ./...` clean.

- [x] Task 1 complete

### Task 2: Roadmap reads, moves and create-into-column
**Files:** `server/internal/status/status.go` (+test), `server/internal/requests/roadmap.go` (+`roadmap_test.go`), `server/internal/hooks/hooks.go` (+test), `server/internal/api/api.go` (+test)
**Interfaces:**
- Consumes: Task 1's field, `Item.StatusChangedAt`, `order("shipped")`.
- Produces:
  - `status.RoadmapMove(from, to Status) error`
  - `type Roadmap struct { Planned, Progress, Completed []Item; Shipped int }` (JSON `planned`, `progress`, `completed`, `shipped`)
  - `(*Service).Roadmap(viewer *core.Record, team bool) (Roadmap, error)`
  - `(*Service).Shipped(page int, viewer *core.Record, team bool) (Page, error)`
  - `(*Service).MoveOnRoadmap(id string, from, to status.Status, actor *core.Record) (Change, error)`; `ErrNotOnRoadmap` (400), `ErrMoved` (409)
  - `GET /api/lort/roadmap`, `GET /api/lort/roadmap/shipped?page=N` (public, off rule), `POST /api/lort/requests/{id}/roadmap` body `{"from":<status>,"to":"planned"|"progress"|"completed"}` → `Change` (team group).
  - Request create body field `roadmapStatus` (team only).

**Build:** as in Key Decisions (Roadmap reads, Moves). `/roadmap/shipped` is its own route, not a path value under `/roadmap`. The off check reads `roadmapPublic` through the existing `site.Cache`, not a fresh settings query per request.

**Tests (behaviours):**
- `RoadmapMove`: all six cross-column moves allowed; same column, any non-roadmap `from` or `to` refused.
- Public `Roadmap`: excludes hidden, private-board, merged and the viewer's own hidden requests; includes the viewer's `voted`; Planned/In progress by votes; Completed only within 30 days, newest first; `Shipped` counts older completions too.
- Team `Roadmap` includes hidden and private-board requests.
- `Shipped` pages by 20 in shipped order.
- `MoveOnRoadmap`: Planned → Completed writes one `status_changed` row and stamps the time; undo returns it to Planned; a request triaged to Reviewing meanwhile answers `ErrNotOnRoadmap`; a stale `from` (it was completed meanwhile) answers `ErrMoved` and changes nothing; same column writes nothing.
- Completed window: a request shipped 29d23h ago is in, 30d1h ago is out.
- API: with `roadmapPublic=false` anonymous and `users` tokens get 404 on both GETs, a superuser gets 200; the move route needs superuser auth (401/403 otherwise) and rejects `{"to":"reviewing"}` with 400; both GETs send `Cache-Control: private, no-store`; a `users` token with `isAdmin` and `?team=true` gets the public view; items carry an empty `body`.
- Create hook: team + `roadmapStatus: "progress"` saves status `progress` with `created` and `pending → progress` rows; a board user sending it gets 403; `"closed"` or a number gets 400 and saves nothing; with `onBehalf` the `status_changed` row's actor is the team member, the author is the other person.

**Done when:** `cd server && go test -race ./...` passes; `curl -s http://127.0.0.1:4052/api/lort/roadmap` against a running dev server returns the four keys.

- [x] Task 2 complete

### Task 3: Web data layer
**Files:** `web/lib/api.ts`, `web/lib/query.ts` (+test), `web/lib/time.ts` (+test), `web/lib/roadmap.ts` (+`roadmap.test.ts`)
**Interfaces:**
- Consumes: Task 2's endpoints and JSON.
- Produces:
  - `type RoadmapStatus = "planned" | "progress" | "completed"`; `interface Roadmap { planned: RequestItem[]; progress: RequestItem[]; completed: RequestItem[]; shipped: number }`; `RequestItem.statusChangedAt: string`
  - `roadmap(c): Promise<Roadmap>`, `shipped(c, page): Promise<Page<RequestItem>>`, `moveOnRoadmap(c, id, from, to): Promise<StatusChange>`
  - `keys.roadmap(scope: "board" | "team")`, `keys.shipped`
  - `agoText(iso, now?)`, `whenText(item, column, now?)`, `ROADMAP_COLUMNS: { status, label, blurb, emptyPublic, dropHint, verb }[]`, `moveCard(r: Roadmap, id, to, now): Roadmap`, `readCollapsed(): RoadmapStatus[]`, `writeCollapsed(s)`.

**Build:** as in Key Decisions (Web data). `moveCard` keeps each column's sort rule and returns a new object (never mutates the cache).

**Tests (behaviours):**
- `patchRequest`, `voteSnapshot`, `restoreVotes` patch and restore a request inside a cached `Roadmap`, and leave other requests alone; an unknown shape is left unchanged.
- `buildTimeline` with a `created` and a `status_changed` row of the same time shows the status change first (newest first).
- `agoText` boundaries: 6 days → "6 days ago", 7 → "last week", 14 → "2 weeks ago", 30 → "last month", 65 → "2 months ago", 400 → "over a year ago".
- `whenText` gives `Planned …`, `Started …`, `Shipped 09 Oct`.
- `moveCard` places a card by votes in Planned/In progress and at the top of Completed, and removes it from its old column.
- `readCollapsed` returns `[]` when `localStorage` throws or holds junk.

**Done when:** `cd web && pnpm typecheck && pnpm lint && pnpm test` pass.

- [x] Task 3 complete

### Task 4: Public roadmap, shipped list, nav and Settings → Roadmap
**Files:** `web/components/board/links.ts`, `board-shell.tsx`, `web/app/(board)/roadmap/page.tsx`, `web/app/(board)/roadmap/shipped/page.tsx`, `web/components/board/roadmap/*`, `web/components/dashboard/settings/roadmap-section.tsx`, `settings-page.tsx`
**Interfaces:**
- Consumes: Task 3's API, keys and `lib/roadmap.ts`; `useSettings().save`; `SettingsSection`.
- Produces: `boardNav(config: SiteConfig): { href: string; label: string }[]`.

**Build:**
- Pages, items, skeletons (`aria-busy="true"`, shell and headings real, bones for column cards and items, as `S-Roadmap`'s pattern), the off message, live refresh: as in Key Decisions (Public pages) and Copy.
- Settings: a Roadmap section between Tags and Team (TOC "Your board": Branding, Boards, Tags, Roadmap, Team) with the one switch; saving calls `router.refresh()` through `save`, so the nav pill appears or disappears without a reload.

**Tests (behaviours):**
- `boardNav` includes Roadmap only when `roadmapPublic`.
- The public item renders the read-only sticker with the visitor's vote, the board pill and the `whenText` line; the title links to `/feedback/<id>`.
- "View all N shipped" shows only when `shipped` exceeds the Completed column.
- With `roadmapPublic` false the page renders the off message and makes no request.

**Done when:** unit tests pass; `/roadmap` and `/roadmap/shipped` render against the dev server in both themes.

- [x] Task 4 complete

### Task 5: Dashboard roadmap
**Files:** `web/app/dashboard/(app)/roadmap/page.tsx`, `web/components/dashboard/roadmap/*`, `web/components/dashboard/use-triage.ts`, `web/components/board/suggest-dialog.tsx` (+test), `web/components/dashboard/app-sidebar.tsx`, `dashboard-shell.tsx`, `web/components/ui/sidebar.tsx`
**Interfaces:**
- Consumes: Task 3's API and helpers; `UNDO_SECONDS`, `undoToast`, `undoComplete`; `SuggestDialog`.
- Produces: `completionToast({ title?, change, onUndo })` exported from `use-triage.ts` (message `Marked as completed` without a title, `Marked “<title>” as completed` with one); `SuggestDialogProps.roadmapStatus?: "planned" | "progress"`; `newRequestPayload` sends `roadmapStatus` when set; `SidebarProvider` prop `persist?: boolean`.

**Build:**
- Sidebar: Roadmap (`IconLayoutKanban`) after Requests; the dense-page rail.
- Header, three columns (status icon + label, count pill, "+" on the first two, collapse), cards (read-only compact sticker, title, board pill, tag pills, "Hidden" pill when not visible, author avatar), skeleton matching `S-Roadmap` (4/2/3 card bones).
- DndContext with sensors, keyboard getter, announcements, freeze, optimistic move, toasts and collapse, all as in Key Decisions (Dashboard board).
- `useLiveRefresh(pbAdmin, "requests", [keys.roadmap("team")])`.

**Tests (behaviours):**
- `completionToast` messages with and without a title; the triage bar still says "Marked as completed".
- `newRequestPayload` includes `roadmapStatus` only when given.
- Roadmap board (Testing Library, mocked API): a failed move puts only that card back and toasts `Couldn't move “<title>”…`, while a second card's pending move stays applied; a refetch during a pending move doesn't snap the card back; a pending card can't be lifted; a 404 shows the off message and a 500 shows `Try again`; a collapsed column renders its strip label and stays a drop target (`useDroppable` registered).
- The keyboard getter returns the next column's corner for ArrowRight, the first column for ArrowLeft at the edge, and `undefined` for other keys; keyboard collision returns the column the getter chose, even a collapsed strip.
- `use-collapsed-columns`: a toggle re-renders the same tab; junk in storage reads as none collapsed.

**Done when:** unit tests pass; dragging with mouse and keyboard works on the dev server.

- [x] Task 5 complete

### Task 6: End-to-end tests, full check, commit and PR
**Files:** `web/e2e/roadmap.spec.ts` (create), `web/e2e/a11y.spec.ts`, `web/e2e/settings.spec.ts`
**Build:**
- Seed with the existing helpers (`seedRequest`, `adminToken`); move seeded requests onto the roadmap through `POST /api/lort/requests/{id}/roadmap` with the admin token.
- axe on `/roadmap`, `/roadmap/shipped`, the off message and `/dashboard/roadmap`, in both themes (`expectAccessible` already waits for animations).

**Tests (behaviours):**
- Public roadmap shows seeded Planned/In progress/Completed items in the right columns with their when-lines; a hidden request doesn't appear.
- Settings switch off → nav pill gone, `/roadmap` shows the off message; on again → back.
- Mouse drag Planned → In progress → toast "Moved to In progress", the card is in In progress after a reload.
- Keyboard: focus a card, Space, ArrowRight, Space → announced "Moved … to In progress."
- Drop into Completed → Undo toast; Undo → card back in its old column, "Moved back to …".
- "+" on Planned creates a request that appears in Planned and on its timeline as moved to Planned.
- `/roadmap/shipped` lists completed requests newest-shipped first.

**Done when:** `cd server && go test -race ./... && go vet ./...`; `cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm e2e --repeat-each=2` all pass. Then one commit on `phase-2a-roadmap` and a PR. Review rounds and the docs commit follow `CLAUDE.md`.

- [x] Task 6 complete

## Manual Verification Checklist

**Shared setup:**
1. `git switch phase-2a-roadmap`
2. Terminal A: `cd web && pnpm install && pnpm build && pnpm start` (Next on `127.0.0.1:3000`).
3. Terminal B: `node web/e2e/server.mjs` (Go on `127.0.0.1:4052`, fresh database in `web/e2e/.data`, admin from `test/e2e.env`).
4. Open http://localhost:4052. Sign in at `/dashboard/login` with the admin from `test/e2e.env`. In Settings → Boards make sure there's a public board "Features" and a private board "Internal".
5. On the board, sign up as `ana@lort.test` / `password123` in a second browser profile (the "visitor").
6. As the admin create five requests with New request on `/dashboard/requests`: "Dark mode" (Features), "Offline sync" (Features), "Export to CSV" (Features), "Secret plan" (Features, Internal toggle on), "Private tidy-up" (Internal board). Move them with the triage bar: Dark mode → Accept → Add to roadmap (Planned); Offline sync → Accept → Add to roadmap → Start working (In progress); Export to CSV → … → Complete (wait out the toast); Secret plan → Planned; Private tidy-up → Planned.

#### MV-1: Public roadmap columns
- **Setup:** shared setup; visitor signed in and has voted on "Dark mode".
- **Steps:** as the visitor open http://localhost:4052/roadmap.
- **Expected:** nav shows Feedback and Roadmap (Roadmap current). Headline "What's coming to <App>?". Planned holds "Dark mode" with a voted (filled, tilted) read-only sticker and "Planned just now"; In progress holds "Offline sync" with "Started just now"; Completed holds "Export to CSV" with "Shipped <today's dd Mon>". "Secret plan" and "Private tidy-up" are absent. Clicking the sticker does nothing; clicking a title opens `/feedback/<id>`.
- **How the executor runs it:** Playwright.

#### MV-2: Roadmap ordering by votes
- **Setup:** MV-1; add "Calendar view" to Planned and give it 2 votes (visitor + a second account).
- **Steps:** reload `/roadmap`.
- **Expected:** "Calendar view" (2) sits above "Dark mode" (1) in Planned.
- **How the executor runs it:** Playwright.

#### MV-3: Shipped list
- **Setup:** MV-1; complete one more request ("Calendar view").
- **Steps:** on `/roadmap` look for "View all"; open http://localhost:4052/roadmap/shipped.
- **Expected:** with 2 completed and both in the column, no "View all" link. `/roadmap/shipped` shows "Everything <App> has shipped", "Calendar view" above "Export to CSV", and a "Roadmap" back link.
- **How the executor runs it:** Playwright.

#### MV-4: Turning the public roadmap off
- **Steps:** Settings → Roadmap, switch off "Show the roadmap publicly". As the visitor reload `/feedback`, then open `/roadmap` and `/roadmap/shipped`; run `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4052/api/lort/roadmap`.
- **Expected:** toast "The roadmap is hidden from the board."; no Roadmap pill; both pages show "No public roadmap yet" with "Go to the board"; curl prints `404`. `/dashboard/roadmap` still shows every card and its lede says "The public roadmap is off. Turn it on in Settings." Switching it back on restores the pill and the pages.
- **How the executor runs it:** Playwright + curl.

#### MV-5: Dashboard roadmap shows everything the team sees
- **Steps:** as the admin open http://localhost:4052/dashboard/roadmap.
- **Expected:** sidebar opens as the 76px rail with Roadmap current; Planned shows "Dark mode", "Secret plan" (with a "Hidden" pill) and "Private tidy-up"; each card shows a read-only sticker, title, board pill, tags and the author avatar. Opening Requests afterwards shows the sidebar in its remembered state.
- **How the executor runs it:** Playwright.

#### MV-6: Mouse drag between columns
- **Steps:** drag "Dark mode" from Planned onto In progress; reload.
- **Expected:** while dragging, the card floats (no tilt), a dashed slot stays in Planned, In progress gets the ring and "Drop to start working on it". After the drop: toast "Moved to In progress"; the card stays there after reload; its request page timeline shows Planned → In progress.
- **How the executor runs it:** Playwright.

#### MV-7: Any column to any column
- **Steps:** drag "Secret plan" from Planned straight to Completed; then drag "Export to CSV" from Completed to Planned.
- **Expected:** both moves succeed (Undo toast for the first). After both, "Export to CSV" is in Planned with "Planned just now" on the public roadmap.
- **How the executor runs it:** Playwright.

#### MV-8: Completed drop and Undo
- **Steps:** drag "Offline sync" into Completed; click Undo within 60 s.
- **Expected:** toast `Marked “Offline sync” as completed` with a 60-second countdown bar; after Undo, "Moved back to In progress", the card is back in In progress and the public roadmap shows "Started …" with its original time (not "just now" if it started earlier).
- **How the executor runs it:** Playwright (use a request started at least 2 minutes earlier to see the time restored).

#### MV-9: Keyboard moves
- **Steps:** Tab to the "Dark mode" card; press Space, ArrowRight, Space. Then Tab to another card, Space, ArrowLeft, Escape. Then Enter on a card.
- **Expected:** a screen reader live region says "Picked up Dark mode. It's in In progress.", "Dark mode is over Completed.", then the drop announcement and the Undo toast; the Escape case says "Cancelled. … stays in …" and nothing changes; Enter opens `/dashboard/requests/<id>`. The focus ring is visible throughout.
- **How the executor runs it:** Playwright.

#### MV-10: Conflicting triage
- **Setup:** two admin tabs on `/dashboard/roadmap`.
- **Steps:** in tab 1 open "Dark mode" and Re-review it (Reviewing). In tab 2, before it refreshes, drag "Dark mode" to Planned (block realtime by doing it within the 300 ms debounce, or go offline for the SSE via devtools and back online before dropping).
- **Expected:** toast "That request isn't on the roadmap any more."; the card disappears from the board after the refetch; no status change is made.
- **How the executor runs it:** Playwright (`page.route` to delay the realtime refetch), or `[user-only]` if the timing can't be forced.

#### MV-10b: A stale board can't undo a teammate's Complete
- **Setup:** two admin tabs on `/dashboard/roadmap`, realtime held back in tab 2 as in MV-10.
- **Steps:** tab 1 drags "Offline sync" to Completed and lets the toast run out; tab 2 (still showing it in In progress) drags it to Planned.
- **Expected:** tab 2 toasts `Couldn't move “Offline sync”. Someone moved that card meanwhile.`, refetches, and shows it in Completed; the request stays Completed.
- **How the executor runs it:** Playwright (`page.route` delay), or `[user-only]` if the timing can't be forced.

#### MV-10c: Overlapping moves and a failed load
- **Steps:** drag card A to In progress and, within a second, card B to Completed, with `page.route` delaying the move POSTs by 2 s. Then make `/api/lort/roadmap` answer 500 and reload.
- **Expected:** neither card jumps back while its move is pending; both end up where they were dropped. On the 500 the board shows `The roadmap didn't load.` with `Try again`, and Try again (after removing the route) loads it.
- **How the executor runs it:** Playwright.

#### MV-11: Create straight into a column
- **Steps:** click "Add a planned request", enter title "Widgets", submit.
- **Expected:** the dialog says "It goes straight into Planned."; toast "Added to the roadmap"; "Widgets" appears in Planned; its request page timeline shows "posted this" then Pending → Planned; the author has one vote.
- **How the executor runs it:** Playwright.

#### MV-12: Collapse and remember
- **Steps:** collapse Completed; reload; drag a card onto the collapsed strip; expand it.
- **Expected:** the strip reads "Completed, N in the last 30 days. Expand" (screen reader name too) and survives the reload; the drop works (Undo toast); expanding shows the card.
- **How the executor runs it:** Playwright.

#### MV-13: Realtime
- **Setup:** visitor on `/roadmap`, admin on `/dashboard/roadmap`.
- **Steps:** admin drags a card from Planned to In progress.
- **Expected:** within a second or two the visitor's page shows it in In progress without a reload.
- **How the executor runs it:** Playwright with two contexts.

#### MV-14: Phones
- **Steps:** at 375×812 open `/roadmap` and `/dashboard/roadmap`; long-press a dashboard card and drag it to another column; scroll the page by swiping.
- **Expected:** columns stack with no horizontal page scroll; swiping scrolls; a long press lifts the card. Each card shows a "Move" button; Move → In progress moves it with the same toast. At 1280px wide the Move button isn't there. Touch feel on a real phone is `[user-only]` (needs real hardware); the layout is Playwright.

#### MV-15: Skeletons, themes and accessibility
- **Steps:** throttle the network (Playwright `page.route` delay on `/api/lort/roadmap`) and open `/roadmap` and `/dashboard/roadmap`; run axe on both and on the off message, in light and dark.
- **Expected:** shells and headings render for real with pulsing bones (`aria-busy="true"`), static under reduced motion; axe reports no violations.
- **How the executor runs it:** Playwright + axe.

#### MV-16: Phase 1 regressions
- **Steps:** vote on `/feedback` for a request that's on the roadmap, then open `/roadmap`; triage a request with the triage bar's Complete and Undo; reorder boards in Settings.
- **Expected:** the roadmap shows the new vote count (no stale or broken cache); the triage bar toast still reads "Marked as completed"; board reordering works.
- **How the executor runs it:** Playwright.

## Out of Scope

- The changelog (2B): `/changelog`, `/changelog/<slug>`, the editor, scheduling, the Changelog nav pill and sidebar item.
- Manual ordering inside a column, swimlanes, roadmap filters, ETA fields.
- Emails and webhooks on completion (Phases 3 and 4); the `get_roadmap` MCP tool (Phase 4).
- Changing the triage bar's or status chip's actions to match the roadmap's free moves.

## Implementation Notes
Deviations and surprises (the interfaces in the plan are otherwise as built):
- **`go test -race` was not run**: this machine has no C compiler (`-race` needs cgo). Plain `go test ./...`, `go vet` and a CRLF-tolerant gofmt check are clean. CI's gofmt/race checks still apply.
- **Same-column / stale order in `MoveOnRoadmap`**: it checks "not on the roadmap", then "`to` is where it already is" (no-op, no activity row), then "`from` is stale" (`ErrMoved`). The plan listed `ErrMoved` before the no-op; a stale board asking for a column the card is already in now succeeds quietly instead of showing "Someone moved that card meanwhile."
- **Extra server pieces**: `Service.LogJoinedRoadmap` (the `pending → <status>` row for create-into-column), `Query.StatusSince` (the 30-day cutoff, never read from the URL), and `activity()` now sorts `created,@rowid` so same-millisecond rows keep their order for `buildTimeline`.
- **Optimistic moves are React state, not mutation state.** `useRoadmapMove` keeps the pending-move map in `useState` (still with `mutationKey: ["roadmap-move"]` for the `isMutating` count). Deriving it from `useMutationState` updates a microtask late, which showed the card in its old column for a frame after a drop. Settled moves stay applied until the refetch after the last move lands.
- **Toast ids**: the plan said sonner `id` = request id. Dismissing an id and reusing it left the new toast stuck in "removed" (the Undo button became unclickable), so each move gets a fresh id (`<requestId>-<n>`) and the previous one for that request is dismissed.
- **Card name**: `aria-label` on the draggable card failed axe `label-content-name-mismatch` (axe counts `aria-hidden` text as visible). The card is named by its content instead (the title; sticker and pills are `aria-hidden`) and the rest is an `sr-only` description linked by `aria-describedby`. Roadmap votes read "N votes, including yours" for a read-only voted sticker (`VoteSticker`).
- **Drop hint colour**: `text-primary-text` on `surface-2` measured 4.11/4.34:1 (`primary-text` is only guaranteed on ground and surface), so the hint is ink; the ring stays `primary-text`.
- **Announcements**: `onDragOver` is silent while the card is still over the column it started in, otherwise it replaced "Picked up …" at once.
- **Keyboard navigation** is built by `createKeyboardNavigation()` (a closure holding the chosen column) because the React lint rule rejects passing a `useRef` into a factory during render.
- **Small additions**: `isNotFound` in `lib/errors.ts`; `itemsOf`/`mapItems` exported from `lib/query.ts`; `readCollapsedRaw`/`parseCollapsed`/`COLLAPSED_KEY` in `lib/roadmap.ts`; `SuggestDialog` also takes `onCreated`; `undoToast` takes an `id`; the sidebar item badge is now Requests-only.
- Tests that were not in the plan: board-level e2e for ordering by votes, overlapping moves, a failed load, skeletons, the phone menu, timeline after a drag, any-column-to-any-column, a stale board and a triaged-away card.

Changes from the two review rounds:
- **Overlay reconciliation**: moves carry the nth acceptance number, and a refetch drops only moves accepted before it started; a move accepted mid-refetch queues another refetch (`reconcile` in `use-roadmap-move.ts`). The plan's "invalidate when `isMutating === 1`" skipped the refresh for a second move and let the older answer clear its overlay.
- **Undo restores the exact time**: a status-change activity row records `statusSince` (when the request entered `from`), because superuser record-API edits stamp the time without a timeline entry. Older rows fall back to the timeline. The stamp hook is told to keep the restored time through `keepStatusTime(record)`, keyed by the record instance Undo saves (not the request id), so an overlapping save of the same request is still stamped.
- **Focus after a keyboard drop into a collapsed column** goes to that column's Expand strip, again for every drop (the effect depends on the `fresh` object).

For the next stage: 2B's changelog can reuse `publicFeature` (api.go), the nav (`boardNav` in `components/board/links.ts`), `DENSE_PAGES` in `dashboard-shell.tsx` if the editor needs the rail, and `completionToast` for anything that offers an Undo. Real-hardware touch behaviour (long-press lift, swipe-to-scroll) is `[user-only]` and not verified.
