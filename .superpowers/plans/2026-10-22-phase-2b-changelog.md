# Lort Phase 2B: Changelog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. This plan gives structure and decisions, not code. You write the implementation (TDD per task). Track tasks with the checkboxes. After all tasks, run the **Manual Verification Checklist** (or hand it to the user if they asked to do it), then fill in **Implementation Notes**.

**Goal:** Ship the changelog: public `/changelog` and `/changelog/<slug>` (with Open Graph cards), the dashboard list, and the Tiptap editor with autosave, slash menu, cover, labels, slug, attached requests, preview, publish, schedule, unschedule, unpublish and delete.
**Specs:** `.superpowers/specs/2026-10-15-lort-design.md` (parent): 2.2, 3 (`changelogs`), 5.1 `/changelog` and `/changelog/<slug>`, 6 (sidebar), 6.4, 9 (scheduled publishing), 11, 13 (phase 2), 14.5, 15.1, 15.2. Canvases: `design/canvas/P-Changelog.dc.html`, `P-Changelog-Post.dc.html`, `D-Changelog.dc.html`, `D-Changelog-Editor.dc.html`. Phase 2A's plan and Implementation Notes: `.superpowers/plans/2026-10-21-phase-2a-roadmap.md`.
**Architecture:** A new Go package `server/internal/changelog` owns the `changelogs` collection's rules (slug, excerpt, read-only when live), the public and team reads, and the publish lifecycle, with a per-minute PocketBase cron for scheduled posts. Draft fields and files are written by the dashboard through PocketBase's record API as a superuser (native multipart uploads), guarded by hooks; every state change goes through `/api/lort/changelogs/*`. The web app adds the public pages under `app/(board)`, a dashboard list and a Tiptap v3 editor storing markdown, and renders markdown with `react-markdown`. Open Graph data reaches Next through a second proxy header, so Next still never calls PocketBase from the server.
**Tech Stack:** as Phase 2A (Go 1.27 + PocketBase v0.40.5; Next.js 16.4, React 19.3, shadcn `base-nova`/Base UI, Tailwind 4.3, Motion 14, TanStack Query 5, PocketBase JS SDK 0.28; Vitest 5, Playwright 1.64 + axe), plus Tiptap v3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-image`, `@tiptap/extensions`, `@tiptap/suggestion`, plus `@floating-ui/dom` for the `BubbleMenu` in `@tiptap/react/menus`), `react-markdown` + `remark-gfm`, `next/og`, and `github.com/yuin/goldmark` in Go.

This is plan 2 of Phase 2: 2A roadmap (merged), **2B changelog (this)**.

## Global Constraints

- `CLAUDE.md` frontend rules hold: shadcn components from the CLI only (`pnpm dlx shadcn@latest add calendar checkbox`, then `pnpm ui:fix`), Tailwind utilities on Lort's tokens, no hand-written component CSS, never copy `design/` code into `web/`. Base UI, not Radix: `render={…}`, not `asChild`. Merge classes only with `cn()`.
- Labels, exactly: values `new improved fixed`, shown `New`, `Improved`, `Fixed`, always in that order. New is `bg-primary-soft text-primary-text`; Improved and Fixed are `bg-surface-2 text-ink-2` (spec 15.1).
- States, exactly: `draft scheduled published`. Dashboard state dots: published = primary fill, scheduled = ink-2 fill, draft = hollow `dot-empty` ring.
- **Email is off in this phase.** No subscriber counts, no "emails N verified subscribers", no `lastEmailedAt` writes, no "Verified users get an email" sentence. Phase 3 adds the email, the 7-day rule and those lines.
- Owner's decisions (2026-10-22): scheduled posts publish from a **per-minute cron** (the durable `jobs` queue stays in Phase 3); the public **Changelog nav pill appears once at least one post is published**; republishing **keeps the first publication date**; **drafts and scheduled posts can be deleted, published ones must be unpublished first**. After the plan review: **Unpublish is a 10-second delayed action with Undo, no confirm**; **a formatting toolbar** (bold, italic, link, image alt text); **abandoned untouched drafts are deleted**; **autosave refuses stale edits** (revision precondition, 409); **passing publish errors retry for 10 minutes**; **posts more than 72 hours overdue are not auto-published**. Record all of these in the spec in the docs commit.
- WCAG 2.2 AA both themes, full keyboard operation (slash menu, publish menu, calendar, attach picker), 3px focus ring, `prefers-reduced-motion`.
- Public copy speaks for "the team"; "Lort" appears on public pages only in the footer and the optional card (the generated share card carries the owner's brand, not Lort's).
- `gofmt`, `go vet ./...`, `pnpm typecheck`, `pnpm lint`, `pnpm test` clean after every task. React 19 lint: no synchronous `setState` in effects, no ref reads during render. This machine has no C compiler: run `go test ./...` locally (CI runs `-race`).
- Branch `phase-2b-changelog`; one commit at the end, then a PR (review rounds and the docs commit follow `CLAUDE.md`).

## File Map

**Server**
- `server/internal/schema/schema.go`: `changelogs` collection, indexes, collection name constant.
- `server/internal/changelog/slug.go` (+test): `Slugify`, `ValidSlug`.
- `server/internal/changelog/excerpt.go` (+test): `Excerpt(markdown)` via goldmark.
- `server/internal/changelog/hooks.go` (+test): `Bind(app)`: record-API guards, model-level slug/excerpt/read-only/delete rules.
- `server/internal/changelog/service.go`: `Service`, `New`, the errors, the generic `Page[T]`. Split by concern like `requests` (each with its own test file):
  - `read.go`: `List`, `BySlug`, `Failed`
  - `team.go`: `TeamList`, `Create`, `Editor`
  - `lifecycle.go`: `Publish`, `Schedule`, `Unschedule`, `Unpublish`, image pruning, completing requests
  - `schedule.go`: `PublishDue`, failure handling
- `server/internal/changelog/meta.go` (+test): `PageMeta(path) string` for the proxy header.
- `server/internal/status/status.go` (+test): `Ship(from Status) error`.
- `server/internal/requests/service.go`: `Ship(id, actor)` over `changeStatus`; `ItemsByID`.
- `server/internal/site/site.go` (+test): `Config.Changelog`; cache dropped on `changelogs` changes.
- `server/internal/web/web.go` (+test): `ProxyOptions.Page`, header `X-Lort-Page`.
- `server/internal/api/changelog.go` (+`changelog_test.go`): the changelog routes, registered from `api.Register` with one call; its errors added to `fail`.
- `server/main.go`: `changelog.Bind`, the `lort_changelog` cron, a catch-up run at boot.

**Web**
- `web/lib/api.ts`, `web/lib/query.ts`, `web/lib/config.ts` (+tests): types, calls, keys, `changelog` flag.
- `web/lib/changelog.ts` (+test): label table, `stateText`, `cleanSlugInput`, `scheduleAt`, `attachedToComplete`.
- `web/lib/time.ts` (+test): `longDate`, `dateTime`.
- `web/lib/prose.ts`: `PROSE`, the one class string for rendered and edited post bodies.
- `web/components/board/links.ts` (+test): Changelog in `boardNav`.
- `web/app/(board)/changelog/page.tsx`, `web/app/(board)/changelog/[slug]/page.tsx` (with `generateMetadata`).
- `web/app/changelog-card/[slug]/route.tsx`: the generated share card; `web/app/fonts/BricolageGrotesque-ExtraBold.ttf` (OFL, already covered by the licence file there).
- `web/components/board/changelog/`: `changelog-list.tsx`, `changelog-entry.tsx`, `label-chips.tsx`, `post-view.tsx`, `shipped-list.tsx`, `markdown.tsx`, `share-button.tsx`, `post-missing.tsx`, `changelog-skeleton.tsx`, `post-skeleton.tsx`.
- `web/app/dashboard/(app)/changelog/page.tsx`, `web/app/dashboard/(app)/changelog/[id]/page.tsx`.
- `web/components/dashboard/changelog/`: `posts-page.tsx`, `posts-table.tsx`, `posts-skeleton.tsx`, `failed-banner.tsx`.
- `web/components/dashboard/changelog/editor/`: `editor-page.tsx` (layout only), `use-editor-form.ts` (+test: seed once, which refetched fields merge, read-only switch and reseed, preview data), `use-autosave.ts` (+test), `body-editor.tsx`, `slash-menu.tsx`, `cover-field.tsx`, `labels-field.tsx`, `slug-field.tsx`, `attached-requests.tsx`, `publish-menu.tsx`, `use-delayed-unpublish.ts` (+test), `format-menu.tsx`, `post-actions.tsx`, `editor-skeleton.tsx`.
- `web/components/dashboard/app-sidebar.tsx`, `dashboard-shell.tsx`: Changelog item, editor rail, failed banner.
- `web/e2e/changelog.spec.ts` (create), `web/e2e/a11y.spec.ts`, `web/e2e/helpers.ts`.

## Key Decisions & Gotchas

**Data (`changelogs`)**
- Fields: `title` (text ≤160), `slug` (text ≤80), `slugCustom` (bool), `body` (text ≤100 000, markdown), `excerpt` (text ≤240), `cover` (file, 1, 5 MB, png/jpeg/webp/gif, thumb `1200x630`), `images` (file, ≤30, 5 MB each, same types), `labels` (select, multi, `new improved fixed`), `requests` (relation → requests, multi, ≤50, no cascade), and on both file fields a `1600x0` display thumb next to the cover's `1200x630`, `state` (select, required), `publishAt`, `publishedAt`, `lastEmailedAt` (dates), `completeAttached` (bool), `author`, `scheduledBy` (relation → users, 1), `publishError` (text ≤300), `revision` (number, starts at 0), plus `created`/`updated`. The spec's table gains `slugCustom`, `excerpt`, `images`, `author`, `scheduledBy`, `publishError` (record it in the docs commit).
- Indexes: unique partial `idx_changelogs_slug (slug) WHERE slug != ''` (an untitled draft has no slug yet); `idx_changelogs_state_published (state, publishedAt)`; `idx_changelogs_state_publishAt (state, publishAt)`.
- **All five collection rules are `nil`** (superusers only). The public reads go through Go. Files are **not protected**: covers must load for crawlers and every image URL carries the 15-char record id plus PocketBase's random suffix, so a draft's files can't be guessed. The cost is that a file stays reachable by its URL after unpublishing; that's accepted, and the docs commit says so in the spec. Write an API test that an anonymous request for a published post's cover returns 200.
- **Writes split by kind.** Creating a post is `POST /api/lort/changelogs` (it sets `author` to the admin's team profile and `state=draft`). Editing a draft's `title`, `body`, `slug`, `labels`, `requests`, `completeAttached`, `publishError` (clearing only), `cover` and `images+` goes through `pbAdmin.collection("changelogs").update`. The record-API guard (`OnRecordUpdateRequest`) is an **allowlist**, so fields added in Phases 3 and 4 are closed by default. It accepts only `title`, `body`, `slug`, `labels`, `requests`, `completeAttached`, `cover`, `images`, `images+`, `images-` and `publishError`, with `publishError` only as `""`, plus the precondition key `expectedRevision` (below), which the hook consumes and never stores. Any other key gets 400 `Use Publish, Schedule or Unpublish to change that.`. A record-API create is refused (400 `Use New post to start one.`). Deletes use the record API, guarded below. `title` is trimmed and newlines become spaces on every save, in the model hook.
- **Edit conflicts (owner's decision; replaces last-save-wins).** One admin with two tabs open could otherwise overwrite the body with a stale copy, and there's no history to recover it. Ghost's Admin API answers this with a version precondition and a 409.
  - **Why `revision`, not `updated`:** the model hook bumps `revision` by 1 on every save that changes `title`, `body`, `slug`, `labels`, `requests`, `cover`, `images` or `completeAttached`. State-only saves (publish, schedule, the cron, unpublish, a failure flipping back to draft, clearing `publishError`) leave it alone. Checking `updated` instead would flag the cron's own saves as "another window".
  - **The check:** the record-API update hook compares `expectedRevision` with `Original().GetInt("revision")`. On a mismatch it answers 409 `This post changed in another window. Reload to see it.`. It runs **after** the "live" check, so a post the cron just published still answers `This post is live…`.
  - **When it's checked:** only when the key is sent. The dashboard always sends it; the PocketBase admin UI (`LORT_PB_ADMIN=1`) and Phase 4's service calls don't.
  - **The race:** the window between the check and the save is milliseconds, accepted for two tabs.
- **Hooks return `apis.NewBadRequestError(msg, data)`** (a `*router.ApiError`), never a plain error: the record API replaces plain hook errors with a generic "Failed to update record.". Slug problems carry `data.slug` so the editor shows them under the field.
- **Model-level rules** (`OnRecordCreate`/`OnRecordUpdate`/`OnRecordDelete` on `changelogs`, so the service, the cron and Phase 4's MCP obey them too):
  - While `Original()` is `published`, changing `title`, `body`, `slug`, `cover`, `images`, `labels` or `requests` is refused: `This post is live. Unpublish it to make changes.` State-only saves (unpublish) pass. Scheduled posts stay editable. **One exception:** a `requests` change that only removes ids whose request no longer exists passes. When a request is deleted, PocketBase strips its id from every relation and saves the referencing record with `SaveNoValidate` (`core/record_model.go:1639-1640`), and that save still runs `OnRecordUpdate`. Without the exception, deleting a request attached to a live post fails with "This post is live…".
  - Deleting a published post is refused: `Unpublish this post before deleting it.`
  - `excerpt` is recomputed whenever `body` changes.
  - **Slug rules** (the spec's "slug generation and stability" tests): the record-API hook sets `slugCustom=true` when the body sends a non-empty `slug`, and `slugCustom=false` (back to automatic) when it sends `""`. The model hook then: refuses any slug change once `publishedAt` is set, even after an unpublish (`The address is fixed once a post has been published.`); when not custom and never published, sets `slug = unique(Slugify(title))` on every title change (`-2`, `-3`… on collision, excluding itself); refuses a custom slug that fails `ValidSlug` (`Use lowercase letters, numbers and hyphens.`) or is taken (`Another post already uses this address.`).
- `Slugify`: NFKD, drop combining marks, lowercase, runs of anything outside `[a-z0-9]` become one separator, first 6 words joined by `-`, at most 80 characters (cut at a hyphen), empty title → `""`. `ValidSlug`: `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤80. Examples to test: `"Dark mode is here, plus faster search"` → `dark-mode-is-here-plus-faster`; `"Café & crème brûlée!"` → `cafe-creme-brulee`; `"Straße"` → `strae` and `"Łódź"` → `odz` (NFKD can't split those letters, which is accepted: the owner can edit the address); `"🎉"` and `"Тёмная тема"` → `""`, so non-Latin boards set the address by hand, and publish and schedule refuse an empty slug (below).
- `Excerpt`: parse with goldmark, collect the text of paragraphs and list items in order (skip headings, code blocks and images), collapse whitespace, cut to ≤220 characters at a word boundary and add `…` when cut. Inline code keeps its text; links keep their text. **Cut by runes, never bytes** (`[]rune`), here and for `publishError`: byte slicing leaves U+FFFD in the excerpt and `og:description`.

**Lifecycle (`changelog.Service`)**
- `Publish(id, actor)`, `Schedule(id, at, actor)`, `Unschedule(id)`, `Unpublish(id)`, `PublishDue()`. Each is one transaction that re-reads the post's state inside it, so a click and the cron can't both publish, and an unschedule at 08:59:59 either wins or loses cleanly.
- **Publish** (now): refuses a post whose trimmed title is empty (`Give the post a title before it goes out.`) or no slug (`Give the post an address before it goes out.`); `published` already → 409 `It's already live.`. Sets `state=published`, `publishedAt` **only when empty** (republish keeps the first date), clears `publishAt`, `scheduledBy` and `publishError`, and removes `images` entries whose filename no longer appears in `body` (only here: doing it on autosave would race an upload whose body save hasn't landed yet). With `completeAttached`, it completes every attached request whose status is `pending`, `reviewing`, `planned` or `progress` and that isn't merged, through `requests.New(tx).Ship(id, actor)`, in the same transaction, with no undo window. Returns `PublishResult{Post Post; Completed int}`.
- `status.Ship(from)` allows those four statuses only. `Service.Ship` is a thin wrapper over the existing private `changeStatus` (one `status_changed` row, `statusChangedAt` stamped, `statusSince` recorded), so Phase 3's shipped emails land on this path too. `requests.Service{App: tx}` is cheap and `RunInTransaction` on a transactional app runs inline, so nesting is safe.
- The **actor** for completions is the publishing admin's team profile; for a scheduled publish it is `scheduledBy`, falling back to `author`, falling back to nil.
- **Schedule** takes an absolute UTC time; refuses `at <= now` (`Pick a time in the future.`), a missing title, a missing slug (the same messages as Publish, so a non-Latin title can't schedule fine and then fail at 09:00), and a published post (409 `It's already live.`). Sets `state=scheduled`, `publishAt`, `scheduledBy`, clears `publishError`. Rescheduling a scheduled post just moves `publishAt`.
- **Unschedule**: scheduled → draft, clears `publishAt` and `scheduledBy`; otherwise 409 `That post isn't scheduled any more.`. **Unpublish**: published → draft, keeps `publishedAt` and `slug`; otherwise 409 `That post isn't live.`.
- **Cron** `lort_changelog`, `* * * * *`, calls `PublishDue()`. `main.go` also runs it once at boot after `schema.Ensure`, **in a goroutine, logging errors and never returning them from OnServe** (every other OnServe step aborts the boot on error, so copying that pattern would let one bad post stop Lort from starting).
  - It selects `state='scheduled' AND publishAt <= now`, ordered `publishAt ASC`. Bind `types.NowDateTime().String()`, the stored text format, as 2A learned.
  - **Its own path, not `Publish`.** PocketBase cron jobs are fire-and-forget goroutines (`tools/cron/cron.go:219-229`), and the boot run can overlap the first tick. So each post's transaction re-reads the post and goes on only while it is still `scheduled` and due. Anything else (unscheduled, moved, or already published by a click) is a silent skip, not a failure.
  - **Failure path:** a failure re-reads the record fresh in a new transaction, never the in-memory copy from the rolled-back attempt (that copy would carry `publishedAt` and the pruned `images`). It flips the post to `draft` only if it is still `scheduled`. It sets `publishError` to the reason sentence (rune-capped at 300), keeps `publishAt` so the banner can say when, and logs `Couldn't publish “<title>” on schedule: <reason>`.
  - One post's failure never stops the other due posts.
  - **Content errors vs passing errors (owner's decision).** A content error goes to draft at once with its message:
    - `ErrNoTitle` or `ErrNoSlug`
    - any `*router.ApiError` or `validation.Errors` from a hook

    Anything else (a busy or locked database, a disk error) leaves the post `scheduled`, logs `Couldn't publish “<title>” yet, trying again in a minute: <err>`, and the next tick retries it. Once `now − publishAt` passes **10 minutes**, a passing error goes to draft with `Something went wrong while publishing it. Publish it now or pick a new time.`. Raw driver text never reaches `publishError`.
  - **72-hour cut-off (owner's decision).** Before publishing, a due post whose `publishAt` is more than **72 hours** ago goes to draft with `It was due more than 3 days ago, so it wasn't published. Publish it now or pick a new time.`, and never auto-publishes or completes its requests. This covers the boot run after a long downtime or a backup restore, and the cron alike. A short outage (a weekend, say) still publishes late, oldest first.
  - Both outcomes show in the failure banner like any other failure.
- **Failure banner data:** `GET /api/lort/changelogs/failed` → `[{id, title, publishAt, error}]` for drafts with a `publishError`. Clearing `publishError` through the record API dismisses it; publish and schedule clear it too.

**Reads**
- `GET /api/lort/changelog?label=<new|improved|fixed>&page=N` (public): published posts, `publishedAt DESC, id DESC`, 20 per page, `Page<PostSummary>`. An unknown `label` means all. No viewer-specific data, so no `no-store`.
- `GET /api/lort/changelog/{slug}` (public): one published post with `body`, `cover`, `labels`, `publishedAt` and `shipped: Item[]`. A draft, scheduled or unknown slug → 404 `That post isn't here.` (superusers too: the editor has its own read). `shipped` comes from `requests.Service.ItemsByID(ids, viewer, team=false)`: the existing visibility filter (visible, public board, not merged, no own-hidden exception) and the viewer's `voted`, with bodies blanked, in the post's attachment order. This response depends on the caller (`voted`), so it sets `noStore`.
- **Team** (superuser group): `GET /api/lort/changelogs?state=<csv>&label=<csv>&q=&page=N` → `Page<TeamPost>`, ordered drafts, then scheduled, then published (`CASE state`), each newest first by `COALESCE(publishedAt, publishAt, updated)`; `q` is a `LIKE` on title with `%`/`_` escaped. `POST /api/lort/changelogs` → `{id}`. `GET /api/lort/changelogs/{id}` → `EditorPost` (every field plus `attached: Item[]` in the team view, so hidden and private ones show). `POST …/{id}/publish` → `PublishResult`; `POST …/{id}/schedule` body `{"publishAt": "<RFC3339>"}`; `POST …/{id}/unschedule`; `POST …/{id}/unpublish`. Register `/changelogs/failed` before `/changelogs/{id}`. Unknown id → 404 `That post isn't here.`.
- Keep every service method free of HTTP types: Phase 4's MCP tools (`list_changelogs`, `publish_changelog`, …) call them directly.
- **Nav flag.** `site.Config.Changelog` (JSON `changelog`) is true when at least one post is published. Drop the site cache on a `changelogs` update whose `state` changed, or a delete of a post that was published. That's not every save: autosave writes about once a second while someone types. The cron's saves fire these hooks too, so a scheduled post makes the pill appear.

**Open Graph without Next calling PocketBase**
- `web.ProxyOptions` gains `Page func(path string) string`. The proxy always deletes an incoming `X-Lort-Page`, then sets it for `/changelog/{slug}` and `/changelog-card/{slug}` (exactly one segment) when `changelog.PageMeta` finds a published post: unpadded base64url JSON `{title, description, url, image, appName}` where `description` is the excerpt, `url` is `LORT_URL + /changelog/<slug>`, and `image` is the cover's `?thumb=1200x630` URL on `LORT_URL`, else `LORT_URL/changelog-card/<slug>`. One indexed query per post page view; nothing for other paths.
- `generateMetadata` in `app/(board)/changelog/[slug]/page.tsx` reads the header: `title` `<post title> · <App>`, `description`, `openGraph` (`type: "article"`, url, image 1200×630), `twitter.card = "summary_large_image"`. Absent header → the layout's defaults.
- The generated card is a **route handler** at `app/changelog-card/[slug]/route.tsx` (`next/og` `ImageResponse`, 1200×630), not the `opengraph-image` file convention: file-based metadata overrides `generateMetadata`, which would hide the cover. It reads `X-Lort-Page` and `X-Lort-Config` from `headers()`, answers 404 without the page header, and draws the dark ground, the letter mark on primary at −4°, the app name, "What's new" in muted, and the title in Bricolage 800 (clamped to 3 lines). `Cache-Control: public, max-age=300`.
  - **Satori can't read woff2.** Commit the static `BricolageGrotesque-ExtraBold.ttf` from the google/fonts repo and read it with `fs` **once per module**, `process.cwd()`-relative. Check it's present in the standalone output, and add it to `outputFileTracingIncludes` if not.
  - **No network while drawing.** Remove emoji and any character the bundled font lacks (keep Latin, Latin-1 and Latin Extended-A) before drawing the title, so `next/og` never fetches Twemoji from a CDN. A title left empty draws only the app name and "What's new".
  - **Render once.** Cards render on every unfurl and the rate limits only cover `/api/`, so keep an in-memory map of up to 64 rendered PNGs keyed by a hash of slug, title, app name, primary colour and logo, with an `ETag` (and a 304 on match).

**Web data**
- Query keys: `keys.changelog(label)` = `["changelog", label]`, `keys.post(slug)` = `["changelog", "post", slug]`, `keys.teamPosts(params)` = `["changelogs", params]`, `keys.editorPost(id)` = `["changelogs", "post", id]`, `keys.failedPosts` = `["changelogs", "failed"]`. None start with `"requests"`, so the 2A cache walkers never see them; the shipped stickers are read-only, so a stale count is fine.
- No realtime for changelogs (anonymous visitors can't subscribe to a `nil`-rule collection, and posts change rarely). Public pages refetch on focus.
- `SiteConfig.changelog: boolean` (default `false` when missing). `boardNav` adds `{ href: "/changelog", label: "Changelog" }` after Roadmap when `config.changelog`. `/changelog` itself always works by URL.
- Dates: list gutter uses `shortDate` (padded day, as everywhere) plus the year on a second line; the post page uses `longDate` (`9 October 2026`); the dashboard uses `dateTime` (`21 Oct, 09:00`, 24-hour). All in the viewer's time zone.

**Rendering markdown**
- Public and preview bodies render with `react-markdown` + `remark-gfm` (strikethrough and autolinks from Tiptap's output). It never renders raw HTML and its default `urlTransform` drops `javascript:` links; keep both defaults. `markdown.tsx` overrides only `a` (`rel="noopener noreferrer"` for other origins) and `img`.
  - **`img` override:** `loading="lazy"`, rounded 10px. It renders only sources under `/api/files/changelogs/` and drops anything else, since a third-party image would leak readers' IP addresses. For non-GIF files it adds `?thumb=1600x0`, so a 5 MB screenshot isn't served at full size.
  - **The editor matches.** Its Image extension drops pasted images whose `src` isn't one of the post's own files (`transformPasted`), so what the editor shows is what goes live.
- **One look for both surfaces:** `lib/prose.ts` exports `PROSE`, a Tailwind class string using arbitrary child variants (`[&_h2]:…`, `[&_p]:…`, `[&_code]:…`, `[&_blockquote]:…`, `[&_hr]:…`, `[&_img]:…`, `[&_a]:text-primary-text …`) matching `P-Changelog-Post` (body 17/28 ink-2, h2 display 24/30 800, inline code on surface-2, 68ch). Apply it to the react-markdown wrapper and to Tiptap's `editorProps.attributes.class`. It's utilities, not component CSS.

**Editor**
- **Tiptap setup:** `useEditor({ immediatelyRender: false, … })` (Next SSR). Extensions: StarterKit with `heading: { levels: [2, 3] }` (the title is the h1), Image (no base64: `allowBase64: false`), Placeholder (`Type / for blocks`), Markdown, and the slash extension. Load with `contentType: "markdown"`; save `editor.getMarkdown()`. Loading content fires an update: compare the markdown with the last saved value and skip no-op saves. The content area is `role="textbox"` `aria-multiline` with `aria-label="Post body"`.
- **Slash menu** with `@tiptap/suggestion` (`char: "/"`, `startOfLine: true`, `allowSpaces: false`): items Heading (`A section title`, inserts H2), Bulleted list, Numbered list, Image, Quote, Code (code block), Divider, filtered by the typed query. UI: shadcn `Command` in a Base UI popover anchored to a virtual element from the suggestion's `clientRect`; the suggestion's `onKeyDown` forwards ArrowUp/ArrowDown/Enter/Escape to the controlled `Command` value. Listbox `aria-label="Insert a block"`. Icons are Tabler (`h-2`, `list`, `list-numbers`, `photo`, `quote`, `code`, `separator`), not the canvas's glyphs.
- **Images in the body:** Image opens a file picker. Check type and 5 MB on the client (toast `Images must be PNG, JPEG, WebP or GIF.` / `That image is over 5 MB.`).
  - **Each upload is its own queued request, never merged:** `upload(file): Promise<string>` on the autosave hook sends `{ "images+": file }`, diffs `images` against the value before that request, and resolves to the new filename. Insert `/api/files/changelogs/<id>/<filename>` (relative, so it works behind any host), with an empty alt, at the position recorded when the upload started. While it uploads, the save state reads `Uploading image…`.
  - **At the 30-image cap**, first remove (`images-`) the files the current markdown no longer references, then upload. Only if it's still full, toast `A post can hold 30 images.`.
  - `DraftPatch` carries no PocketBase file keys; only `updateDraft` and `upload` know them.
- **Title** is an auto-growing `Textarea` styled as display-l (`[field-sizing:content]`), `aria-label="Title"`, placeholder `Give it a title`, `maxLength={160}`.
  - Enter moves focus into the body instead of adding a line, except while `e.nativeEvent.isComposing` (IME).
  - Pasted newlines become spaces.
  - Every "no title" check trims, here and on the server.
- **Slug field:** shadcn `InputGroup` with the `/changelog/` prefix, `aria-label="Post address"`.
  - `cleanSlugInput` lowercases, turns spaces into hyphens, drops everything outside `[a-z0-9-]` and collapses repeated hyphens as the person types. It trims edge hyphens before sending.
  - **On blur it sends `slug` only if the person edited the field during this focus** and the cleaned value differs from the last server slug. Tabbing or clicking through would otherwise pin the address. Sending `""` returns it to automatic.
  - The server's slug from each save response replaces the field's value unless the field has focus.
  - Once `publishedAt` is set it's read-only with the hint `The address is fixed once a post has been published.`. Server slug errors show inline under it.
- **Autosave (`use-autosave.ts`)** contract: `save(patch: DraftPatch, { now?: boolean }): void`, `upload(file: File): Promise<string>`, `flush(): Promise<boolean>`, `discard(): void`, `status: "idle" | "saving" | "saved" | "error" | "signed-out"`, `fieldError: { slug?: string }`.
  - **Batching and order:** patches merge into one pending patch. Text fields (title, body) wait 1 s after the last change; labels, requests, completeAttached, slug and cover save at once. **One request in flight at a time**, in order, so an older save can never land after a newer one.
  - **Network or 5xx:** retry after 2 s, 5 s, then every 10 s, with `Couldn't save. Trying again…`.
  - **401/403 means the session expired, not bad input.** Superuser tokens last one day and the dashboard renews once per load, so a tab left open overnight hits this. Keep the whole pending patch and stop retrying. Show `You've been signed out. Sign in again to keep saving.` with a link that opens `/dashboard/login` in a new tab. Resend once `pbAdmin.authStore` changes to a valid token (it syncs across tabs through `localStorage`).
  - **400:** drop only the fields named in `response.data` and re-queue the rest of that request ahead of newer changes, so a bad slug never takes the body down with it. A 400 without field data keeps everything and shows its message. On `This post is live…`, refetch so the editor turns read-only.
  - **409 (edit conflict):** every request, uploads included, sends `expectedRevision` = the last `revision` this tab saw. That's the value from the initial load, its own save responses and its own lifecycle responses, **never from refetches**, so another tab's edit isn't silently adopted.
    - On a 409, stop the queue, keep the pending patch and set `status: "conflict"`.
    - Show `This post changed in another window. Reload to see it.` with a primary `Reload` (re-seeds from the server, dropping this tab's unsaved changes) and a ghost `Copy your text` (copies this tab's title and body markdown so nothing is lost).
    - `beforeunload` stays armed.
  - **`flush()`** resolves `true` only when everything pending has saved. It resolves `false`, and never hangs, after a 400, while signed out, in a conflict, while `fieldError` is set, or after one failed retry.
  - **The queue outlives the component.** It's a ref-held object, not React state. On unmount it sends any pending patch at once and isn't cancelled by the debounce cleanup. The App Router has no route-change event and `beforeunload` doesn't fire on client navigation, so the editor's back link and sidebar links await `flush()` before navigating. Delete calls `discard()` before deleting.
  - **`beforeunload`** prompts while anything is pending or unsaved (signed out included).
  - **What responses touch:** save responses update `slug`, `updated` and state fields only, never the text being typed.
  - **Live region:** the visible state changes freely, but only errors, signing out and the first `Saved` after an error go to the live region. Announcing every save would chatter while someone types.
- **Form state (`use-editor-form.ts`):** the form seeds once from `keys.editorPost(id)`. Later refetches (window focus) update only `state`, `publishAt`, `publishedAt`, `publishError` and `slug`.
  - **When the editor turns read-only**, because a refetch shows `published` (the cron fired while it was open) or a save got `This post is live…`, reseed title, body, labels, cover and requests from the server. If they differed, toast `It went live before your last change saved.`.
  - Never queue saves while not editable, and make the body non-editable while a publish menu action is pending.
  - Seed the "last saved" body from the editor's own `getMarkdown()` after load, not from the stored string, so a non-identical markdown round trip doesn't fire a save on open.
- **Cover:** a dropzone button (`Add a cover image`, note `Also used when the post is shared. Without one, Lort makes a card from the title.`) accepting click and drop. With a cover: the image plus `Replace cover` and `Remove cover` (`cover: null`). Same type and size checks as body images, and a spinner on the dropzone while uploading.
- **Formatting toolbar (`format-menu.tsx`, owner's decision):** a Tiptap `BubbleMenu` from `@tiptap/react/menus` (install `@floating-ui/dom`, which it needs), shown over a text selection or a selected image. It's a `role="toolbar"` with `aria-label="Format"`, built from shadcn `Toggle`s and Tabler icons.
  - **Text:** Bold (`IconBold`, Mod-B), Italic (`IconItalic`, Mod-I) and Link (`IconLink`, Mod-K), each `aria-pressed` when active.
  - **Link:** opens an inline URL field (`aria-label="Link address"`, placeholder `https://`) with `Apply` and, on an existing link, `Remove link`. Accept `http:`, `https:`, `mailto:` and site-relative paths; anything else shows `Use a web address, like https://example.com.`. Configure StarterKit's Link with `openOnClick: false`, `autolink: true` and an `isAllowedUri` that refuses other protocols.
  - **Image:** the toolbar shows an `Alt text` field (placeholder `Describe the image for people who can't see it`), saved as the markdown alt text. Right after an upload is inserted, the image is selected and this field focused, so alt text is the natural next step. `react-markdown` renders the alt as written.
  - It works by touch on phones, since a selection shows it, and it stays inside the viewport (floating-ui `flip` and `shift`).
- **Untouched drafts clean themselves up (owner's decision).** When the editor unmounts or the page hides, a post that is still a draft with an empty trimmed title, an empty body, no cover, images, labels or requests, and that was never scheduled or published is deleted quietly through the record API. It uses `keepalive` on `pagehide`, with no toast. "New post" opened and abandoned leaves nothing behind.
- **Labels:** shadcn `ToggleGroup` with `multiple`, group `aria-label="Labels"`, pressed = `primary-soft`/`primary-text` (canvas).
- **Shipped in this update:** heading, secondary small `Attach a request` (Tabler `plus`) opening a popover `Command` that searches `listRequests(pbAdmin, { q, status: "pending,reviewing,planned,progress,completed,closed" })` (debounced 300 ms), listing status icon + label, title and votes, already-attached ones marked and disabled. Attached rows: compact read-only `VoteSticker`, title, status icon + ink label, ghost icon button `Detach <title>`. Order is attachment order. Empty: `Attach the requests this update ships. They'll be listed under the post.`. 50 attached → the button hides.
- **Preview** (ghost) swaps the writing surface for `PostView` fed from the unsaved form state (title, labels, cover URL, body markdown, attached items filtered to what the public would see: `visible`, not merged, and on a board listed in `config.boards`, which holds the public boards only). The button reads `Back to editing` while previewing. The editor stays mounted (`hidden`), so undo history, scroll and caret survive the round trip.
- **Rail:** the editor opens with the sidebar as the 76px rail (spec 15.2). `DENSE_PAGES` uses `startsWith`, which would also catch the list at `/dashboard/changelog`: change it to a list of matchers (`/^\/dashboard\/roadmap/`, `/^\/dashboard\/changelog\/[^/]+$/`).

**Publish menu (`publish-menu.tsx`)**
- A primary `Publish` button with a chevron opening a **Popover** labelled `Publish`. It holds a calendar, a time field and a checkbox, so it's a dialog of plain buttons and form controls, **not** `role="menu"` (menu semantics around form controls confuse screen readers). Tab moves through it; Escape closes it. The first line names the address: `Goes live at /changelog/<slug>` (the address is fixed from then on). Rows: `Publish now` / `Goes live on the changelog straight away.`; `Schedule…` / `Pick a day and time.` which expands the shadcn `Calendar` (past days disabled, week starts Monday, default tomorrow) and a time `Input type="time"` labelled `At` (default `09:00`), the caption `Times are in your time zone (<IANA zone>).`, and a small primary `Schedule for <d Mon>`; a past time disables it and shows `Pick a time in the future.`. Below: shadcn `Checkbox` `Also mark the N attached requests as Completed when it goes live` (`the attached request` when N is 1), shown only when `attachedToComplete(attached) > 0`, saved as `completeAttached`, unchecked by default. Under it, in caption size, list the titles that will change (`Dark mode, Faster search`, then `and N more` after three), so nobody completes a hidden request by surprise.
- `scheduleAt(day, "HH:MM")` builds a local `Date` and sends `toISOString()`; on a DST gap the browser's normalisation is accepted. It returns `null` for an empty or invalid time (Chrome gives `""` when a segment is cleared), and the Schedule button is then disabled with `Pick a time.`.
- **Every action awaits `flush()` and stops when it returns `false`**, with the toast `Your last changes haven't saved yet.`. For a slug error, focus goes back to the address field. Otherwise a refused slug would go live at the automatic address, fixed for good.
- **Scheduled:** the button reads `Scheduled · 21 Oct, 09:00`; its menu offers `Publish now`, `Change the time…` (the same calendar) and `Unschedule` / `Back to drafts. Nothing goes out.`.
- **Published:** the editor is read-only (title, body `editable=false`, cover, labels, slug, attach and detach hidden or disabled), with a note above the title `This post is live. Unpublish it to make changes.`, a ghost `View post` link to `/changelog/<slug>` and a secondary `Unpublish`. No primary button in that state.
- **Unpublish is undoable and delayed (owner's decision), with no confirmation dialog.** Most people mean it, and a confirm on every click is worse than an Undo for the rare mistake. `use-delayed-unpublish.ts` owns the flow:
  - **On click**, the editor at once looks unpublished: editable, the note gone, Publish back. The toast `Unpublished. It's a draft again.` shows an `Undo` action and a 10-second countdown bar. Give the existing `undoToast` a `seconds` option; it's 60 today.
  - **The server isn't called yet.** `unpublishPost` goes out when the 10 seconds end. Until then the post stays live and nothing has happened.
  - **Edits wait:** the autosave queue is paused (`pause()`) for those 10 seconds, so edits typed in the meantime aren't refused as "This post is live". Once the unpublish succeeds, `resume()` sends them.
  - **Undo** cancels the timer, never calls the server, and calls `discard()` to drop anything typed in the window. The editor returns to read-only and reseeds from the server, and the toast `Still live.` confirms. From the outside it never happened.
  - **Leaving early commits it.** Unmounting the editor, an editor link, or `pagehide` within the window sends the unpublish at once, as `fetch(..., { keepalive: true })` with the `Authorization` header, because the person meant it.
  - **If the call fails:** a 409 `That post isn't live.` (someone else unpublished it) counts as done. Any other failure restores the read-only state, drops the paused edits and toasts `Couldn't unpublish “<title>”. <message>`.
  - Publish and Schedule are unavailable during the window, so they can't race the pending unpublish.
- Every action disables the menu while pending, then invalidates `["changelogs"]` and `["changelog"]` and calls `router.refresh()` so the nav flag follows.
- Toasts: `Published. It's live on the changelog.`; with completions `Published, and N requests marked as completed.` (`1 request`); `Scheduled for 21 Oct, 09:00.`; `Back in drafts.`; `Unpublished. It's a draft again.` (with Undo, above). Errors toast the server message.
- **Overflow** (`post-actions.tsx`): ghost icon button `More actions` (Tabler `dots`) with `Delete post` (danger text) for draft and scheduled posts only → `AlertDialog` `Delete “<title>”?` (`Delete this untitled post?` without a title), body `It's gone for good, along with its images.`, `Cancel` / `Delete post`. On success: back to the list, toast `Post deleted.`.
- **Failure:** the editor of a post with `publishError` shows, above the title, `This post didn't go out at <21 Oct, 09:00>. It's back in drafts. <error>` with a ghost `Dismiss` (clears `publishError`). `failed-banner.tsx` in `DashboardShell` shows one line per failed post on every dashboard page: `“<title>” didn't go out at <21 Oct, 09:00>. It's back in drafts.` with a link `Open the post`; it polls `keys.failedPosts` every 60 s and on focus, and renders nothing when the list is empty.

**Public pages**
- `/changelog` (`app/(board)`): headline `What's new in <App>`, lede `Everything the team shipped, newest first.`, label filter as a single-select `ToggleGroup` (`aria-label="Filter by label"`: All, New, Improved, Fixed) stored in the URL as `?label=` (All removes it). It ignores a change to an empty value, because Base UI lets a pressed item be clicked off, which would leave no pill pressed; entries in the canvas grid (150px date gutter + content, 28px gap, top border; date above the content below `md`), each entry one link to `/changelog/<slug>` with label chips, title (title size, `primary-text` on hover) and excerpt. Infinite scroll by 20 with the existing `LoadMore`. Empty: `Nothing here yet. When the team ships something, it'll show up here.`; filtered empty: `No posts labelled <Label> yet.` with a ghost `Show all posts`. Error: `The changelog didn't load.` with a secondary `Try again`.
- `/changelog/<slug>`: back link `Changelog` (Tabler `arrow-left`), `longDate` + label chips, display-l title, cover (18px radius, full column width), body (`PROSE`), `Shipped in this update` (hidden when empty) with cards: compact read-only sticker with the visitor's vote, title, Completed status icon + ink label, `Suggested by <name>` on the right (left out when the author is gone), each a link to `/feedback/<id>`; then a secondary `Share this update` that copies the absolute URL (`Link copied.`, or `Couldn't copy the link.`). A 404 renders `post-missing.tsx`: title `This post isn't here`, body `It may be getting an edit. Everything else the team shipped is on the changelog.`, secondary `See every update` → `/changelog`. Other errors: `This post didn't load.` + `Try again`.
- Skeletons for both (`aria-busy="true"`, real shell and headline, bones for entries; for the post, bones for date, title, cover and paragraphs). Dashboard list and editor get skeletons the same way (editor: real top bar with bones for slug and menu, bones for cover, labels, title and body).

**Dashboard list**
- Title `Changelog`, lede `Tell people what you shipped.`, primary `New post` (Tabler `plus`; disabled while the create is pending so a double click makes one post; on success `router.push` to the editor). Filters in the URL like the requests page: search `Search posts` (follows the URL), State `FilterMenu` (`Any state`, noun `states`), Label `FilterMenu` (`Any label`, noun `labels`). shadcn `Table` with Post, Labels, State (dot + text: `Draft · edited 2 min ago` via `relativeTime`, `Scheduled · 21 Oct, 09:00`, `Published · 09 Oct`), Requests (`N attached` / `None`), Author (avatar with the name as its accessible name). An untitled draft shows `Untitled post` in muted. Rows open the editor the way the requests table's rows do. Below `md` the Labels, Requests and Author columns hide and the state line sits under the title. Infinite scroll by 20. Empty: `No posts yet` / `Write one when something ships. People love hearing what changed.`; filtered empty: `No posts match these filters.` + `Clear filters`.
- Sidebar: `Changelog` (Tabler `IconNews`) after Roadmap.

## Tasks

### Task 1: Changelog collection and its rules
**Files:** `server/internal/schema/schema.go` (+test), `server/internal/changelog/slug.go`, `excerpt.go`, `hooks.go` (+tests), `server/internal/site/site.go` (+test), `server/main.go` (bind), `server/go.mod` (goldmark)
**Interfaces:**
- Produces: collection `changelogs` (fields above); `changelog.Slugify(title string) string`; `changelog.ValidSlug(s string) bool`; `changelog.Excerpt(md string) string`; `changelog.Bind(app core.App)`; `site.Config.Changelog bool` (`json:"changelog"`).

**Build:** schema step `ensureChangelogs` after `ensureActivity` (it relates to requests and users); hooks and slug/excerpt rules as in Key Decisions (Data); site flag and cache drop.

**Tests (behaviours):**
- Slugify and ValidSlug examples above; 7-word title keeps 6; 200-char word is cut to ≤80.
- Excerpt: skips a leading heading, joins paragraph and list text, cuts at a word with `…`, keeps link text, drops code blocks.
- A draft's slug follows each title change; a hand-set slug stops it; sending `""` resumes it; a second post with the same title gets `-2`; a custom duplicate is refused with `data.slug`; an invalid slug is refused.
- Once published (then unpublished), a title change keeps the slug and a slug change is refused.
- A published post refuses title, body, labels, requests and cover changes and refuses delete; a draft and a scheduled post accept them and can be deleted.
- Deleting a request attached to a published post succeeds; the post keeps its other attachments. Adding a request to a published post is still refused.
- Record API: create refused; sending `state`, `publishAt`, `publishedAt`, `author`, `excerpt`, `slugCustom` or an unknown field refused; `publishError: "x"` refused, `""` accepted; anonymous and `users` tokens can't list, view or update.
- A title saved as `"  Dark\nmode  "` is stored as `Dark mode`; a whitespace-only title counts as empty.
- `site.Load` reports `changelog=false` with only drafts and `true` after one is published; the cache drops on a state change, not on a body edit.
- `revision` rises by 1 on a title, body, labels or image change and not on a state-only save; `expectedRevision` equal to the stored value saves (and isn't stored), a stale one answers 409 with the message, a missing one skips the check, and on a published post the "live" message wins over the conflict.

**Done when:** `cd server && go test ./... && go vet ./...` pass.

- [ ] Task 1 complete

### Task 2: Lifecycle, reads, cron and the page-meta header
**Files:** `server/internal/changelog/service.go`, `read.go`, `team.go`, `lifecycle.go`, `schedule.go`, `meta.go` (+tests), `server/internal/status/status.go` (+test), `server/internal/requests/service.go` (+test), `server/internal/api/changelog.go` (+test), `api.go` (one register call, `fail` cases), `server/internal/web/web.go` (+test), `server/main.go`
**Interfaces:**
- Consumes: Task 1's collection and hooks; `requests.changeStatus`, `requests.Item`, `requests.Person`.
- Produces:
  - `status.Ship(from Status) error`; `(*requests.Service).Ship(id string, actor *core.Record) (Change, error)`; `(*requests.Service).ItemsByID(ids []string, viewer *core.Record, team bool) ([]Item, error)` (input order, bodies blank)
  - `changelog.New(app core.App) *Service` with `Now func() time.Time`
  - `type PostSummary struct { ID, Slug, Title, Excerpt string; Labels []string; PublishedAt time.Time }` (JSON camelCase)
  - `type Post struct { PostSummary; Body, Cover string; Shipped []requests.Item }`
  - `type TeamPost struct { ID, Title, Slug, State string; Labels []string; PublishAt, PublishedAt, Updated *time.Time; Requests int; Author requests.Person; PublishError string }`
  - `type EditorPost struct { TeamPost; Body, Cover, Excerpt string; Images []string; CompleteAttached bool; Attached []requests.Item }`
  - `type PublishResult struct { Post TeamPost; Completed int }`; `type FailedPost struct { ID, Title string; PublishAt time.Time; Error string }`
  - Methods: `List(label string, page int) (Page[PostSummary], error)`, `BySlug(slug string, viewer *core.Record) (Post, error)`, `TeamList(q TeamQuery) (Page[TeamPost], error)`, `Create(actor *core.Record) (string, error)`, `Editor(id string) (EditorPost, error)`, `Publish(id string, actor *core.Record) (PublishResult, error)`, `Schedule(id string, at time.Time, actor *core.Record) (TeamPost, error)`, `Unschedule(id string) (TeamPost, error)`, `Unpublish(id string) (TeamPost, error)`, `PublishDue() error`, `Failed() ([]FailedPost, error)`, `PageMeta(path string) string`; errors `ErrNotFound` (404), `ErrLive` (409), `ErrNotScheduled` (409), `ErrNotLive` (409), `ErrNoTitle`, `ErrNoSlug`, `ErrPast` (400), all added to `api.fail`.
  - Routes as in Key Decisions (Reads); `web.ProxyOptions.Page func(path string) string`, header `X-Lort-Page`.

**Build:** as in Key Decisions (Lifecycle, Reads, Open Graph). `requests.Page` holds `[]Item` only, so `changelog` defines `type Page[T any] struct { Items []T; Page, PerPage, TotalItems int }` with the same JSON tags (`items`, `page`, `perPage`, `totalItems`). Cron and the boot catch-up (goroutine, logs only) in `main.go`.

**Tests (behaviours):**
- `status.Ship`: pending, reviewing, planned, progress allowed; completed and closed refused.
- Publish: sets state and `publishedAt`; republish after unpublish keeps the first `publishedAt`; no title → `ErrNoTitle`, nothing changes; already live → `ErrLive`.
- Publish with `completeAttached`: a Planned and a Reviewing request become Completed with one `status_changed` row each (actor = publisher); a Closed, a Completed and a merged one are untouched; `Completed` counts 2; a failing completion rolls back the publish.
- Publish drops images not referenced in the body and keeps referenced ones.
- Schedule: past time → `ErrPast`; empty slug (a `"Тёмная тема"` title with no hand-set address) → `ErrNoSlug`; future → scheduled with `scheduledBy`; reschedule moves `publishAt`; Unschedule → draft; Unschedule a draft → `ErrNotScheduled`; Unpublish a draft → `ErrNotLive`.
- `PublishDue` with a fake `Now`: publishes only due scheduled posts, oldest `publishAt` first, with the scheduler as the completions' actor; a due post with an empty title goes back to draft with `publishError` and appears in `Failed()`, and the next due post still publishes; a post unscheduled before the run stays a draft.
- `PublishDue` races (a test hook between the select and the per-post transaction): an Unschedule landing there leaves the post a draft with no `publishError`; a manual Publish landing there leaves it published (not flipped to draft); a failure leaves `publishedAt` empty and the images untouched; a 400-character error is stored rune-capped.
- A boot-time `PublishDue` error is logged and the server still starts.
- Passing errors (a test seam that fails the save with a non-API error): the post stays `scheduled` and publishes on the next run once the seam clears; with the clock 11 minutes past `publishAt` it goes to draft with the friendly message, not the driver text.
- 72 hours: a post due 71h59m ago publishes; one due 72h01m ago goes to draft with the "more than 3 days" message, and its attached requests stay untouched even with `completeAttached`.
- `List`: published only, newest first, label filter, 20 per page; `BySlug`: draft and scheduled → `ErrNotFound`; `shipped` excludes hidden, private-board and merged requests and carries the viewer's `voted`.
- `TeamList`: state order draft → scheduled → published, `q` matches `50%` literally, label and state filters combine.
- API: public GETs need no auth; team routes answer 401/403 to anonymous and `users` tokens; `/changelogs/failed` isn't swallowed by `/changelogs/{id}`; `POST /schedule` with a past time → 400 with the message; the published cover file URL loads anonymously.
- Proxy: an incoming `X-Lort-Page` is always removed; `/changelog/<published slug>` gets a header whose JSON has the cover thumb or the card URL on `LORT_URL`; drafts, `/changelog`, `/changelog/a/b` and `/feedback` get none.

**Done when:** `cd server && go test ./... && go vet ./...` pass; against a dev server, `curl -s http://127.0.0.1:4052/api/lort/changelog` returns `{"items":[],…}`.

- [ ] Task 2 complete

### Task 3: Web data layer, nav and markdown
**Files:** `web/lib/api.ts`, `web/lib/query.ts`, `web/lib/config.ts`, `web/lib/changelog.ts`, `web/lib/time.ts`, `web/lib/prose.ts`, `web/components/board/links.ts`, `web/components/board/changelog/markdown.tsx`, `label-chips.tsx` (+tests); `package.json` (react-markdown, remark-gfm)
**Interfaces:**
- Consumes: Task 2's JSON.
- Produces:
  - Types `ChangelogLabel`, `ChangelogState`, `PostSummary`, `Post`, `TeamPost`, `EditorPost`, `PublishResult`, `FailedPost`, `DraftPatch` (title, body, slug, labels, requests, completeAttached, publishError, `cover: File | null`; no PocketBase file keys)
  - Calls `listPosts(c, label, page)`, `getPost(c, slug)`, `teamPosts(c, params, page)`, `createPost(c)`, `editorPost(c, id)`, `publishPost(c, id)`, `schedulePost(c, id, at: Date)`, `unschedulePost(c, id)`, `unpublishPost(c, id)`, `failedPosts(c)`, `updateDraft(c, id, patch)` (returns the saved record's `slug`, `updated`, `state`, `images`), `addImage(c, id, file): Promise<string[]>` and `removeImages(c, id, names): Promise<string[]>` (each returns `images` after the save), `deletePost(c, id)`
  - `keys.changelog`, `keys.post`, `keys.teamPosts`, `keys.editorPost`, `keys.failedPosts`; `SiteConfig.changelog`
  - `LABELS: { value: ChangelogLabel; label: string }[]`, `sortLabels`, `stateText(p: TeamPost, now?)`, `cleanSlugInput(s)`, `scheduleAt(day: Date, time: string): Date | null`, `referencedImages(markdown: string, names: string[]): Set<string>`, `attachedToComplete(items: RequestItem[]): number`, `longDate`, `dateTime`, `PROSE`, `<Markdown source={string} />`, `<LabelChips labels={…} />`

**Tests (behaviours):**
- `parseConfig` defaults `changelog` to false; `boardNav` adds Changelog after Roadmap only when `changelog` is true, and with the roadmap off it follows Feedback.
- `stateText` for each state; `dateTime` is 24-hour `21 Oct, 09:00`; `longDate` is `9 October 2026`.
- `cleanSlugInput("Dark Mode ") === "dark-mode-"`, `cleanSlugInput("Bad Address!") === "bad-address"`, `cleanSlugInput("a--b") === "a-b"`; `scheduleAt` builds the local wall-clock time and returns `null` for `""` or `"25:00"`.
- `referencedImages` finds names used in the markdown and ignores names that only appear as a prefix of another.
- `attachedToComplete` counts pending/reviewing/planned/progress and skips completed, closed and merged.
- `<Markdown>` renders headings, lists, inline code and links; `<script>` in the source shows as text; a `javascript:` link has no `href`; an image on another host is dropped; a PNG under `/api/files/changelogs/` gets `?thumb=1600x0` and a GIF doesn't.
- `sortLabels(["fixed","new"])` → New, Fixed.

**Done when:** `cd web && pnpm typecheck && pnpm lint && pnpm test` pass.

- [ ] Task 3 complete

### Task 4: Public changelog pages and the share card
**Files:** `web/app/(board)/changelog/page.tsx`, `web/app/(board)/changelog/[slug]/page.tsx`, `web/app/changelog-card/[slug]/route.tsx`, `web/app/fonts/BricolageGrotesque-ExtraBold.ttf`, `web/components/board/changelog/*` (list, entry, post-view, shipped-list, share-button, post-missing, skeletons), `web/next.config.ts` (only if tracing needs it)
**Interfaces:**
- Consumes: Task 3.
- Produces: `PostView` props `{ title: string; labels: ChangelogLabel[]; date?: string; coverUrl?: string; body: string; shipped: RequestItem[]; share?: boolean }` (the editor's Preview reuses it with `share` off and no date when unpublished).

**Build:** as in Key Decisions (Public pages, Open Graph, Rendering markdown).

**Tests (behaviours):**
- The list renders entries with date, chips, title and excerpt, each linking to `/changelog/<slug>`; choosing New sets `?label=new` and All clears it; empty and filtered-empty copy.
- `PostView` renders chips in label order, the cover only when given, the shipped section only when non-empty, and `Suggested by` only with an author.
- Share copies the absolute URL and toasts; a rejected clipboard toasts the failure.
- `generateMetadata` turns a header into title, description, `og:image` and `summary_large_image`, and falls back without it.
- The card route answers 404 without `X-Lort-Page` and a `image/png` with it; titles `"Dark mode 🎉"` and `"Тёмная тема"` render a PNG with `fetch` stubbed to throw (no network); a second request with the same data is served from the cache, and `If-None-Match` gets 304.

**Done when:** unit tests pass; `/changelog`, a post and `/changelog-card/<slug>` render on the dev server in both themes.

- [ ] Task 4 complete

### Task 5: Dashboard list, sidebar and failure banner
**Files:** `web/app/dashboard/(app)/changelog/page.tsx`, `web/components/dashboard/changelog/posts-page.tsx`, `posts-table.tsx` (+test), `posts-skeleton.tsx`, `failed-banner.tsx` (+test), `web/components/dashboard/app-sidebar.tsx`, `dashboard-shell.tsx`
**Interfaces:**
- Consumes: Task 3's calls and keys; `FilterMenu`, `useUrlSearch`, `LoadMore`.

**Build:** as in Key Decisions (Dashboard list, Failure); sidebar item; `DENSE_PAGES` matchers (the editor route exists after Task 6, but the matcher lands here).

**Tests (behaviours):**
- Rows show the state text and dot per state, `Untitled post`, `N attached`/`None`; filters write the URL; Clear filters resets them.
- `New post` makes one create on a double click and navigates to the editor.
- The banner lists failed posts with links and renders nothing for an empty list.
- The shell opens the rail on `/dashboard/changelog/abc` and not on `/dashboard/changelog`.

**Done when:** unit tests pass; the list renders on the dev server.

- [ ] Task 5 complete

### Task 6: The editor
**Files:** `web/app/dashboard/(app)/changelog/[id]/page.tsx`, `web/components/dashboard/changelog/editor/*`; `package.json` (Tiptap packages); shadcn `calendar`, `checkbox`
**Interfaces:**
- Consumes: Tasks 3–5; `PostView`; `listRequests`; `VoteSticker`, `StatusIcon`.
- Produces: `useAutosave(id: string, initial: EditorPost): { save(patch: DraftPatch, o?: { now?: boolean }): void; upload(file: File): Promise<string>; flush(): Promise<boolean>; discard(): void; pause(): void; resume(): void; revision: number; status: "idle" | "saving" | "saved" | "error" | "signed-out" | "conflict"; fieldError: { slug?: string } }`; `useDelayedUnpublish(post, autosave): { unpublish(): void; pending: boolean }`; `useEditorForm(post: EditorPost | undefined)` (form state, `editable`, `previewData`).

**Build:** as in Key Decisions (Editor, Publish menu). Top bar left to right: back link `Changelog`, save state (`Saving…`, Tabler `check` + `Saved`, `Couldn't save. Trying again…`; polite live region), spacer, slug field, Preview, publish control, overflow. Below `md` the slug field drops to its own row under the bar.

**Tests (behaviours):**
- `useAutosave` (fake timers, mocked API):
  - Batching and order: typing within 1 s sends one save; a label change sends at once; a second save waits for the first; a slow first save can't be overwritten by a newer one.
  - Errors: a 500 retries with `error` status and recovers. A body and a taken slug sent together end with the body saved and `fieldError.slug` set. A 401 keeps the whole patch, shows `signed-out` and resends after the auth store changes.
  - Uploads: two quick `upload()` calls make two requests, and each resolves to its own filename.
  - `flush`: resolves `true` after the queue drains, and `false` (without hanging) after a 400 or while signed out.
  - Unmount and delete: unmounting with a pending patch still sends it; `discard()` then delete sends nothing more.
- `useEditorForm`: a refetch with a new `state` turns it read-only and reseeds the content from the server (the toast when it differed); a refetch while editable leaves the typed title alone.
- Tabbing through the address field sends no `slug`; editing it and blurring sends the cleaned value.
- The slash menu filters by the query, Enter inserts the picked block, Escape closes it.
- The publish menu: it names the address; an empty or past time disables `Schedule for …`; a `flush()` of `false` stops Publish now with `Your last changes haven't saved yet.`; the completion checkbox shows only with completable requests, unchecked, with its singular/plural copy and the titles that will change; the scheduled state shows `Scheduled · …` with Change the time and Unschedule; a published post is read-only with Unpublish and no primary button.
- Delete is offered for draft and scheduled only; confirming calls delete and navigates to the list.
- `useAutosave` conflicts: a 409 sets `conflict`, keeps the patch and stops the queue; `revision` advances from save responses and not from refetches; `pause()` holds saves until `resume()`.
- `useDelayedUnpublish` (fake timers): the editor turns editable at once and nothing is sent; at 10 s `unpublishPost` is called and paused edits are sent after it; Undo at 5 s sends nothing, drops the paused edits and restores read-only; unmounting at 5 s sends the unpublish at once; a 409 counts as done; a 500 restores read-only with the error toast.
- Format menu: Mod-B and Mod-I toggle marks; a `javascript:` link is refused with the message; a selected image shows the Alt text field and the alt lands in the saved markdown as `![alt](src)`.
- Untouched-draft cleanup: leaving a brand-new post deletes it; leaving one with only a label kept, or one that was ever scheduled, keeps it.

**Done when:** unit tests pass; on the dev server a new post can be written, gets a cover and an image, autosaves, previews, and publishes.

- [ ] Task 6 complete

### Task 7: End-to-end tests, full check, commit and PR
**Files:** `web/e2e/changelog.spec.ts` (create), `web/e2e/a11y.spec.ts`, `web/e2e/helpers.ts` (a `seedPost` helper through the team API with the admin token)
**Build:** e2e with the existing server harness; axe on `/changelog`, a post, the missing-post page, the dashboard list and the editor (with the publish menu open), both themes.

**Tests (behaviours):**
- Write a post (title, a heading via the slash menu, a list, a label, an attached request), wait for `Saved`, reload: everything is still there.
- Publish now: toast; the Changelog pill appears on `/feedback`; `/changelog` lists it; the post page shows the body, the shipped request and a `og:image` meta tag.
- Publish with the completion box: the attached Planned request is Completed on its page timeline.
- Unpublish: the post 404s publicly, the editor is editable, the address field stays locked; republish keeps the original date.
- Schedule one minute ahead (`test.slow()`): the list shows `Scheduled · …`; within 75 s the post is live.
- Unschedule returns it to drafts; delete removes a draft from the list.
- Label filter on `/changelog` follows the URL and back/forward.

**Done when:** `cd server && go test ./... && go vet ./...`; `cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm e2e --repeat-each=2` all pass. Then one commit on `phase-2b-changelog` and a PR. Review rounds and the docs commit follow `CLAUDE.md`.

- [ ] Task 7 complete

## Manual Verification Checklist

**Shared setup:**
1. `git switch phase-2b-changelog`
2. Terminal A: `cd web && pnpm install && pnpm build && pnpm start` (Next on `127.0.0.1:3000`).
3. Terminal B: `node web/e2e/server.mjs` (Go on `127.0.0.1:4052`, fresh database in `web/e2e/.data`, admin from `test/e2e.env`).
4. Open http://localhost:4052, sign in at `/dashboard/login` with the admin from `test/e2e.env`. In Settings → Boards keep a public board "Features" and add a private board "Internal".
5. As the admin create three requests on `/dashboard/requests`: "Dark mode" (Features, moved to Planned), "Faster search" (Features, Reviewing), "Private tidy-up" (Internal, Planned).
6. In a second browser profile sign up as `ana@lort.test` / `password123` (the "visitor") and vote on "Dark mode".

#### MV-1: No changelog yet
- **Steps:** as the visitor open http://localhost:4052/feedback, then http://localhost:4052/changelog.
- **Expected:** the nav has no Changelog pill. `/changelog` shows "What's new in <App>", "Everything the team shipped, newest first." and "Nothing here yet. When the team ships something, it'll show up here." No email sentence.
- **How the executor runs it:** Playwright.

#### MV-2: Dashboard list and New post
- **Steps:** as the admin open http://localhost:4052/dashboard/changelog; double-click "New post".
- **Expected:** sidebar shows Changelog (current) after Roadmap; lede "Tell people what you shipped."; empty state "No posts yet". One editor opens at `/dashboard/changelog/<id>` with the sidebar as the 76px rail; going back shows exactly one row "Untitled post · Draft · edited just now".
- **How the executor runs it:** Playwright.

#### MV-3: Writing with autosave
- **Steps:** in the editor type the title "Dark mode is here, plus faster search"; in the body type a sentence, then `/`, pick Heading, type "What changed", Enter, `/bul`, Enter, two list items; toggle New and Improved; wait 2 s; reload.
- **Expected:** the save state goes "Saving…" then "Saved"; the address field reads `dark-mode-is-here-plus-faster`; after reload title, heading, list, labels and address are unchanged.
- **How the executor runs it:** Playwright.

#### MV-4: Slash menu by keyboard
- **Steps:** on an empty line type `/`, press ArrowDown twice, Enter; then type `/`, Escape.
- **Expected:** a listbox "Insert a block" with Heading, Bulleted list, Numbered list, Image, Quote, Code, Divider; the third (Numbered list) is inserted; Escape closes the menu and leaves the `/` as text. Focus ring visible.
- **How the executor runs it:** Playwright.

#### MV-5: Cover and body images
- **Steps:** add a 200 KB PNG as cover; add a 6 MB PNG as cover; insert a PNG through the slash menu's Image; remove the cover.
- **Expected:** the cover shows with Replace/Remove; the 6 MB one toasts "That image is over 5 MB." and nothing changes; the body image shows inline and survives a reload; Remove cover brings back "Add a cover image" with the sharing note.
- **How the executor runs it:** Playwright (`setInputFiles`).

#### MV-6: Slug rules
- **Steps:** change the title to "Dark mode"; then set the address to "Bad Address!" and blur; then set it to "dark-mode-launch" and blur; then change the title again; then clear the address and blur.
- **Expected:** the address follows the first title change (`dark-mode`); typing "Bad Address!" shows `bad-address` and saves it (no error); `dark-mode-launch` saves and stays when the title changes; clearing it returns to the automatic slug of the current title. Separately, Tab through the address field without typing and change the title: the address still follows it. (The server's "Use lowercase letters, numbers and hyphens." is checked by curl in MV-19.)
- **How the executor runs it:** Playwright.

#### MV-7: Duplicate address
- **Steps:** create a second post titled "Dark mode"; then set its address by hand to the first post's address.
- **Expected:** the automatic slug is `dark-mode-2` (or the first free suffix); the hand-set duplicate shows "Another post already uses this address." under the field.
- **How the executor runs it:** Playwright.

#### MV-8: Attach requests
- **Steps:** in the first post click "Attach a request", search "dark", pick "Dark mode"; attach "Faster search" and "Private tidy-up"; detach "Faster search".
- **Expected:** each attached row shows a read-only sticker, the title and status icon + label; "Dark mode" is marked as attached in the picker; after detaching, two rows remain and survive a reload.
- **How the executor runs it:** Playwright.

#### MV-9: Preview
- **Steps:** click Preview, then "Back to editing".
- **Expected:** the preview looks like the public post (labels, title, body styles matching the editor, shipped list with "Dark mode" and without "Private tidy-up"); no Share button; Back to editing returns with nothing lost.
- **How the executor runs it:** Playwright, plus a `[user-only]` look-and-feel comparison against `P-Changelog-Post`.

#### MV-10: Publish now with completion
- **Steps:** open Publish; check "Also mark the 2 attached requests as Completed when it goes live"; click "Publish now".
- **Expected:** the popover first reads "Goes live at /changelog/<slug>"; the checkbox starts unchecked and lists "Dark mode, Private tidy-up" under it; "Publish now" says "Goes live on the changelog straight away." (no subscriber count); toast "Published, and 2 requests marked as completed."; the editor is read-only with "This post is live. Unpublish it to make changes.", View post and Unpublish, and no primary button. "Dark mode" shows Completed with a Planned → Completed timeline entry; the roadmap shows it shipped today.
- **How the executor runs it:** Playwright.

#### MV-11: The public changelog
- **Steps:** as the visitor reload `/feedback`, open `/changelog`, click the post.
- **Expected:** the Changelog pill appears; the entry shows today's date, New and Improved chips (New tinted), the title and an excerpt that starts with the first sentence (not the heading); the post page shows the long date, cover if any, body, and "Shipped in this update" with "Dark mode" (voted sticker, Completed, "Suggested by <admin's name>") and without "Private tidy-up".
- **How the executor runs it:** Playwright.

#### MV-12: Share and Open Graph
- **Steps:** click "Share this update"; run `curl -s http://127.0.0.1:4052/changelog/<slug> | grep -o '<meta property="og:[a-z:]*" content="[^"]*"'`; open the `og:image` URL; repeat after adding a cover (unpublish, add, publish).
- **Expected:** toast "Link copied." and the clipboard holds `http://localhost:4052/changelog/<slug>`; og:title is the post title, og:description the excerpt, og:image `…/changelog-card/<slug>` returning a 1200×630 PNG with the title in Bricolage on the board's look; with a cover, og:image is the cover's `thumb=1200x630` URL. `curl -s -H "X-Lort-Page: Zm9v" http://127.0.0.1:4052/changelog/nope` shows no og:title (forged header dropped).
- **How the executor runs it:** Playwright + curl; whether the card looks good is `[user-only]`.

#### MV-13: Label filter
- **Steps:** on `/changelog` click Fixed, then "Show all posts". Publish a second post labelled Fixed; click Fixed, then New, then browser Back.
- **Expected:** before the second post, Fixed shows "No posts labelled Fixed yet." and "Show all posts" clears the filter. After it, Fixed shows only the second post with `?label=fixed` in the URL; New shows only the first; Back returns to Fixed.
- **How the executor runs it:** Playwright.

#### MV-14: Unpublish and republish keeps the date
- **Setup:** a post published at least a minute earlier.
- **Steps:** Unpublish; wait 11 s; edit the title; Publish now; check `/changelog`.
- **Expected:** no confirmation dialog; toast "Unpublished. It's a draft again." with Undo and a 10-second bar, and the editor is editable at once; after the bar runs out, the public URL shows "This post isn't here" with "See every update"; the address field is locked with "The address is fixed once a post has been published."; after republishing, the entry keeps its original date and position.
- **How the executor runs it:** Playwright.

#### MV-14b: Undo an unpublish
- **Steps:** on a published post click Unpublish; type a word in the body; within 10 s click Undo. Separately: click Unpublish and, within 10 s, click the sidebar's Changelog.
- **Expected:** during the window the public post still loads; Undo shows "Still live.", the editor is read-only again without the typed word, and the public post never stopped loading (watch it in a second tab). In the second case, the list shows the post as a draft straight away and its public URL says "This post isn't here".
- **How the executor runs it:** Playwright.

#### MV-15: Schedule, change, unschedule
- **Steps:** on a new draft open Publish → Schedule…; try today's past hour; pick tomorrow 09:00 and "Schedule for <d Mon>"; on the list check the row; open Publish → Change the time… → the day after; then Unschedule.
- **Expected:** the past time disables the button with "Pick a time in the future."; the caption names the browser's time zone; toast "Scheduled for <dd Mon>, 09:00."; the row reads "Scheduled · <dd Mon>, 09:00" with an ink-2 dot; the editor button reads the same and the post stays editable; after Unschedule toast "Back in drafts." and the row is a draft.
- **How the executor runs it:** Playwright.

#### MV-16: Scheduled publish fires
- **Steps:** schedule a titled draft for the next whole minute; wait up to 75 s; open `/changelog` as the visitor.
- **Expected:** the post is live with today's date and the row reads "Published · …"; an editor left open on it turns read-only after focusing the window.
- **How the executor runs it:** Playwright (`test.slow()`).

#### MV-17: Scheduled publish fails
- **Steps:** schedule a titled draft for the next minute, then clear its title (scheduled posts stay editable); wait up to 75 s; open any dashboard page.
- **Expected:** a banner "“Untitled post” didn't go out at <dd Mon, HH:MM>. It's back in drafts." with "Open the post"; the editor shows the reason "Give the post a title before it goes out." and Dismiss; Dismiss removes the banner everywhere; `docker logs`-style server output has "Couldn't publish … on schedule".
- **How the executor runs it:** Playwright + server log.

#### MV-18: Delete rules
- **Steps:** on a draft, More actions → Delete post → Delete post; on a published post open More actions; run `curl -s -X DELETE -H "Authorization: <superuser token>" http://127.0.0.1:4052/api/collections/changelogs/records/<published id>`.
- **Expected:** the dialog reads "Delete “<title>”?" / "It's gone for good, along with its images."; toast "Post deleted." and the row is gone; the published post's menu has no Delete; curl answers 400 "Unpublish this post before deleting it.".
- **How the executor runs it:** Playwright + curl.

#### MV-19: Server guards
- **Steps:** with the superuser token, `PATCH /api/collections/changelogs/records/<published id>` with `{"title":"x"}`; `PATCH` a draft with `{"state":"published"}`; `POST /api/lort/changelogs/<id>/schedule` with a past `publishAt`; anonymous `GET /api/collections/changelogs/records`; anonymous `POST /api/lort/changelogs`; `GET /api/lort/changelog/<draft slug>`.
- **Expected:** 400 "This post is live. Unpublish it to make changes."; 400 "Use Publish, Schedule or Unpublish to change that."; 400 "Pick a time in the future."; 403 (PocketBase's superusers-only answer for a `nil` rule); 401; 404 "That post isn't here.".
- **How the executor runs it:** curl.

#### MV-20: Autosave under failure
- **Steps:** type in the body, then within 1 s make `PATCH …/changelogs/records/*` fail (Playwright `route` → abort) for 6 s, then let it through.
- **Expected:** "Couldn't save. Trying again…" while failing, then "Saved"; the text after reload is the latest typed; leaving the page while unsaved asks for confirmation. Typing a line and clicking the sidebar's Changelog within 1 s still saves that line.
- **How the executor runs it:** Playwright.

#### MV-20b: Signed out mid-edit
- **Steps:** in an open editor, clear the `lort_admin` entry in `localStorage` from devtools in another tab (or make `PATCH` answer 401 with `page.route`); type a paragraph; sign in again at `/dashboard/login` in a new tab; come back.
- **Expected:** "You've been signed out. Sign in again to keep saving." with a sign-in link; reloading prompts before leaving; after signing in, the paragraph saves ("Saved") and survives a reload.
- **How the executor runs it:** Playwright.

#### MV-21: Phones
- **Steps:** at 375×812 open `/changelog`, a post, `/dashboard/changelog` and an editor; open the publish menu and the slash menu.
- **Expected:** no horizontal page scroll; the date sits above each entry; the editor's address field is on its own row; the publish popover and calendar fit the screen; the slash menu stays on screen. Real-device typing in Tiptap is `[user-only]`.
- **How the executor runs it:** Playwright for layout.

#### MV-22: Skeletons, themes and accessibility
- **Steps:** delay `/api/lort/changelog*` with `page.route`; open `/changelog`, a post, `/dashboard/changelog` and an editor; run axe on each, on the missing post page and with the publish menu open, in light and dark.
- **Expected:** shells and headings real, bones pulsing under `aria-busy="true"` (static with reduced motion); axe reports no violations.
- **How the executor runs it:** Playwright + axe.

#### MV-23: Earlier phases still work
- **Steps:** vote on `/feedback`; drag a card on `/dashboard/roadmap` and Undo; toggle Settings → Roadmap off and on; open `/roadmap`.
- **Expected:** all behave as in Phase 2A; with the roadmap off, the nav shows Feedback and Changelog only.
- **How the executor runs it:** Playwright.

#### MV-24: Deleting a request attached to a live post
- **Steps:** on `/dashboard/requests/<id>` for "Dark mode" (attached to the published post), overflow menu → Delete → confirm; open the post publicly.
- **Expected:** the request is deleted with no "This post is live…" error; the post stays published and its shipped list no longer shows it.
- **How the executor runs it:** Playwright.

#### MV-25: Publish waits for a good save
- **Steps:** in a draft with a hand-set address, make `PATCH` fail with 400 `data.slug` via `page.route`, edit the address, then open Publish → Publish now.
- **Expected:** toast "Your last changes haven't saved yet.", focus returns to the address field, and the post is still a draft.
- **How the executor runs it:** Playwright.

#### MV-26: Emoji and non-Latin titles
- **Steps:** publish a post titled "Dark mode 🎉" and one titled "Тёмная тема" (set its address by hand to `dark-theme`, after seeing that Schedule refuses it while the address is empty); open each `/changelog-card/<slug>` with the container's outbound network blocked if possible.
- **Expected:** Schedule without an address says "Give the post an address before it goes out."; both cards return a PNG quickly; the emoji is left out of the drawn title.
- **How the executor runs it:** Playwright + curl; card legibility for non-Latin titles is `[user-only]`.

#### MV-27: Two tabs on one post
- **Steps:** open the same draft in two tabs; type "first" in tab A and wait for Saved; type "second" in tab B.
- **Expected:** tab B shows "This post changed in another window. Reload to see it." with Reload and "Copy your text"; Copy puts tab B's title and body on the clipboard; Reload shows "first"; nothing tab A saved was overwritten.
- **How the executor runs it:** Playwright (two pages, clipboard permission).

#### MV-28: Formatting toolbar
- **Steps:** select a word and press the Bold button, then Italic; select another word, Link → `https://example.com` → Apply; try `javascript:alert(1)`; insert an image and type alt text "Dark theme screenshot"; publish and inspect the public post. Repeat the selection on a 375px-wide viewport.
- **Expected:** the toolbar appears over the selection with pressed states; the bad link shows "Use a web address, like https://example.com."; the alt field is focused right after the image is inserted; the public post has bold, italic, the link and `alt="Dark theme screenshot"`; on the phone width the toolbar stays on screen. Selecting by touch on a real phone is `[user-only]`.
- **How the executor runs it:** Playwright.

#### MV-29: Abandoned new posts disappear
- **Steps:** click New post, then the back link without typing; click New post, add only the New label, go back.
- **Expected:** the list has no extra "Untitled post" for the first; the second stays as a draft.
- **How the executor runs it:** Playwright.

#### MV-30: Late scheduled posts
- **Steps:** stop the server; with the e2e admin token set a scheduled post's `publishAt` to 4 days ago and another's to 2 hours ago directly in the database (`sqlite3 web/e2e/.data/pb_data/data.db "UPDATE changelogs SET publishAt=…"`); start the server.
- **Expected:** at boot the 2-hour-late post publishes; the 4-day-late one is a draft and the banner says it didn't go out, with "It was due more than 3 days ago, so it wasn't published. Publish it now or pick a new time." in its editor.
- **How the executor runs it:** CLI + Playwright.

## Out of Scope

- Changelog emails, subscriber counts, the 7-day re-email rule, `lastEmailedAt` writes, the intro's email sentence (Phase 3).
- The `jobs` queue (Phase 3); `changelog.published` webhook and the changelog MCP tools (Phase 4).
- Realtime on changelog pages; merging edits from two windows (a conflict stops the save and offers Reload instead); revision history.
- RSS/Atom feeds, comments or reactions on posts, a "Shipped in" link on request pages.
- A Settings switch for the changelog (the pill follows published posts instead).

## Implementation Notes
Deviations and surprises (the interfaces in the plan are otherwise as built):
- **Font source.** google/fonts only ships the variable Bricolage TTF, so the static `BricolageGrotesque-ExtraBold.ttf` comes from the upstream repo it builds from (ateliertriay/bricolage, same OFL). `outputFileTracingIncludes` carries it into the standalone build.
- **"New" chip colour.** `primary-text` on `primary-soft` failed axe contrast, the same limit 2A hit (`primary-text` is only guaranteed on ground and surface). The chip keeps the tint and uses ink text. The editor's pressed label toggles keep the shared Toggle style.
- **Extra fields on the wire.** `TeamPost` carries `revision` (Publish prunes images, which bumps it, so lifecycle answers must update the editor's precondition). `EditorPost` adds `slugCustom`. `Post.cover`/`EditorPost.cover` are file names; the web builds URLs with `postFileUrl`.
- **Draft calls.** `updateDraft`, `addImage` and `removeImages` take `expectedRevision` and all return `SavedDraft` (`slug, updated, state, images, cover, revision`), not `string[]`: the queue needs the revision from every answer.
- **Autosave API.** Beyond the plan: `setCover(file|null): Promise<string>` (a queued op, so the dropzone can show its spinner), `reset(revision, images)` (Reload, Undo), `setRevision`, `current()` and `dirty()`. `discard()` drops what is pending but keeps the queue usable (Undo of an unpublish needs that). Status `"conflict"` is in the union as planned.
- **Slash menu.** `@tiptap/suggestion` 3.32 positions the popup itself (`props.mount`, floating-ui, outside-click), so the menu is a cmdk `Command` in a `ReactRenderer` mounted there rather than a Base UI popover on a virtual anchor. cmdk names its listbox through `label`, not `aria-label`.
- **Leaving the editor.** `lib/leave-guard.ts` (`setLeaveGuard`, `mayLeave`) lets the editor's back link and the sidebar links await `flush()`; when it fails, a `confirm()` asks before leaving.
- **Writing surfaces.** The title textarea and the Tiptap body drop the global focus outline (the caret shows focus), and Enter in the title focuses the editor view synchronously: Tiptap's `focus()` waits for an animation frame.
- **Calendar names.** react-day-picker's day names ("Thursday, October 22nd, 2026") failed axe `label-content-name-mismatch`; `dayLabel` names them "22 October 2026, today".
- **Preview's shipped list** filters visible requests on public boards only; `RequestItem` has no merged flag, but merged requests are closed and leave the public list anyway.
- `api.fail` passes hook `*router.ApiError`s through unchanged; the changelog errors are mapped there too.
- `test/setup.ts` skips `localStorage.clear()` in node-environment tests (the share card runs under `@vitest-environment node`).
- `go test -race` not run locally (no C compiler), as in 2A.

For the next stage: Phase 3's email hooks into `changelog.Service.publish` (one path for Publish and the cron) and `requests.Service.Ship`. `lastEmailedAt` exists but is never written. Real-device touch selection in Tiptap and the share card's look are `[user-only]`.
