# Lort: design spec

Date: 2026-10-15
Status: approved (functional design, visual direction "Dot vote", all page designs)

Lort is a free, open-source, self-hosted feedback board, roadmap and changelog for small apps. It is "Free UserJot": everything UserJot charges for, plus webhooks and an MCP server on every install. It ships as one Docker image that the owner builds with a setup script and starts with one `docker run`.

## Sources of truth

| What | Where |
|---|---|
| Product record (users, purpose, principles) | `PRODUCT.md` |
| Design system (tokens, rules, components) | `DESIGN.md`, plus the live Design System artifact https://claude.ai/artifact/A9Uo2hkwam4Q63WKpUhtVA |
| Component reference (visual only, like a Figma file) | `design/components/src/*.tsx`, styles in `design/components/lort.css`. Never copied into `web/`: see 2.3 |
| Approved page designs | Claude Design canvas https://claude.ai/artifact/EYjbK9CRgK2XvR1gFQov1v, page "Pages" (the "Directions" page holds the rejected explorations) |

When this spec and a canvas artboard disagree on layout, the artboard wins. When they disagree on behaviour, this spec wins.

## Positioning, voice and accessibility

- **Positioning:** Free UserJot. The landing page and README lead with it. Never invent customers, star counts or benchmarks.
- **Voice:** friendly and encouraging. Short sentences, sentence case, celebrates shipping, warm in empty states, never corporate. Applies to the dashboard, the setup scripts, emails, empty states and the landing page. Public-board copy speaks for the owner ("the team"), not for Lort.
- **Accessibility:** WCAG 2.2 AA in both themes, including owner-chosen primary colours. Full keyboard operation (roadmap drag-and-drop included), visible 3px focus rings, `prefers-reduced-motion` respected, icon-only statuses carry an accessible name.

---

# Part 1: Functional design

## 1. Hosting and setup

### 1.1 Where it runs
A VPS or any Docker host with persistent volumes (Hetzner, DigitalOcean, Railway, Fly). Vercel and Netlify are not supported, and the README says so in its first section. Minimum host: 1 GB RAM without voice, 2 GB with voice.

### 1.2 `lort setup`, with `setup.sh` (bash) and `setup.ps1` (PowerShell) as thin wrappers
The wizard is one Go subcommand, `lort setup`, so every OS gets the same steps in Lort's voice from one implementation. The wizard ships in the image and runs before Lort does, as a throwaway container. The two scripts only do what the host alone can know, then hand over:

1. Check for Docker (daemon reachable) and git. If either is missing, print the official docs link and the one-line install for the detected OS, then exit.
2. Check whether ports 80 and 443 are free.
3. Build the image: `docker build -t lort --build-arg LORT_VERSION=<git describe> .`
4. Run the wizard: `docker run --rm -it --entrypoint lort -v "$PWD":/work -v lort_data:/data lort setup --workdir /work --ports-free=<yes|no> --os=<linux|mac|windows>`. The wizard runs as root for this one run (so it can write `.env` into the folder and give it the folder owner's ownership) and creates the admin as the `lort` user.

Steps the wizard runs, in order:

1. **Requirements.** Already checked by the wrapper (above); the wizard only reports what the wrapper found.
2. **Public URL.** Ask for it (`feedback.yoursite.com`). Resolve its A/AAAA records and compare with this machine's public IP (fetched from a public echo service). On mismatch, explain how to add the record and offer to re-check or continue anyway.
3. **Admin account.** Ask for email, password, and password confirmation (hidden input, 8 to 71 characters: PocketBase's bcrypt limit). The wizard creates the superuser and its team profile directly in the `lort_data` volume, with the password read from the terminal and never passed as an argument or environment variable. The password is not written to `.env` or the container environment. If the volume already holds an admin, the wizard says so and skips this step (a changed email would only point at an account that doesn't exist).
4. **Email (optional).** "Send emails? (verification, 'it shipped', changelog)". Yes starts the Resend walkthrough: create an account → add the domain → add the DNS records it shows → paste an API key. The script verifies the key against the Resend API. A hidden "other SMTP" choice (type `smtp` at the prompt) asks for host, port, username, password and sender instead. No means every email feature is off.
5. **Voice dictation (optional).** Explain that it runs Whisper on the server. If total RAM is under 2 GB, warn and default to No.
6. **Cloudflare Turnstile (optional).** Ask for site key and secret.
7. **Ports.** Use the wrapper's answer for 80 and 443. Free: Lort terminates HTTPS itself (PocketBase's built-in Let's Encrypt autocert). Taken: Lort listens on plain HTTP `:4052`; the wizard prints a ready-to-paste nginx block and Caddy block for the URL (with HSTS), plus a short prompt the owner can hand to their coding agent ("Add a reverse proxy from feedback.yoursite.com to 127.0.0.1:4052 with HTTPS…").
8. **Write `.env`** (mode 600, in the working folder) with every answer except the admin password and a random 32-byte `LORT_ENCRYPTION_KEY`. Lines the owner added by hand (such as `LORT_PB_ADMIN=1`) are kept. If a `lort_data` volume or a `lort` container already exists but `.env` has no key, the wizard stops and explains: a new key could not read the old data.
9. **Print the run command** for the detected mode, exactly:
   - HTTPS mode: `docker run -d --name lort --restart unless-stopped --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER --security-opt no-new-privileges --log-opt max-size=10m --log-opt max-file=3 -p 80:80 -p 443:443 -v lort_data:/data --env-file .env lort`
   - Proxy mode: `docker run -d --name lort --restart unless-stopped --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER --security-opt no-new-privileges --log-opt max-size=10m --log-opt max-file=3 -p 127.0.0.1:4052:4052 -v lort_data:/data --env-file .env lort`

Re-running the script with an existing `.env` offers to keep each saved answer. Lort is deliberately one container started by one `docker run`, never Docker Compose: a vibecoder's agent should have one command to read.

### 1.3 Other script modes
- `--update`: creates a backup inside the running container (`docker exec lort lort backup create pre-update`), tags the current image `lort:previous`, runs `git pull`, rebuilds, then stops, removes and re-runs the container with the same command.
- `--rollback`: re-runs the container from `lort:previous` and restores the `pre-update` backup.
- `--reset-admin`: asks for an admin email and a new password (hidden input) and runs `docker exec -it -u lort lort lort reset-admin`. The Go subcommand asks for the email and reads the new password from the terminal, so it is never an argument and never in the process list, and says what went wrong (container not running, no such admin, bad password). The dashboard sign-in page points here ("Forgot it? On the server, run `./setup.sh --reset-admin`").

### 1.4 Configuration lifecycle
`.env` seeds the first boot. After that the database is the source of truth: email, voice, Turnstile and branding are changed in Settings, and `.env` values for them are ignored once a settings record exists. `LORT_ADMIN_EMAIL` / `LORT_ADMIN_PASSWORD` are a developer fallback, used only when no superuser exists; setup creates the admin in the volume and never writes them to `.env`. `LORT_URL`, `LORT_TLS` (`auto` or `off`) and `LORT_ENCRYPTION_KEY` are read on every boot. Secrets (SMTP password, API keys, S3 keys, Turnstile secret, webhook secrets) are stored encrypted with PocketBase's settings encryption using `LORT_ENCRYPTION_KEY`. No secret is ever baked into an image layer.

## 2. Architecture

### 2.1 Container
```
tini (PID 1)
└── entrypoint      starts as root only to chown /data, then drops to the `lort` user (uid 10001) with setpriv
    └── lort        Go binary, the only public listener
    ├── PocketBase (embedded as a Go framework): data, auth, realtime SSE, files, backups
    ├── TLS on :80/:443 via PocketBase's autocert (LORT_TLS=auto), or plain HTTP on :4052 (LORT_TLS=off)
    ├── reverse proxy: routes requests (2.2)
    ├── business logic: hooks, job queue, email, webhooks, trending, slugs
    ├── MCP server (official Go SDK, Streamable HTTP)
    ├── whisper.cpp runner (only when voice is on)
    └── supervises: node server.js   Next.js standalone on 127.0.0.1:3000
```
The Go binary starts Next, restarts it with backoff if it exits, and forwards SIGTERM for a graceful stop. Next does not receive `LORT_ENCRYPTION_KEY`. In proxy mode (`LORT_TLS=off`) Lort reads the visitor's address from `X-Forwarded-For` only when the connection itself comes from a loopback or private address; otherwise it ignores the header and uses the real address, so per-IP rate limits can't be dodged. With `LORT_TLS=auto` it trusts no header. `docker exec` commands run with `-u lort`. Everything persistent lives in the `/data` volume: `/data/pb_data` (database, uploads, backups, and certificates in `.autocert_cache`), `/data/models`.

### 2.2 Routing (inside `lort`)
| Path | Handler |
|---|---|
| `/api/*` (PocketBase REST, realtime SSE, files) | PocketBase |
| `/api/lort/*` | Lort's custom Go endpoints (config, request lists and the request page, vote, triage, merge, board moves, the Skip queue, dashboard stats, board and tag ordering, board deletion, transcribe, publish, similar, widget config, health) |
| `/mcp` | MCP server |
| `/widget.js` | Embeddable widget script (served by Go, cached) |
| `/_/` | PocketBase admin UI: disabled unless `LORT_PB_ADMIN=1` |
| everything else | Next.js, with an `X-Lort-Config` header carrying the brand |

Next never calls PocketBase from the server. The proxy always replaces `X-Lort-Config` on every page request (unpadded base64url JSON: app name, logo, primary colour, the landing-card and public-roadmap switches, public boards, tags, which features are on, and the version), so the root layout renders the owner's brand and favicon on the first paint and a visitor can't forge it. All data loads in the browser through the PocketBase JS SDK and TanStack Query, against the same origin, so every page renders its real shell with its own skeleton while it loads: the record API (guarded by hooks) creates requests and comments with images, and `/api/lort/*` handles everything with business rules. `GET /api/lort/requests/{id}` returns a request page in one response (request, images, merge target, timeline and comment `thread`), with visibility and internal notes decided in Go from the caller's token. The browser keeps two SDK clients: `pb` holds the board user's session (`localStorage` key `lort_user`) and `pbAdmin` the superuser's (`lort_admin`). Business rules (status transitions, vote counting, merges, email and webhook fan-out) live in Go, behind `/api/lort/*` or PocketBase hooks, never in Next.

### 2.3 Repo layout
```
server/        Go module: main, pocketbase hooks, jobs, mail, webhooks, mcp, whisper, tls, proxy, setup CLI subcommands
web/           Next.js (App Router, output: 'standalone') + shadcn/ui + Tailwind + Motion + Tiptap v3, pnpm;
               `pnpm start` runs the standalone server (scripts/start.mjs) the way the image does
  components/ui/     shadcn/ui components, added with the shadcn CLI
  components/lort/   Lort's components (VoteSticker, StatusIcon, TriageBar…), built from components/ui and Tailwind
docs/          Markdown docs, embedded in the Go binary and rendered at /dashboard/docs
mcp/docs.mjs   zero-dependency stdio MCP server exposing docs/ before Lort is installed
design/        the design: canvases and a reference build of the components (visual reference only, never copied into web/)
Dockerfile     multi-stage: Go build → Node build (pnpm) → slim runtime (debian-slim + node + tini)
setup.sh, setup.ps1
```
Frontend rules: `design/` is treated like a Figma file. It shows how the app looks and behaves; its React and CSS are not production code and are never copied, ported or imported into `web/`. The UI is built with shadcn/ui components and styled with Tailwind utility classes. Use the shadcn component for anything shadcn has (button, input, textarea, switch, checkbox, badge, tabs, table, dialog, popover, dropdown menu, sheet, tooltip, command, avatar, skeleton, toast/sonner, and so on), customised through its variants and Tailwind classes; build only what shadcn lacks (the vote sticker, status icons, the triage and floating bars) from shadcn parts and Tailwind. Lort's tokens are Tailwind theme variables (`@theme` in `globals.css`), with shadcn's theme variables mapped onto them; no hand-written component CSS. shadcn components are added with `pnpm dlx shadcn@latest add …`, never written from memory. The project is created with `pnpm dlx shadcn@latest init -t next`. Icons are Tabler (`@tabler/icons-react`, outline, 2px stroke); statuses and stickers use Lort's own SVG components. No Unicode glyphs as icons.

## 3. Data model (PocketBase collections)

| Collection | Fields | Notes |
|---|---|---|
| `users` (auth) | name, avatar, isAdmin, banned, verified, notify {shipped, changelog, replies}, unsubscribeToken | Name defaults to the part of the email before the @. Banned users can sign in and read but cannot post, vote or comment. |
| `boards` | name, order, isPublic, requireApproval | The top board is the default for new suggestions. Private boards are visible to the team only. |
| `tags` | name, order | Admin-managed. Users pick from them when suggesting. No colours (status colours are reserved). |
| `requests` | board, author, title, body, images (≤3), tags, status, visible, awaitingApproval, upvoteCount, trendScore, mergedInto, teamSeenAt, created, updated | `visible=false` hides it from the public board. `teamSeenAt` null drives the "New" marker. Images are protected files: they follow the request's view rule, so public ones load without a token and hidden ones need a PocketBase file token. |
| `votes` | user, request | Unique (user, request). The author's vote is created with the request, in the same transaction. Deleting a vote by any route (including a deleted account's cascade) recounts its request in the same transaction. |
| `comments` | request, author, parent, body, images (≤3), internal | One level of replies: `parent` must be a top-level comment. Internal comments are team-only. Images are protected like request images. |
| `activity` | request, actor, kind (status_changed, merged_in, merged_from, board_changed, created), from, to | The request timeline. |
| `changelogs` | title, slug, body (markdown), cover, labels (New/Improved/Fixed), requests, state (draft/scheduled/published), publishAt, publishedAt, lastEmailedAt, completeAttached | |
| `settings` | single record: branding, roadmap, email, voice, turnstile, widget, backups, update check | Secret fields encrypted. |
| `api_keys` | name, hash (sha256), prefix, scope (read/full), lastUsedAt, createdBy | The full key is shown once at creation. |
| `webhooks` | url, kind (generic/discord/slack, detected), events, upvoteThreshold, secret, active | |
| `webhook_deliveries` | webhook, event, payload, status, httpStatus, attempt, nextAttemptAt, responseSnippet | Kept 30 days. |
| `jobs` | kind, payload, runAt, attempts, state (queued/running/done/failed/cancelled), lastError | Durable queue (section 9). |

Admins are PocketBase superusers. Each superuser is linked by email to a `users` record with `isAdmin=true`, which is what their public comments and votes are attached to (shown with a Team badge). Only superusers can sign in to `/dashboard`.

Access rules: public collections are readable by anyone for public boards and visible requests. Requests and comments are created through PocketBase's record API (so image uploads work natively), guarded by API rules and Go hooks that force the author, status, visibility and counts and enforce bans, the honeypot, approval boards and one-level replies. Votes, triage, merges and team actions go through `/api/lort/*`. Admins act on the public board as their linked `users` profile: `GET /api/lort/team/me` gives the dashboard a token for it. The dashboard renews it on every load, for the admin session that asked only: an answer that arrives after that session signed out is dropped, and only a 401 or 403 for that same session signs the admin out (aborted requests and network errors keep the session).

Rule details that matter for security:
- "Your own record" rules always check `@request.auth.id != ''` as well as the author, because deleting an account empties its `author` fields and an empty author would otherwise match an anonymous visitor.
- Authors can edit the title, body, images and tags of their own request while it is Pending. They can't change its board: boards decide visibility and approval, so moving a request is a team action (the board chip on the dashboard, which writes a `board_changed` timeline entry).
- A request, its author's vote and its "created" timeline entry are saved in one transaction, and the API reply waits for the commit, so it carries the real vote count.
- The team can post a request for someone who asked: the create carries `onBehalf` (an email). The create hook finds that user, or creates an unverified one, and makes them the author, with their vote and the "created" entry, in the same transaction; a bad email saves nothing. Only team profiles may send it.
- When the team makes a request visible, it stops awaiting approval.
- Deleting a top-level comment deletes its replies in the same transaction, on every route (`parent` is a text field, so PocketBase has no cascade for it).
- Internal comments' images are team-only even on a public request, so the dashboard asks for a superuser file token whenever the thread holds one.

## 4. Statuses, triage and merging

### 4.1 Statuses
Pending → Reviewing → Planned → In progress → Completed, plus Closed outside the line. **Planned means "on the roadmap".** Each status has its own SVG icon (section 14.4).

### 4.2 Triage bar actions
| Status | Actions (left to right; the last is the primary) |
|---|---|
| Pending | Close · Merge · Skip · Accept |
| Reviewing | Close · Merge · Skip · Add to roadmap |
| Planned | Re-review · Start working |
| In progress | Complete |
| Completed | Reopen |
| Closed | Reopen |

- Accept → Reviewing. Add to roadmap → Planned. Re-review → Reviewing. Start working → In progress. Complete → Completed. Reopen from Completed → In progress; Reopen from Closed → Pending.
- **Skip** opens the next request in the current filtered queue without changing anything.
- No keyboard shortcuts for triage actions.
- Moving onto or off the roadmap (entering or leaving Planned/In progress/Completed from or to Pending/Reviewing/Closed) shows a toast that names it ("Added to the roadmap", "Taken off the roadmap").
- **Complete** queues the shipped emails and the `status_changed` webhook as jobs 60 seconds out and shows an Undo toast with a 60-second countdown ("Marked as completed · 61 people will be notified"). Undo cancels the jobs and restores the previous status. The status change itself is saved immediately.
- Accepting a request on a "Needs approval" board also makes it visible.
- Every status change writes an `activity` row.

### 4.3 Merge
Merge opens a picker (search by title) for the target request. On confirm:
- the source becomes Closed with `mergedInto` set and a timeline entry on both requests;
- every upvoter of the source who has not voted on the target gets a vote on the target; `upvoteCount` is recomputed;
- the source page shows "Merged into <target>" with a link (only if the source was public; a hidden or private request stays hidden after a merge); the source no longer appears on the board;
- the `request.merged` webhook fires.

### 4.4 Trending
`trendScore = upvoteCount / (ageHours + 2) ^ 1.5`, stored on the request. Recomputed on every vote change and by an hourly job for all open requests. The hourly job writes only `trendScore`, skips a request whose vote count changed since it was read, and leaves `updated` alone so "Recently updated" stays meaningful. Newest sorts by `created`.

## 5. Public site

The public site carries the owner's brand: app name, logo and primary colour. "Lort" appears only in the footer ("Powered by Lort", always) and the optional "Get your own board like this" card.

### 5.1 Pages
- **`/feedback`** (the board, also `/`):
  - Headline "Got an idea for <App>?" and an encouraging intro.
  - One column of request cards.
  - Top-bar search uses FTS5 over title and body and forgives typos: every word must match, either as a prefix or as any indexed word within one edit (two from 8 letters; swapped neighbours count as one edit). Words under 4 letters only match as prefixes. The field follows the URL (back and forward, Clear filters).
  - The floating bar holds:
    - Trending/Newest sort tabs.
    - A Board drop-up, hidden when there is only one public board.
    - A Status drop-up that defaults to the four open statuses and reads "Open ideas".
    - The primary "Suggest something".
  - Sort and filters live in the URL.
  - Infinite scroll in pages of 20.
  - The author sees their own requests that are awaiting approval, marked "Waiting for approval".
- **`/feedback/<id>`:**
  - Shows the request title, author and time, the vote sticker ("Stick a dot"), the body and images, and the status as a timeline entry.
  - Comments are threaded one level deep, and team members carry the Team badge.
  - The composer is for signed-in users and includes images, plus the mic when voice is on.
  - There are no voter avatars and no "N people want this" line.
  - A "Merged into" banner appears when the request was merged.
- **`/roadmap`:**
  - Read-only, with three columns: Planned, In progress and Completed.
  - Each item shows a read-only sticker, title, board and a "Planned 3 weeks ago" style line.
  - The Completed column shows the last 30 days, with a "View all N shipped" link that opens a paginated list.
  - When the roadmap is turned off in Settings, the nav pill disappears and `/roadmap` shows a friendly "No public roadmap yet" message. The nav only ever shows pages that exist in the running build (Roadmap and Changelog join in Phase 2).
- **`/changelog`:**
  - Posts are listed newest first, each with its date, label chips, title and excerpt.
  - A label filter (All, New, Improved, Fixed) lives in the URL.
  - The intro tells people that signing in with a verified email gets them these posts by email. That line only appears when email is on.
- **`/changelog/<slug>`:**
  - The post shows its date, labels, title, cover image, body, and a "Shipped in this update" list of the attached requests with their authors.
  - Share has a copy-link action, plus an Open Graph image: the cover, or a generated card from the title.
- **`/lort-landing`:** Lort's own landing page (section 14.6).
- **Sign up, sign in, verify and reset:**
  - They happen in dialogs, not pages: the account dialog opens from the top bar, from a sticker and inside Suggest something. The only auth pages are `/reset-password` (where the team's "Copy password reset link" points) and the dashboard's sign-in and invite pages.
  - Sign up asks for email and password only.
  - When email is on, sign-up is followed by "Check your inbox", with Resend and "Skip for now" ("You can still suggest and vote. You just won't get emails.").
  - When email is off, there is no verify step and no reset-by-email.
- **Account menu** (opened from the avatar): name and email, "Your profile", "Dashboard" for team members, and Sign out.
- **Profile dialog** ("Your profile"):
  - Name and avatar.
  - Notification switches for "It shipped", "Changelog" and "Replies from the team", hidden when email is off.
  - Sign out.

### 5.2 Suggest something (modal)
Opened from the floating bar, the phone "+", or the widget. It requires sign-in; a signed-out visitor gets the sign-in/up step inside the modal and returns to the form.
- **Board** pills (hidden with one public board).
- **Title**, with similar-request suggestions after 3 characters (debounced 300 ms, the board's typo-tolerant search over title + body, up to 3 results). Each suggestion shows status, title, board and a live vote sticker ("Is it one of these? A dot counts the same as a new post.").
- **Tags** (optional), picked from the admin list.
- **Details**: the Composer, with images (≤3, 5 MB each) and the mic when voice is on. Its send button submits the whole form. For admins the Composer also shows the Public/Internal toggle; Internal creates the request hidden from the public board.
- On a "Needs approval" board the request is created hidden and awaiting approval.
- The author's vote is added automatically.

### 5.3 Votes
One vote per user per request, toggled by the sticker. Signed-out visitors who click a sticker get the sign-in step and the vote is applied after. Optimistic UI everywhere the request is cached; on error each cached copy (lists, the detail page) goes back to its own previous vote fields and every other request is left alone. One vote per request is in flight at a time: clicks on it while its vote is on the way are ignored, so a late answer can't overwrite a newer one. Votes on Closed or merged requests are not possible (sticker becomes static). People can only vote on requests they can see: public ones, their own, or any request for team members; anything else answers "not found".

### 5.4 Comments
Signed-in, non-banned users can comment and reply (one level). Authors can delete their own comments; admins can delete any. Deleting a comment deletes its replies. Admin public comments email the request author and earlier commenters (category "Replies from the team"). Internal comments are visible to the team only and never trigger email or the public webhook payload.

### 5.5 Embeddable widget
`<script src="https://feedback.yoursite.com/widget.js" async></script>` adds a floating "Feedback" button (or binds to any element with `data-lort-feedback`). It opens an iframe modal containing the Suggest something form, with sign-in inside the iframe using `Partitioned` (CHIPS) cookies. After submitting, the widget links to the request on the board. The widget never shows the "Get your own board" card. No SSO.

### 5.6 Freshness
Lists subscribe to PocketBase realtime (SSE). New requests appear at the top with a `primary-soft` tint that fades. If the SSE connection drops, the page polls every 3 minutes until it reconnects. The dashboard's requests table also has a manual refresh button, rate-limited to once per 10 seconds; the public board relies on realtime alone.

### 5.7 Anti-spam
Always on: per-IP and per-user rate limits (sign-up, request creation, comments, votes, transcription) returning 429 with a friendly toast, and a hidden honeypot field on sign-up and suggest. Optional: Cloudflare Turnstile (invisible) at sign-up.

## 6. Dashboard (`/dashboard`)

Sign-in is for superusers only. The sidebar has Requests (with an "N new" badge), Roadmap, Changelog, then Docs and Settings at the bottom, then the signed-in admin with the Lort version (its menu has View the board and Sign out). A dashboard session also signs the admin in on the board as their linked team profile (section 3), so their comments carry the Team badge. It collapses to a 76px icon rail (remembered per browser); in the rail the labels are hidden visually but kept for screen readers. The sidebar only shows pages that exist in the running build (Roadmap and Changelog join in Phase 2, Docs in Phase 6). Below 768px the sidebar becomes a top bar with a menu sheet.

### 6.1 Requests (`/dashboard/requests`)
- Header: title, "142 total · 38 waiting for you" (waiting = Pending + Reviewing), a Live indicator, refresh button, and "New request" (opens Suggest something as the admin's board profile, optionally on behalf of an email, in one save: see section 3). The counts come from `GET /api/lort/stats`, which leaves merged requests out.
- Filters (all in the URL; the search field follows it, and Clear filters also drops a search that hasn't reached the URL yet): search, Status (defaults to the four open statuses, summarised "Open"), Board, Tags, Visibility (On the board / Hidden), and sort (Newest, Oldest, Most upvoted, Recently updated).
- Table columns: status (icon only, with tooltip and `aria-label`), request title with "New" and "Hidden" markers, votes, tags, date, requested by. Rows the team has not opened yet have the `primary-soft` tint and count toward the sidebar badge; opening a request sets `teamSeenAt`.
- Infinite scroll; realtime inserts; the rate-limited refresh button.

### 6.2 Request (`/dashboard/requests/<id>`)
The same layout as the public request page, plus:
- Breadcrumb "Requests / <Board>" and "3 of 12 in Reviewing" for the current queue. The queue is the requests table's filters, carried in the request page's URL; Skip opens the next request in it.
- Editable chips: status (opens a menu with the triage bar's moves, minus Merge and Skip, so the server's transition rules are the only rules), board (moved through `POST /api/lort/requests/{id}/board`, which adds a `board_changed` timeline entry), tags, "add tag", and the "On the board" visibility switch.
- Composer with the Public/Internal toggle, images and mic.
- Timeline with status changes, internal notes (note style, "Only the team sees this") and threaded comments.
- Avatar popovers with email, join date, request and vote counts, verification state, **Copy password reset link** (works without email) and **Ban**/Unban.
- An overflow menu with Edit (title, body) and Delete (confirm; fires `request.deleted`).
- The floating TriageBar (section 4.2).

### 6.3 Roadmap (`/dashboard/roadmap`)
Three collapsible columns (Planned, In progress, Completed) with drag-and-drop between them (dnd-kit with its keyboard sensor: Space to lift, arrows to move, Space to drop). Dropping into Completed behaves exactly like Complete (60-second Undo toast). Completed shows the last 30 days.

### 6.4 Changelog (`/dashboard/changelog` and `/dashboard/changelog/<id>`)
- **List:** title, labels, state ("Draft · edited 2 min ago", "Scheduled · 21 Oct, 09:00", "Published · 9 Oct"), attached request count, author. Filters for state and label. "New post".
- **Editor:**
  - Tiptap v3 storing markdown. It autosaves (debounced 1 s) and shows "Saved".
  - There's a slash menu for heading, bulleted list, numbered list, image, quote, code and divider.
  - The cover image dropzone notes "Also used when the post is shared. Without one, Lort makes a card from the title."
  - Label toggles: New, Improved, Fixed.
  - "Shipped in this update" holds the attached requests, with an "Attach a request" search.
  - The slug field shows `/changelog/` plus the slug. It defaults to the first 6 words of the title in kebab case and can be edited while the post is a draft. It's fixed once the post has been published.
  - Preview.
- **Publish menu:**
  - **Publish now** says who gets emailed: "Goes live and emails N verified subscribers".
  - **Schedule…** opens a calendar plus a time field ("Schedule for 21 Oct").
  - The checkbox "Also mark the N attached requests as Completed when it goes live" completes them at publish time without the 60-second delay.
- **After publishing:**
  - A published post is read-only and cannot be edited.
  - **Unpublish** moves it back to draft, where it can be edited.
  - Republishing only sends the email again if at least 7 days have passed since `lastEmailedAt`.
  - Scheduled posts can be unscheduled back to draft.
- **Scheduled publish:** done by a job at `publishAt`. If it fails, the post goes back to draft and the dashboard shows a banner.

### 6.5 Docs (`/dashboard/docs`)
The `docs/` markdown rendered with a sidebar: getting started, setup script, updating and rollback, reverse proxies, email, voice, widget, MCP, webhooks (with payload reference and signature verification), backups, troubleshooting.

### 6.6 Settings (`/dashboard/settings`)
One page with an in-page table of contents grouped as **Your board** (Branding, Boards, Tags, Roadmap, Team), **Services** (Email, Voice dictation, Spam protection), **Connect** (Widget, MCP server, Webhooks), **Server** (Backups, Updates). Each section saves on change with a toast. The table of contents highlights the section you're on; a section you jump to stays highlighted until you scroll yourself, and the last one is highlighted at the bottom of the page.
- **Branding:**
  - App logo (square PNG, SVG or WebP, at least 128px). The fallback is the first letter on primary with a −4° tilt.
  - The logo is also the favicon: PocketBase's 64x64 thumb of it (an SVG logo as it is). Without a logo, the favicon is the letter mark, drawn as an SVG.
  - App name, used in the top bar, emails and the browser tab.
  - Primary colour: the 8 presets in section 14.2 plus a custom hex, with a preview swatch the size of the presets.
  - Switch: "Show 'Get your own board' card".
- **Boards:** drag to reorder; per board Public and Needs approval switches; the top board is the default; add, rename, delete (only when empty, or move its requests to another board first).
- **Tags:** add, rename, reorder, delete (removes it from requests).
- **Roadmap:** "Show the roadmap publicly".
- **Team:** admins with "You", invited date, Remove; "Invite an admin" creates a pending superuser and an invite link (emailed when email is on, otherwise shown to copy) valid 7 days. If the invitee's email already has an unverified board account, its password and sessions are revoked when it becomes a team profile, because anyone can sign up with an unverified email.
- **Email:** status card ("Connected through Resend · Sending as … · N verified subscribers"), Send a test email, Change (guided Resend or SMTP form). Turning email off disables every email feature and queues nothing.
- **Voice dictation:**
  - Switch: "Let people dictate comments".
  - The section shows the model, its size and the memory it uses.
  - Turning it on downloads the model if it's missing, with progress shown in the section.
- **Spam protection:** explains the always-on limits; Turnstile switch with site key and secret.
- **Widget:** snippet with Copy, and "Preview the widget".
- **MCP server:** keys table (name, prefix, Read-only/Full, last used, Revoke), "Create a key" (shows the full key once), install snippets in tabs: Claude Code, Codex, Cursor, VS Code, Gemini CLI (section 8.3).
- **Webhooks:**
  - The list shows each webhook's URL, its detected kind (Discord, Slack or generic), its events, the upvote threshold, and the last delivery status ("Delivered · 3 min ago", "Failed (500) · retrying in 5 min").
  - Add a webhook.
  - Each webhook has a delivery log with Redeliver.
- **Backups:** last backup, size, next run, Back up now, Download; "Also copy to S3-compatible storage" (endpoint, bucket, region, keys); Restore from a backup (confirm with the board name; restarts the app).
- **Updates:** current version and status ("up to date" or "1.2.0 is available"); instructions to run `./setup.sh --update`.

## 7. Email

Sent over SMTP (Resend's SMTP endpoint when set up through the Resend walkthrough). Templates are simple HTML plus plain text, branded with the owner's logo, name and primary colour, written in Lort's voice on the owner's behalf.

| Email | To | When |
|---|---|---|
| Verify your email | new user | sign-up |
| Reset your password | user | on request |
| It shipped | request author and all upvoters (verified, opted in) | 60 s after Completed, unless undone |
| New in <App> (changelog) | all verified users opted in | on publish, if `lastEmailedAt` is empty or ≥7 days old |
| Reply from the team | request author and earlier commenters (verified, opted in) | an admin posts a public comment |
| Admin invite | invited admin | Team → Invite |

Every non-transactional email has a one-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post`) for that category and a link to unsubscribe from everything, using `unsubscribeToken`. Sends go through the job queue with retries; a final failure fires `email.failed`. When email is off, none of these exist in the UI and nothing is queued.

## 8. Integrations

### 8.1 Webhooks
- **Events:**
  - `request.created`, `request.status_changed`, `request.merged`, `request.deleted`, `request.upvote_threshold`
  - `comment.created` (public comments only)
  - `changelog.published`
  - `user.signed_up`
  - `email.failed` (only offered when email is on)
- **Upvote threshold:** `request.upvote_threshold` fires once per request per webhook, when its `upvoteCount` first reaches the webhook's threshold N.
- **Payload:** `{ id, event, createdAt, data }`, where data holds the full object and, for status changes, `from` and `to`.
- **Signature:**
  - The `X-Lort-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">` header is built with the webhook secret.
  - `X-Lort-Event` and `X-Lort-Delivery` headers are sent too.
- **Discord and Slack:** these URLs are detected automatically and get a formatted message instead of raw JSON. They aren't signed.
- **Retries:** after a non-2xx response or a timeout of 10 s, retries happen at 1m, 5m, 30m, 2h and 12h. After that the delivery is marked failed.
- **Delivery log:** every attempt is logged, and any delivery can be redelivered.

### 8.2 MCP server
Streamable HTTP at `/mcp`, authenticated with `Authorization: Bearer lort_…`. Read keys see read tools only; full keys see everything.

- **Read tools:** `list_requests` (filters, sort, search), `get_request` (with comments and timeline), `find_similar`, `list_boards`, `list_tags`, `get_roadmap`, `list_changelogs`, `get_changelog`, `get_settings` (no secrets), `list_webhooks`, `list_users`, `search_docs`, `read_doc`.
- **Full tools:**
  - **Requests:** `create_request`, `update_request` (title, body, board, tags, visibility), `set_status`, `merge_requests`, `delete_request`.
  - **Comments:** `add_comment` (public or internal), `delete_comment`.
  - **Changelog:** `create_changelog_draft`, `update_changelog_draft`, `publish_changelog`, `schedule_changelog`, `unpublish_changelog`.
  - **Boards and tags:** `create_board`, `update_board`, `create_tag`, `update_tag`, `delete_tag`.
  - **Users:** `ban_user`, `unban_user`.
  - **Settings:** `update_settings` (branding, roadmap, voice and widget only).
  - **Webhooks:** `create_webhook`, `delete_webhook`.
- **Human-only, never exposed:** managing admins, creating or revoking keys, backup restore, email credentials.
- `set_status` to Completed is immediate over MCP: there's no undo window, and the tool description says so.
- **Safety:**
  - Every piece of user-written text in results is wrapped in `<untrusted_user_content>…</untrusted_user_content>`, and the server instructions tell the agent to treat it as data.
  - Destructive tools carry `destructiveHint: true`, and read tools carry `readOnlyHint: true`.
  - Rate limits are per key.
  - Every MCP write is logged in `activity` with the key name as the actor.

### 8.3 Install snippets (Settings → MCP server)
- Claude Code: `claude mcp add --transport http lort https://<url>/mcp --header "Authorization: Bearer <key>"`
- Codex: `codex mcp add lort --url https://<url>/mcp --bearer-token-env-var LORT_API_KEY` (plus `export LORT_API_KEY=<key>`)
- Cursor: a deeplink `cursor://anysphere.cursor-deeplink/mcp/install?name=lort&config=<base64 JSON>`, with the `mcp.json` block shown as the fallback (header support in the deeplink is unverified, so the JSON is always visible)
- VS Code: `code --add-mcp '{"name":"lort","type":"http","url":"https://<url>/mcp","headers":{"Authorization":"Bearer <key>"}}'`
- Gemini CLI: `gemini mcp add --transport http lort https://<url>/mcp --header "Authorization: Bearer <key>"`

### 8.4 Docs MCP before install
`mcp/docs.mjs` is a dependency-free Node stdio MCP server with `search_docs` and `read_doc` over `docs/`, so an agent can read setup docs straight from a clone (`claude mcp add lort-docs -- node mcp/docs.mjs`).

### 8.5 Voice dictation
whisper.cpp with the q5 quantised large-v3-turbo model. The model downloads to `/data/models` on first boot with voice on (or when turned on in Settings) and the download is checksum-verified. The mic button records in the browser (MediaRecorder, max 2 minutes), uploads to `/api/lort/transcribe` (rate-limited per user, one transcription at a time on the server, queued otherwise), and inserts the text at the caret. Available to every signed-in user in every Composer when voice is on; the mic is not rendered when it is off. On failure the mic shows an inline error and typed text is kept.

## 9. Jobs, backups and updates

- **Job queue:** the `jobs` collection is polled every second by one worker pool in Go. It handles:
  - the 60-second Complete window
  - email sends
  - webhook deliveries and retries
  - scheduled changelog publishing
  - trending recompute (hourly)
  - the daily update check
  - nightly backups

  On startup, jobs left in `running` go back to `queued`. Each job type has its own retry policy.
- **Backups:**
  - PocketBase's built-in backups run nightly at 03:00 server time and the last 7 are kept.
  - S3-compatible storage is optional.
  - "Back up now" and Download are in Settings, along with a restore that needs confirmation.
  - `--update` always takes a backup first.
- **Update check:** once a day Lort asks GitHub Releases for the latest version. If there's a newer one, the dashboard shows a dismissible banner and Settings → Updates shows the version. Lort never updates itself.

## 10. Branding rules

- "Powered by Lort" is always in the public footer.
- The floating "Get your own board like this" card on public pages can be switched off. It is always hidden in the widget and links to `/lort-landing` (to the GitHub repository until `/lort-landing` ships in Phase 6).
- The owner's name, logo and primary colour lead on public pages. Lort's identity leads on `/lort-landing`, the dashboard sign-in footer and the docs.

## 11. Errors

- 429s show a friendly toast with when to try again.
- Failed jobs land in the delivery log (webhooks) or fire `email.failed` (email); the dashboard shows a banner if email has failed 5 times in an hour.
- Whisper failure: inline error under the mic, typed text untouched.
- Scheduled publish failure: the post returns to draft, a dashboard banner explains why.
- Upload errors (over 5 MB, more than 3 images, not an image) appear inline in the Composer.
- Network loss: optimistic actions roll back with a toast; realtime falls back to polling.
- Every form validates inline on blur and on submit, with errors that name the problem and the fix.

## 12. Testing

- **Go unit tests:** status transitions and triage rules, merge (vote moving and dedupe), trending score, slug generation and stability, HMAC signing, job queue (scheduling, cancel/undo, retry, crash recovery), email gating (7-day rule, opt-outs, email off), webhook threshold firing once, the `lort setup` wizard (answers to `.env`, kept lines, password limits, DNS verdicts, key-mismatch stop) and `reset-admin`.
- **Go integration tests** against a PocketBase test app: API rules, `/api/lort/*` endpoints, MCP tools per scope (read keys cannot call full tools, human-only tools absent).
- **Vitest:** frontend logic (filters to URL, optimistic vote, primary colour contrast adjustment, composer limits).
- **Playwright e2e:** sign up, suggest with similar suggestions, vote, comment, triage through every status with undo, roadmap drag with mouse and keyboard, changelog draft → schedule → publish, settings toggles hide features. Run in both themes; axe checks on every page. The suite runs against the real stack: `web/e2e/start.sh` builds the Go server and the Next.js standalone output and starts `lort` on a throwaway data directory, and global setup seeds boards and tags and turns Lort's rate limits off (the suite signs up more people per minute than one IP is allowed).
- **CI:** builds the image, runs the Go and web tests, Playwright against the built container, `shellcheck setup.sh` and `PSScriptAnalyzer` on `setup.ps1`.

## 13. Build phases

Each phase ends with a working container.

1. **Foundation:**
   - Covers: the container, setup scripts (including `--reset-admin`), the Go binary with routing and TLS, auth, boards, tags, requests, votes and comments.
   - Pages: the public board and request page, the dashboard requests table, the request page with triage and merge, and the Settings sections for Branding, Boards, Tags and Team.
   - The design system rebuilt in `web/` with shadcn/ui and Tailwind (2.3), plus skeletons for these pages.
2. **Roadmap and changelog:**
   - The public and dashboard roadmaps.
   - The changelog editor with scheduling, and the public changelog pages.
3. **Email:** SMTP, templates, verification and reset, the three notification categories, unsubscribe, and Settings → Email.
4. **Webhooks and MCP:** both features, plus API keys and their Settings sections.
5. **Voice, widget, backups and updates:**
   - Voice dictation, the widget, Spam protection and Turnstile.
   - Backups with S3, `--update` and `--rollback`, and the update check.
6. **Landing and docs:** `/lort-landing`, `/dashboard/docs`, `mcp/docs.mjs` and the README.

---

# Part 2: Visual design

The full token tables and component rules are in `DESIGN.md`. This part fixes the decisions an implementer needs and the page-by-page layouts.

## 14. Visual system ("Dot vote")

### 14.1 Concept
"The Dot-Vote Wall": a workshop wall where people stick round dots on the ideas they want. The interface stays warm, plain and quiet so the vote stickers, the status circles and the owner's brand carry the screen.

### 14.2 Colour
- Dark theme first: warm charcoal ground `#1a1716`, card surface `#24201e`, raised surface `#2c2725`, button surface `#352f2c`, sunken `#151211` (sidebar). Light theme: ground `#f3f1ef`, white cards, raised `#efeae6`. Theme follows the visitor's system setting.
- Ink `#f5efea` / `#1e1a18`, ink-2 for body, muted `#b3a79e` / `#655b55` for meta.
- **Primary** is the owner's colour (demo and Lort default: Pink `#cc3a6d`). Presets in Settings: Pink `#cc3a6d`, Coral `#d4553a`, Amber `#b7791f`, Leaf `#2f855a`, Teal `#0f8a8a`, Ocean `#2563eb`, Grape `#7c4dcc`, Graphite `#4b5563`, plus a custom hex. For any primary, Lort derives `on-primary` (white or ink, whichever reaches 4.5:1; if neither does, the primary's OKLCH lightness is nudged until one does), `primary-text` per theme (lightness-adjusted to 4.5:1 on ground and surface) and `primary-soft` (a low-alpha tint). The root layout injects `--primary`, `--primary-foreground` and `--primary-text` as CSS variables; `primary-soft` is mixed from `--primary` in CSS (`color-mix`).
- **The Owner's Colour Rule:** primary means "live" (voted, selected, primary action) and never decorates. Exception: `/lort-landing` (14.6).
- **Status colours** are for statuses only: Pending yellow, Reviewing orange, Planned sky, In progress violet, Completed green, Closed red; icon values ≥3:1 and `status-*-text` values ≥4.5:1 on every ground in both themes (values in `DESIGN.md`).
- Internal notes use their own note palette (`note-bg`, `note-border`, `note-ink`), nowhere else.

### 14.3 Type, shape, elevation, motion
- **Fonts:** Bricolage Grotesque (700/800) for headlines and vote counts, Figtree (400–700) for everything else, both self-hosted through `next/font`. Scale: display-xl 44/46, display-l 34/38, title 20/25, count 17 tabular, body-lg 17/26, body 15/23 (max 68ch), label 14/20, caption 13/18, micro 11/14. Sentence case everywhere; no eyebrows above headings; no uppercase tracking labels.
- **Shape:** pills for everything clickable (buttons, chips, tabs, inputs, nav, bars); soft rectangles for containers (cards 18px, composer and modals 22px, menus 16px, thumbnails and logo mark 10px); circles with a light keyline for stickers, status icons and avatars.
- **Elevation:** tonal layering first. Drop shadows mean "stuck on" (sticker shadow) or "floating" (float, card float). The only inset shadow is `shadow-inset-sm` (`inset 0 1.7px 2.55px -0.85px` at 0.9 black in dark, `rgba(60,30,20,0.2)` in light), used on the SortTabs track, FloatingBar, TriageBar, toasts and the "Get your own board" card, layered with Float on floating elements.
- **Tilt:** voted stickers −7°, logo mark −4°, nothing else (exception: `/lort-landing` hero cards).
- **Motion (Motion library):** the sticker slap (scale 1.15 → 1 and rotate to −7° in ~220 ms, spring) and peel (160 ms); the SortTabs indicator slides (`layoutId`); toasts and bars rise in; realtime "new" tints fade. Everything is instant under `prefers-reduced-motion`.
- **Focus:** 3px solid ring in `focus` with 3px offset on every focusable element.
- **Icons:** Tabler outline, 2px stroke; GitHub mark is Tabler `brand-github`.

### 14.4 Components
Build each component in `web/` with shadcn/ui and Tailwind, following the frontend rules in 2.3. `design/components` and the canvases show how each one looks and behaves; match that, but never copy their code or the `lt-` CSS. Where shadcn has the component (Button, Input, Textarea, Switch, Checkbox, Badge, Tabs, Table, Dialog, Popover, DropdownMenu, Command, Calendar, Sheet, Tooltip, Avatar, Skeleton, Sonner), add it with the CLI and give it Lort's look through variants and Tailwind classes. The rules below describe the result, not the reference code.

| Component | Rules |
|---|---|
| StatusIcon | 16px circle (14–24 allowed; 38 on the landing pipeline), ring + 30% tint + fill rising from the bottom at 0/28/50/80/100%, check for Completed, cross for Closed. Optional keyline. |
| StatusText | A status as coloured text, no icon. |
| **Status Label Rule** | Wherever a status appears: icon + label in ink, or coloured text alone. Never both, never neither. Icon-only (requests table) needs a tooltip and `aria-label`. |
| VoteSticker | 58px (40px compact). Empty: dashed Dot Spot ring with the count. Voted: primary fill, 3px keyline, −7°, sticker shadow. Read-only variant for the public roadmap. Accessible name "Upvote <title>, N votes" / "Remove your upvote…". |
| Button | Primary, secondary, ghost, danger-text pills; 42px (32px small); one primary per view; no filled red buttons. |
| Chip | 34px pills for status, board, tag, add-tag and the visibility switch. |
| SortTabs | Trending / Newest; sliding ink indicator; inset-sm track. |
| FilterMenu | Multi-select drop-up/down with custom checkboxes and Clear at the bottom; summary text on the trigger. |
| FloatingBar | Sort tabs, Board filter (hidden with one board), Status filter ("Open ideas"), primary "Suggest something". Compact phone version: sort tabs, one filter button (bottom sheet), round 48px "+". |
| RequestCard | Sticker left; title, two-line excerpt, meta row (status icon + label, board pill, author avatar + name, comment count, "Waiting for approval" when relevant). |
| Composer | Prompt-box field; up to 3 image thumbnails with remove; Public/Internal toggle for admins only (no chevron, flat in Public with a hover fill, borderless note-tint in Internal); mic only when voice is on; round primary send, disabled while empty. Cmd/Ctrl+Enter sends. `onSubmit` may return a promise: while it is pending the draft is locked (field read-only, attach, remove, visibility and mic disabled, one send only); it clears on success and stays, with the error's message, on failure. In the Suggest modal it sits on surface-2 with border-strong so it stands off the modal. |
| TriageBar | Status-driven actions (4.2); forward action is the one primary, last; inset-sm + float. |
| InternalNote | note-bg, 2px dashed note-border, lock + "Only the team sees this". |
| Avatar | Picture or initial on a warm fill picked from the name; keyline on public pages; primary ring for the team. |
| Toast | Past tense, at most one action; Undo toasts draw a 60-second countdown bar in primary. 420px wide, message and actions on one row. |
| Dialog | 22px radius; the buttons sit in the dialog's own padding, with no separate footer band. |

### 14.5 Skeletons
Every page that loads content has its own skeleton matching its real layout. The shell (top bar, sidebar, nav, floating/triage bars when status-independent, headings) renders for real; only the content becomes bones. Bones are `surface-2` pills (`border-radius: 999px`; 12–14px for title bones) pulsing opacity 1 → 0.55 over 1.6 s, static under reduced motion. The container has `aria-busy="true"`. Designed: `/feedback`, `/dashboard/requests`, `/dashboard/roadmap`, `/dashboard/requests/<id>` (the triage bar is a bone because its actions depend on the status). The other pages follow the same pattern: `/feedback/<id>`, `/roadmap`, `/changelog`, `/changelog/<slug>`, dashboard changelog list and editor, settings.

### 14.6 `/lort-landing` exceptions
This page is Lort's, not the board's, so:
- It always uses Lort Pink (`#cc3a6d` and its derived tokens), whatever primary the owner picked.
- The hero and the closing call-to-action are pink slabs (`shadow-inset-sm`); the hero's three request cards tilt (−1.2°, 0.8° with an 18px shift, −0.4°).
- The landing composer shows its send button in full primary, and the completion demo shows a disabled "Completed" button next to the "Marked as completed" toast.
These are the only places the Owner's Colour Rule and the Only-Stickers-Tilt Rule are broken.

## 15. Page layouts

All pages exist on the canvas in dark; `/feedback` and `/dashboard/requests` also in light.

### 15.1 Public
- **Top bar** (76px, max 1120px): logo mark + app name, Feedback / Roadmap / Changelog nav pills (current one on surface-2), search field, avatar or Sign in.
- **`/feedback`:** column max 860px, 32px gutters (24px on phones), 12px between cards, 140px bottom padding; display-xl headline "Got an idea for <App>?" with body-lg intro "Stick a dot on the ones you want most. The team builds what gets the most dots, and tells you when it ships."; FloatingBar fixed at bottom centre; footer "Powered by Lort"; the optional "Get your own board like this" card floats bottom-left (the canvas's placement), from the `xl` breakpoint up so it never meets the floating bar, with `shadow-inset-sm` + card float.
- **`/feedback` on phones:** stacked cards with compact stickers, compact FloatingBar.
- **`/feedback/<id>`:** "All ideas" back link; display-l title with author row and the sticker on the right ("Stick a dot"); body; "N comments" section with timeline entries and one-level reply bubbles on surface; Composer for signed-in users.
- **Suggest modal:** centred 22px-radius dialog over a blurred, dimmed board (overlay above the stickers); title "Suggest something" with "Got an idea for <App>?"; Board pills, Title with similar suggestions, Tags, Details composer.
- **`/roadmap`:** headline "What's coming to <App>?"; three columns on `ground-sunken` with status icon + label + count and a one-line blurb ("Committed and up next.", "Being built right now.", "Shipped in the last 30 days."); compact read-only items; "View all N shipped →".
- **`/changelog`:** headline "What's new in <App>"; label filter pills; posts in a date gutter + content layout; label chips (New is primary-soft, others surface-2).
- **`/changelog/<slug>`:** date and labels, display-l title, cover, body (68ch), "Shipped in this update" cards with the request and "Suggested by <name>", Share.
- **Sign up / Check your inbox:** 420px cards; the inbox card shows an envelope on a primary sticker circle (−7°).

### 15.2 Dashboard
- **Shell:** 244px sidebar on `ground-sunken` (logo mark + app name + collapse button, nav items with Tabler icons: inbox, layout-kanban, news, book, adjustments), 76px rail when collapsed or on dense pages (roadmap, editor), content max 820px (requests table max 1060px) with 30–40px padding.
- **Requests:** header row, filter row (search, Status, Board, Tags, Visibility, sort), table card with 56px rows.
- **Request:** breadcrumb + queue position, title and author with the sticker, body, chips row, divider, Composer, timeline, TriageBar floating at the bottom centre of the content area.
- **Roadmap:** three `ground-sunken` columns with status headers and counts, draggable cards (card float while dragging, a dashed drop hint "Drop to start working on it"), the Undo toast after a drop into Completed.
- **Changelog list:** table of posts with state dots (published = primary, scheduled = ink-2, draft = hollow).
- **Changelog editor:** rail sidebar; top bar with "Saved", slug field, Preview and the Publish menu; cover dropzone; label toggles; Tiptap body with the slash menu; "Shipped in this update".
- **Settings:** in-page table of contents on the left (sticky), sections as cards on the right; long single page.
- **Sign in:** centred card "<App> dashboard" with "For the <App> team. Looking for the board? Go to feedback", email, password, Sign in, the `--reset-admin` hint, "Powered by Lort".

### 15.3 `/lort-landing`
1. Header: "Lort" wordmark, "Back to <App>'s board" (hidden on phones), secondary "GitHub" button with the GitHub icon.
2. Hero: "<App>'s feedback board runs on Lort. Why not yours?" (72/72, −0.04em; 44/46 on phones), lede "Lort is a free, open-source feedback board, roadmap and changelog that you host on your own server. People stick dots on what they want while you build it, and they find out once it's done.", large primary "Get Lort on GitHub" with the GitHub icon; pink slab with three tilted demo request cards.
3. "From suggestion to shipped": the five open statuses on a line with captions (vertical on phones).
4. "Run it on your own server": "One Docker container holds the board, the database, HTTPS and email." Three steps marked with the Reviewing, In progress and Completed status icons (24px): point a subdomain (DNS record block), clone and run the setup script, start it (the `docker run` line). Code blocks are raised (surface, border-strong, inset-sm + card float), scroll horizontally, and the two command blocks have copy buttons.
5. "Your agent can run the board": MCP copy and the `claude mcp add` snippet with an example prompt, full width.
6. Two tiles side by side: "Say it instead of typing it" (voice, with the Composer) and "Mark it done, and everyone hears" (the Undo toast and a disabled "Completed" bar).
7. Closing pink slab: "Your users already have ideas. Give them a wall to stick them on." / "Free and open source under GPL-3.0, with no paid plans and no tracking." and an ink pill "Get Lort on GitHub" with the GitHub icon.
8. Footer: Lort, "Open source under GPL-3.0", GitHub, Docs.
Below 760px everything is one column.

## 16. Do's and don'ts (summary)
- Do hide controls for features that are off (email, voice, Turnstile, roadmap); never show them disabled.
- Do keep one primary button per view.
- Don't use status colours for tags, boards or charts.
- Don't use emoji, Unicode glyphs as icons, gradients, glass, or coloured side-stripes.
- Don't show "Lort" on public pages beyond the footer and the optional card.
- Don't copy UserJot's design, fonts, colours or copy; its screenshots were layout references only.
