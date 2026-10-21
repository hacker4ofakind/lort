# Lort Phase 1C: Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. This plan gives structure and decisions, not code. You write the implementation (TDD per task). Track tasks with the checkboxes. After all tasks, run the **Manual Verification Checklist** (or hand it to the user if they asked to do it), then fill in **Implementation Notes**.

**Goal:** Ship Lort as one Docker image that an owner builds and configures with `setup.sh` / `setup.ps1` (thin wrappers around a Go `lort setup` wizard), starts with one `docker run`, and recovers with `--reset-admin`, with CI that tests all of it.

**Specs:** `.superpowers/specs/2026-10-15-lort-design.md` (parent, already updated for this plan): 1.1-1.4, 2.1, 2.3, 12, 13 (phase 1). This replaces an earlier 1C plan that put the wizard in two hand-mirrored scripts; its stress-test review is why the design below differs.

**Architecture:** A multi-stage `Dockerfile` builds the Go binary and the Next.js standalone server into a slim Debian + Node image: `tini` → an entrypoint that fixes `/data` ownership and drops to uid 10001 → `lort`, which supervises Next. `lort setup` (Go, in the image) asks the questions, checks DNS, writes `.env` and creates the admin inside the data volume; the wrappers only check Docker/git/ports, build the image and run the wizard as a throwaway container. The server gains what a container needs: settings checks with clear refusals, settings encryption, a sender-checked trust in `X-Forwarded-For`, and a graceful stop.

**Tech Stack:** Docker (BuildKit), `golang:1.27-trixie`, `node:24-trixie-slim`, tini, `setpriv`; Go 1.27 + PocketBase v0.40.5 (`golang.org/x/term` for hidden input); bash 3.2-compatible `setup.sh`, PowerShell 7.4+ `setup.ps1`; shellcheck, PSScriptAnalyzer 1.25.0, Pester 5.7.1; GitHub Actions (`actions/checkout@v7`, `actions/setup-go@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`, `docker/setup-buildx-action@v4`, `docker/build-push-action@v7`, `actions/upload-artifact@v7`); Playwright 1.64; `next/font/local`.

## Global Constraints

- Voice: friendly, encouraging, short sentences, sentence case, never corporate (spec voice rules, `PRODUCT.md`). No secret ever goes to logs, console, process arguments or an image layer.
- Run commands, exactly (spec 1.2 step 9):
  - HTTPS: `docker run -d --name lort --restart unless-stopped --cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER --security-opt no-new-privileges --log-opt max-size=10m --log-opt max-file=3 -p 80:80 -p 443:443 -v lort_data:/data --env-file .env lort`
  - Proxy: the same with `-p 127.0.0.1:4052:4052` in place of the two `-p` ports.
- Config lifecycle (spec 1.4): `LORT_URL`, `LORT_TLS` (`auto`|`off`), `LORT_ENCRYPTION_KEY` (exactly 32 characters) are read every boot. `LORT_ADMIN_EMAIL`/`LORT_ADMIN_PASSWORD` stay as a developer fallback and are never written by setup.
- Admin password: hidden, typed twice, 8 to 71 bytes (PocketBase's bcrypt cap).
- Hosts supported: any Docker host with persistent volumes (Hetzner, DigitalOcean, Railway, Fly). Minimum 1 GB RAM. Vercel and Netlify are not supported; the README says so first.
- `setup.sh` runs on bash 3.2 (macOS). `setup.ps1` needs PowerShell 7.4+ and is pure ASCII. `.sh` files are LF and executable even from a Windows checkout.
- Features that don't exist yet (email, voice, Turnstile, `--update`, `--rollback`) are absent from setup, never shown disabled.
- `gofmt` every Go file, `go vet ./...` clean, no hand-written component CSS, pnpm only (`CLAUDE.md`). Never copy `design/` code into `web/`.

## File Map

- `server/internal/config/config.go` (+test): env settings, `Check`, `CheckWritable`, `BehindProxy`.
- `server/internal/proxytrust/` (+test): `IsTrustedPeer(netip.Addr)`, the header-stripping middleware and `TrustProxy`, the sender-checked `X-Forwarded-For` rule.
- `server/internal/envfile/` (+test): reads and writes `.env` (shared by the wizard and later `--update`/`--rollback`).
- `server/internal/web/web.go` (+test): `Supervise` (SIGTERM, grace, env strip, restart backoff) and the proxy transport.
- `server/main.go`: wiring, logging to stderr, no PocketBase installer, key-mismatch message, subcommands.
- `server/internal/setup/` (+tests): the wizard (`lort setup`), `setup-admin` and `reset-admin`.
- `Dockerfile`, `docker-entrypoint.sh`, `.dockerignore`, `.gitattributes`, `.gitignore`: the image (also `lort healthcheck`, `lort run-line` subcommands in `server/`).
- `test/container.sh`: checks a built image the way an owner runs it. `test/e2e-container.sh`: starts the image for Playwright and CI (one place).
- `setup.sh`, `setup.ps1`, `test/wrapper.test.sh`, `test/wrapper.Tests.ps1`: thin wrappers and their smoke tests with a fake `docker`.
- `web/app/layout.tsx` + `web/app/fonts/*.woff2` and OFL licences: local fonts.
- `web/playwright.config.ts`, `web/package.json` (`packageManager`), `.github/workflows/ci.yml`, `README.md`.

## Key Decisions & Gotchas

**Container and server**
- **Non-root with an entrypoint.** The image starts as root; `docker-entrypoint.sh` chowns `/data` (top level and `pb_data`, not recursive on every boot) to uid 10001 when the owner differs, then `exec setpriv --reuid=10001 --regid=10001 --init-groups lort`. If it already runs as non-root it just execs. Root-owned volumes (Railway, Fly) therefore just work. Ports 80/443 bind as non-root through Docker's `ip_unprivileged_port_start=0`; the cap-drop line must be proven by `test/container.sh`, not assumed. All `docker exec` commands use `-u lort`.
- **`CheckWritable`** distinguishes a full disk from a wrong owner; it suggests `chown -R 10001:10001` only for the second. `/data/pb_data` is created 0700. Certificates stay in `/data/pb_data/.autocert_cache`.
- **Settings checks refuse to start with a fix** (exact messages): `LORT_URL should be the board's full address`, ``LORT_TLS should be auto or off (it's "on")``, `LORT_TLS=off to try` (https on localhost), `has no domain` (https on an IP), `should be 32 characters (it has N)` (the message says which `.env` line to fix). The key is **required when `LORT_TLS=auto`**; with `off` and no key (local dev) settings stay plaintext.
- **A new key on an old volume** makes PocketBase fail with a bare `cipher: message authentication failed` and `--restart` loops forever. Catch that bootstrap error in `main.go` and print: the key differs from the one this data was saved with, put the original `LORT_ENCRYPTION_KEY` back in `.env`.
- **No stray installer superuser.** PocketBase's installer creates `__pbinstaller@example.com` and logs a 30-minute token when no superuser exists. Set `se.InstallerFunc = nil` on serve, and make `team.SeedFirstAdmin`'s "any superuser exists" check ignore that email.
- **Errors must reach `docker logs`.** `se.App.Logger()` only writes the logs table (and `/_/` is off). Use the standard `log` package, or a handler that tees Warn+ to stderr, for the supervisor and the trending cron; tee PocketBase's Debug-level autocert failures (`apis/serve.go:159`, `:328`) too, or closed firewalls and unpropagated DNS are silent.
- **Proxy trust (decision):** with `LORT_TLS=off`, use `X-Forwarded-For` (rightmost entry, as PocketBase does) only when the direct peer is loopback or private; otherwise ignore the header. `LORT_TLS=auto` trusts no header. Implement as a middleware that strips the header for other peers, ordered **before** the rate limiter (priority below -1000). Known limit, documented not solved: a Docker-published `4052` looks private, so the proxy run line binds `127.0.0.1`; Cloudflare's shared edge IP and IPv6 behind Docker's bridge share one bucket.
- **Supervisor:** `Supervise(ctx, cmd, Options{Grace})` with grace passed as a value (no mutable package variable), SIGTERM then kill after the grace, returns a result a test can assert (`Killed`). Strip `LORT_ENCRYPTION_KEY` and `LORT_ADMIN_PASSWORD` from Next's environment; append `HOSTNAME=127.0.0.1` last (Docker overrides `HOSTNAME`; Go keeps the last duplicate). SIGTERM tests skip on Windows. Stop budget: Docker's 10 s default, grace 5 s.
- **Proxy to Next** uses its own transport: `ResponseHeaderTimeout` (a hung Next fails in seconds, not PocketBase's 5-minute WriteTimeout) and `MaxIdleConnsPerHost` 64. The image has a `HEALTHCHECK` that runs `lort healthcheck` (a Go subcommand, no new process tree, no curl): it requests `/api/lort/health` and one proxied page through the server's own port, with `--start-period` so a booting container isn't "unhealthy".

**Setup wizard (`lort setup`) and wrappers**
- **Flow.** Wrapper: check Docker (daemon reachable) and git (print the docs link and one-line install for the detected OS, then exit); ports 80/443 free **or already held by the container named `lort`** (a re-run); `docker build -t lort --build-arg LORT_VERSION=<git describe --tags --always --dirty, else dev> .`; then run the wizard: `docker run --rm -it --entrypoint lort -v "$PWD":/work -v lort_data:/data lort setup --workdir /work --ports-free=<yes|no> --os=<linux|mac|windows>`. The wizard runs as root (entrypoint bypassed) so it can write into the bind mount, gives `.env` the owner uid/gid of `/work`, and runs the admin step by re-exec'ing itself as uid 10001 (`syscall.Credential`).
- **Order matters (no stuck volume).** Generate or keep the key → write `.env` → only then create the admin in `/data`. Creating the database before the key is on disk would strand it. An existing `/data/pb_data/data.db` with no key in `.env` stops the wizard with the explanation (not a new key); an empty `lort_data` volume (an aborted run) is fine. Its "docker rm -f lort" advice must say it removes the running board.
- **Admin step:** `lort setup-admin` (child, uid 10001): `--check` exits 0 if a superuser exists; otherwise it reads email and password from stdin and calls `team.SeedFirstAdmin` after `schema.Ensure` (the profile needs the collections). The key goes to the child via its environment only. If an admin exists the wizard says so and skips the question (a changed email would point at an account that doesn't exist).
- **`.env` writing:** values are never quoted or escaped (`--env-file` takes them literally; a password-like value with spaces, `$` or quotes must survive), LF endings, `KEY=VALUE` pairs in, **unknown lines kept** (`LORT_PB_ADMIN=1`). Written **in place** into a file the wrapper created beforehand empty with owner-only access (`umask 077` / `icacls`), never by rename, so the Windows ACL survives. Keys: `LORT_URL`, `LORT_TLS`, `LORT_ENCRYPTION_KEY` (32 random letters/digits from `crypto/rand`). Re-run offers each saved answer.
- **Public URL step:** normalise input to a bare host (`feedback.yoursite.com`); `localhost` is a try-out (no DNS check, `LORT_URL=http://localhost:4052`, `LORT_TLS=off`, proxy run line). DNS check asks `https://dns.google/resolve` (A and AAAA) and compares with `https://api.ipify.org` / `https://api6.ipify.org`. Verdicts: ok, missing, mismatch, **partly points here** (some records match), and **couldn't check** (resolver or ipify unreachable, never worded as "doesn't point anywhere"); on mismatch explain the record and offer re-check or continue.
- **Ports step:** free → `LORT_TLS=auto`; taken → `off`, print the proxy run line, ready-to-paste nginx and Caddy blocks for the URL (both with HSTS), and the short prompt for a coding agent ("Add a reverse proxy from feedback.yoursite.com to 127.0.0.1:4052 with HTTPS…").
- **`reset-admin`:** `docker exec -it -u lort lort lort reset-admin` (the wrapper passes nothing; Go asks the email and the new password hidden). It never takes the password as an argument, never echoes it, and says what failed: container not running, no such admin, password length. 8 to 71 bytes here too.
- **Wrappers stay thin and parallel**; their only logic is the host facts above. Keep `.env` out of git (`.gitignore`). Pester and shell tests use a fake `docker` on `PATH`. PowerShell gotchas: `-ceq` for password compares, pipe native output to `Out-Host`, `$hostName` not `$host`, verbs/nouns that avoid `SupportsShouldProcess`, ASCII only.

**Build, CI, tests**
- **Build:** the web stage waits for the Go stage (`COPY --from=server` of a small file) so the two memory peaks never overlap on a 1 GB host. `.dockerignore` is an allowlist (`server/`, `web/`, entrypoint); a check proves no `.env` or local data is in any layer. `packageManager` in `web/package.json` (`pnpm@12.10.1`) is the one pnpm version source for the Dockerfile and CI.
- **Never run destructive container or volume steps against real names.** Tests use a throwaway directory and `lort-check-*` / `LORT_TEST_` names and refuse to run if a real `.env` is in the working directory.
- **CI hygiene:** `timeout-minutes` on every job; one `test/e2e-container.sh` used by CI and the README; `test/container.sh` sets `MSYS_NO_PATHCONV=1`.
- **Fonts:** Bricolage Grotesque (700/800) and Figtree (400-700) as `.woff2` (variable where available) with their SIL OFL licence files, loaded through `next/font/local`; same weights and fallback metrics as today.
- **`gofmt -l`** lists every file on a CRLF Windows checkout; locally `gofmt -w` the files you touch, CI's Linux run is the real check.

**Second stress-test additions (these override earlier text where they differ)**
- **Never lose the key.** The wrapper creates `.env` only if it doesn't exist and never truncates one that does (a re-run would wipe the key, leaving it only in `docker inspect`). The wizard composes the full content first, copies the old file to `.env.previous` (same permissions), takes a lock (`.env.lock`, so two wizards can't mint two keys), writes in place with fsync, reads it back and compares. A repeated or malformed key line stops the wizard; it never mints a new key. Refuse a symlinked `.env`. `.env.previous` and `.env.lock` are git-ignored.
- **"No key" advice:** the stop message must not say `docker rm -f lort`; it tells the owner the key may still be recoverable with `docker inspect lort` (the `LORT_ENCRYPTION_KEY` line) and that removing a container never deletes the `lort_data` volume. Setup also reminds the owner to keep a copy of `.env` somewhere safe.
- **Ownership is the wizard's job too.** It bypasses the entrypoint, so it chowns `/data` the same way before the admin child runs; the root parent only checks that `data.db` exists and never opens it (SQLite would leave root-owned `-wal`/`-shm`). The Dockerfile creates a real `lort` user and group (uid/gid 10001, an `/etc/passwd` entry so `docker exec -u lort` and `setpriv --init-groups` work) and creates `/data` owned by it. The entrypoint probes the top level **and `data.db`**; if either owner is wrong it runs one `chown -R -h`. `test/container.sh` runs `docker exec -u lort` and the wizard against a root-owned volume.
- **Wizard container flags:** the throwaway wizard run carries `--cap-drop=ALL --cap-add=CHOWN --cap-add=SETUID --cap-add=SETGID --cap-add=DAC_OVERRIDE --cap-add=FOWNER --security-opt no-new-privileges`, and the wrapper sets `MSYS_NO_PATHCONV=1` (Git Bash rewrites `/work`). It uses `-it` only when stdin is a terminal; otherwise `-i`, and the wizard falls back to plain line input for the secret with a notice (scripted runs, coding agents, MV-1). Passwords are taken verbatim: only a trailing `\r\n` is stripped, never spaces.
- **Admin check is tri-state:** `setup-admin --check` exits 0 (exists), 1 (none), 2 (couldn't tell); only 1 asks for a password; "admin created" is printed only after a read-back, since `SeedFirstAdmin` silently does nothing when a superuser exists. If a `lort` container is running, don't touch its live database: say so, skip the admin step, and tell the owner to stop and remove the container (data stays in the volume) before running the printed line.
- **Wrapper host checks:** "held by the container `lort`" means `docker port lort` publishes 80 and 443 (not a name match). "Permission denied" on the Docker socket gets its own message (not "Docker not installed"). `--reset-admin` checks the container is running before `docker exec`.
- **Wizard answers:** reject an IP, `host:port` or anything with no domain as the public URL (except `localhost`), using the same `Config.Check` the server uses; refusal messages come from a typed `config.SettingError` so Go and shell tests stop copying strings. DNS: 5 s timeout per call, lookups in parallel; the container's bridge has no IPv6, so "IPv6 not checked from here" is a note, not a failed verdict. On a mismatch also say: if you use Cloudflare's orange-cloud proxy the address will differ, and stale AAAA records break Let's Encrypt. Say plainly that the check sends the domain to Google DNS and the server's address to ipify.
- **Proxy blocks the wizard prints** must forward the client address as the **last** `X-Forwarded-For` entry (`$proxy_add_x_forwarded_for` for nginx; Caddy's default), set nginx `client_max_body_size 16m` (three 5 MB images) and the SSE settings (`proxy_buffering off`, long `proxy_read_timeout`), plus HSTS. Test the blocks' text.
- **Logs:** tee only autocert/ACME lines and lines about the configured host to stderr, deduplicated, not every scanner's TLS handshake error. Set `ReadHeaderTimeout` (10 s) on the listeners where PocketBase lets you.
- **Headers:** add `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a frame restriction (`X-Frame-Options: SAMEORIGIN`, not on `/widget.js` iframes' own route once Phase 5 exists) in the Go proxy; HSTS only when the request arrived over HTTPS or `LORT_TLS=auto`.
- **Next's env strip is hygiene, not isolation:** Next runs as the same uid as `lort`, so a compromised Next can still read `/proc/<pid>/environ` and the database. Say that in the README's security note rather than claiming otherwise; the key in `docker inspect` is likewise visible to anyone with Docker access.
- **Memory on a 1 GB host:** `COPY --from=server` is the web stage's first instruction; Go builds with `GOFLAGS=-p=1`; Node gets `NODE_OPTIONS=--max-old-space-size=768` and one build worker. The wrapper checks RAM plus swap before building and, under about 2.5 GB total, prints a swapfile recipe; exit code 137 from `docker build` is explained as "ran out of memory". After a successful build it runs a labelled `docker image prune -f` for old Lort images only, and warns under 4 GB free disk.
- **One definition of the run lines:** Go's `RunLine(mode)` is the single source; `lort run-line <mode>` prints it, and `container.sh`, `e2e-container.sh` and the README tests read that instead of copying flags. The e2e admin lives in `test/e2e.env`, read by both shell and TypeScript. Split `internal/setup` into one file per step.

## Tasks

### Task 1: Settings checks
**Files:** `server/internal/config/config.go`, `config_test.go`
**Interfaces:**
- Produces: `config.EncryptionEnv = "LORT_ENCRYPTION_KEY"`; `Config.EncryptionKey`; `func (Config) Check() error`; `func (Config) BehindProxy() bool` (`TLS == "off"`); `func CheckWritable(dir string) error`.

**Build:** implement the exact messages and the key-required-for-`auto` rule from Key Decisions; `CheckWritable` creates `dir` 0700 and tells full disk from wrong owner.

**Tests (behaviours):**
- Each bad URL/TLS/key case returns its message; good cases (https domain with key, proxy mode, local try-out) return nil.
- `auto` with an empty key fails; `off` with an empty key passes; a 5-character key reports "it has 5".
- `CheckWritable` on a read-only dir names `chown -R 10001:10001`; on a full-disk error it does not.

**Done when:** `cd server && go test ./internal/config/... && go vet ./...` pass.

- [x] Task 1 complete

### Task 2: Sender-checked proxy trust
**Files:** `server/internal/proxytrust/proxytrust.go`, `proxytrust_test.go`
**Interfaces:**
- Consumes: `testutil.NewApp(t)`.
- Produces: `func proxytrust.IsTrustedPeer(netip.Addr) bool` (loopback, RFC 1918, IPv6 ULA and CGNAT `100.64.0.0/10`); `func proxytrust.TrustProxy(app core.App, trust bool) error` (called after `schema.Ensure`). `trust=false` must **explicitly clear** the stored `TrustedProxy.Headers` and save: PocketBase persists them, so a board switched from proxy mode to HTTPS would otherwise keep trusting forged headers. Test both flip directions.

**Build:** register the header-stripping middleware before the rate limiter; when `trust` is false never read the header; when true, strip it unless the direct peer is loopback or private; PocketBase's `TrustedProxy` settings carry the header name and rightmost rule.

**Tests (behaviours):**
- trust=false: a forged `X-Forwarded-For` is ignored; the limiter keys on the real address.
- trust=true from `127.0.0.1` / `10.x` / `172.16.x` / `192.168.x`: the header's rightmost entry is the client.
- trust=true from a public peer: the header is ignored (forged values don't dodge the `*:auth` limit).
- IPv6 loopback and ULA peers count as private.

**Done when:** `go test ./internal/schema/...` passes.

- [x] Task 2 complete

### Task 3: Supervisor and proxy to Next
**Files:** `server/internal/web/web.go`, `web_test.go`
**Interfaces:**
- Produces: `web.Supervise(ctx, cmd []string, o web.Options) Result`; `Options{Grace time.Duration, Logf func(string, ...any)}`; `Result{Killed bool}`. The "didn't stop in time" branch is covered by a unit test through `Result`.

**Build:** SIGTERM on context end, kill after `Grace`, return once Next has exited; strip the two secrets from Next's env; restart with backoff; the proxy transport from Key Decisions.

**Tests (behaviours):**
- A server that traps SIGTERM exits promptly and `Killed` is false; one that ignores SIGTERM is killed after a short grace and `Killed` is true (both skip on Windows).
- Next never sees `LORT_ENCRYPTION_KEY` or `LORT_ADMIN_PASSWORD`; `HOSTNAME` is `127.0.0.1`.
- A Next that never answers headers returns 502/504 within `ResponseHeaderTimeout`.
- A crashing Next is restarted with backoff.

**Done when:** `go test ./internal/web/...` passes.

- [x] Task 3 complete

### Task 4: `main.go` wiring
**Files:** `server/main.go`, `server/internal/team/team.go` (+test)
**Interfaces:**
- Consumes: Tasks 1-3. Produces: log line `The web server has stopped.` (standard `log`), refusals printed to stderr with exit 1, and the subcommands `setup`, `setup-admin`, `reset-admin` registered (Task 5 supplies them).

**Build:** dispatch `setup` (and `healthcheck`) **before `pocketbase.New`**: PocketBase bootstraps, and so creates `data.db`, for every command it knows (`pocketbase.go:180-185`, `skipBootstrap`), which would make a root-owned database with no key before `.env` exists. Only `setup-admin` and `reset-admin` are PocketBase commands. `cfg.Check()` and `CheckWritable` run on the serve path only, never for `setup`. Then `DefaultEncryptionEnv: config.EncryptionEnv`; catch both key errors (wrong key: `cipher: message authentication failed`; missing key on encrypted settings: PocketBase's other error at `settings_query.go:68-69`); `InstallerFunc = nil`; `TrustProxy`; supervisor via Task 3; Warn+ and autocert errors to stderr.

**Tests (behaviours):**
- A first boot with no admin variables creates no `__pbinstaller` superuser; `SeedFirstAdmin` still seeds a real admin if only that email exists.
- Booting an existing encrypted data dir with a different key exits 1 with the key message.
- A plaintext settings record from a keyless dev run still loads and is encrypted on next save.

**Done when:** `go test ./...` and `go build ./...` pass.

- [x] Task 4 complete

### Task 5: The wizard, `setup-admin` and `reset-admin`
**Files:** `server/internal/setup/*.go` (+tests), `server/main.go` (register)
**Interfaces:**
- Produces: `setup.Run(ctx, Host, Options) error` with `Host` giving `Prompter` (`Ask`, `AskSecret`, `Confirm`, `Say`), `Net` (`DNS(host, "A"|"AAAA")`, `PublicIP(4|6)`), `Files` (the work dir) and `Admin` (runs the child); `Options{Workdir, PortsFree bool, OS string}`; `setup.ResetAdmin(ctx, Host) error`; the hidden `setup-admin [--check]` command. Fakes for all of them make every flow unit-testable.

**Build:** every step and rule in Setup wizard above, in Lort's voice; real implementations (hidden input with `x/term`, Google DoH, ipify, re-exec as uid 10001) behind the interfaces.

**Tests (behaviours):**
- `normalize host`: scheme, trailing slash, path and uppercase stripped; spaces rejected; `localhost` is a try-out.
- DNS verdicts: ok, missing, mismatch, partly, couldn't check; mismatch offers re-check or continue.
- Password: <8 or >71 bytes rejected; mismatched confirmation re-asks; input running out ends with a clear error (never loops).
- `.env`: exact bytes for a password with spaces, `$`, `"`, `#`; LF only; unknown lines kept; re-run keeps saved answers and never replaces a saved key; written in place.
- Existing data and no key stops the wizard; an empty volume does not; `.env` is written before the admin is created.
- Existing admin skips the question. Taken ports pick `off`, free pick `auto`; the printed run lines equal the Global Constraints strings exactly; proxy blocks contain HSTS.
- `reset-admin`: wrong container/admin/length each give their own message; a password beginning with `-` works; the password never appears in an argv or in output.

**Done when:** `go test ./internal/setup/...` passes with `-race`.

- [x] Task 5 complete

### Task 6: The image and its container check
**Files:** `Dockerfile`, `docker-entrypoint.sh`, `.dockerignore`, `.gitattributes`, `.gitignore`, `test/container.sh`
**Interfaces:**
- Produces: image `lort` (build arg `LORT_VERSION`, `-ldflags -X .../site.Version`), env `LORT_DATA=/data/pb_data`, `LORT_WEB_CMD="node /app/web/server.js"`, ports 4052 or 80/443, `HEALTHCHECK`. `bash test/container.sh [image]` exits 0 when every check passes (`LORT_EXPECT_VERSION` optional).

**Build:** Dockerfile and entrypoint per Key Decisions; no secret in any layer.

**Tests (behaviours) in `container.sh`:**
- Starts with the cap-drop run line on 4052 and a fresh volume: `/api/lort/health` ok, version matches, default app name served.
- Starts on a volume pre-chowned to root; files end owned by 10001.
- Starts with 80/443 mapped to high host ports (binds as non-root with caps dropped) in `auto` mode refusing only for the documented reasons.
- Bad `LORT_URL`/`LORT_TLS`/key exit 1 with the Task 1 messages; a second start with a different key shows the key message and does not loop silently.
- `docker stop` completes inside 10 s, logs `The web server has stopped.`, and exits 0. Killing Next inside restarts it. `docker exec -u lort lort lort reset-admin` works.
- No `.env` or local data in any layer; the process runs as uid 10001.

**Done when:** `docker build -t lort . && bash test/container.sh` pass.

- [x] Task 6 complete

### Task 7: The wrappers
**Files:** `setup.sh`, `setup.ps1`, `test/wrapper.test.sh`, `test/wrapper.Tests.ps1`
**Interfaces:**
- Consumes: the image and `lort setup` / `lort reset-admin`. Produces: `./setup.sh` and `./setup.ps1` with `--reset-admin` and `--help`.

**Build:** only the host facts and commands from Setup wizard above; create `.env` empty with owner-only access first; pass `--ports-free` and `--os`; build, run the wizard, stop on its exit code. `--reset-admin` runs the `docker exec` line.

**Tests (behaviours), with a fake `docker` on `PATH`:**
- Missing Docker, unreachable daemon and missing git each print the link and the install line, and exit 1.
- Ports free, taken, and held by the existing `lort` container give `--ports-free` `yes`, `no`, `yes`.
- The build call carries `LORT_VERSION` (git describe, else `dev`); the wizard call has the exact mounts and entrypoint override; `.env` is empty and mode 600 before the wizard runs.
- `--reset-admin` runs `docker exec -it -u lort lort lort reset-admin` with no password in argv.
- bash 3.2: the suite runs under macOS `/bin/bash` in CI; shellcheck and PSScriptAnalyzer are clean.

**Done when:** `bash test/wrapper.test.sh`, `Invoke-Pester test/wrapper.Tests.ps1`, shellcheck and PSScriptAnalyzer pass.

- [x] Task 7 complete

### Task 8: Local fonts
**Files:** `web/app/layout.tsx`, `web/app/fonts/*` (create), `web/package.json` (`packageManager`)
**Build:** swap `next/font/google` for `next/font/local` using the files and licences in Key Decisions; keep the CSS variables the Tailwind theme already uses.

**Tests (behaviours):** `pnpm build` makes no request to Google Fonts (offline build passes); headings compute to Bricolage Grotesque and body to Figtree; Vitest and the existing Playwright suites stay green.

**Done when:** `cd web && pnpm build && pnpm test` pass.

- [x] Task 8 complete

### Task 9: Playwright against the container, and CI
**Files:** `web/playwright.config.ts`, `test/e2e-container.sh`, `.github/workflows/ci.yml`
**Interfaces:**
- Produces: `LORT_E2E_CONTAINER=1 pnpm e2e` tests whatever listens on `127.0.0.1:4052` (the config drops its `webServer` entries); CI jobs `server` (Go tests with `-race`, gofmt, vet), `web`, `wrappers` (Ubuntu and macOS for bash, Ubuntu and Windows for PowerShell), `image` (build with Buildx caching, `container.sh`, `e2e-container.sh`, Playwright). The e2e admin `admin@lort.test` / `correcthorse-e2e` is defined in one place.

**Build:** `timeout-minutes` on every job; read-only token permissions; no secrets; `e2e-container.sh` is the only place that starts the container for tests.

**Done when:** `bash test/e2e-container.sh && cd web && LORT_E2E_CONTAINER=1 pnpm e2e` pass locally, and CI is green on the PR.

- [x] Task 9 complete

### Task 10: README and the commit
**Files:** `README.md`
**Build:** where it runs (the Vercel/Netlify line first), quick start (`git clone`, `./setup.sh` or `./setup.ps1`, the printed run command), forgot the admin password, local try-out, development, status; the full README is Phase 6. One implementation commit when all tasks and the checklist pass. Afterwards `CLAUDE.md`'s two PR review rounds and the docs commit (spec, plans, `DESIGN.md`/`PRODUCT.md`, README) apply.

**Done when:** a stranger can follow the README from a clean clone to a running board.

- [x] Task 10 complete

## Manual Verification Checklist

**Shared setup:** Docker running; a clean clone (no `.env`, no `lort_data` volume, no `lort` container); `pnpm install` in `web/`. Use `http://localhost:4052`.

#### MV-1: local try-out, end to end
- **Setup:** shared setup.
- **Steps:** run `./setup.sh` (Windows: `./setup.ps1`); URL `localhost`; admin `me@example.test` with a password containing a space and `$`; run the printed command.
- **Expected:** the printed run line equals the proxy line in Global Constraints. `.env` holds exactly `LORT_URL=http://localhost:4052`, `LORT_TLS=off`, `LORT_ENCRYPTION_KEY=<32 chars>` and no password; `ls -l .env` shows `-rw-------`. `http://localhost:4052/dashboard` signs in with that admin. No admin password in `docker inspect lort`.
- **How the executor runs it:** script with scripted stdin and curl.

#### MV-2: re-run keeps answers
- **Steps:** add `LORT_PB_ADMIN=1` to `.env`; run `./setup.sh` again, accepting every saved answer.
- **Expected:** the key is unchanged, `LORT_PB_ADMIN=1` is still there, the wizard says the admin already exists and does not ask for a password.

#### MV-3: lost `.env`
- **Steps:** with the container stopped, delete `.env`; run `./setup.sh`.
- **Expected:** it stops saying a new key can't read the existing data; the volume is untouched; restoring the old key and re-running works.

#### MV-4: wrong key on old data
- **Steps:** edit the key in `.env`, `docker rm -f lort`, run the printed command, `docker logs lort`.
- **Expected:** one clear message about the key, not a crash loop of raw errors.

#### MV-5: reset the admin password
- **Steps:** `./setup.sh --reset-admin`; email `me@example.test`; new password starting with `-`.
- **Expected:** success; the old password fails on `/dashboard`, the new one works; `ps` during the run shows no password.

#### MV-6: graceful stop and recovery
- **Steps:** `time docker stop lort`; `docker logs lort | tail`; start again; `docker exec lort sh -c 'pkill -f server.js'` and wait.
- **Expected:** stop under 10 s, `The web server has stopped.` logged, exit code 0; after the pkill Next comes back and the board loads.

#### MV-7: root-owned volume
- **Steps:** `docker run --rm -v lort_data:/data alpine chown -R 0:0 /data`, then start Lort.
- **Expected:** it starts and writes data; `/data` ends owned by 10001.

#### MV-8: forged client address
- **Steps:** from a public-peer test (Go test, or a second container on a public bridge), send `X-Forwarded-For: 1.2.3.4` repeatedly to `/api/collections/_superusers/auth-with-password`.
- **Expected:** the sixth attempt in 10 seconds gets 429; the header is ignored from non-private peers. `[user-only]` for the real-internet check (needs a public host).

#### MV-9: HTTPS on a real server
- **Steps:** on a VPS with a real domain, run the wizard with the DNS record missing, then correct.
- **Expected:** the wizard says the record is missing, then ok; HTTPS works; with port 443 firewalled, `docker logs` shows a visible certificate error. `[user-only]`: needs a public host and domain.

#### MV-10: Windows
- **Steps:** repeat MV-1 and MV-5 in PowerShell 7.4 on Windows.
- **Expected:** identical results; `.env` is readable only by the current user (`icacls .env`). `[user-only]`: needs a Windows machine if CI does not cover it.

#### MV-11: fonts
- **Steps:** build with the network off (`docker build --network none` after dependencies are cached, or `pnpm build` offline); open `/feedback`.
- **Expected:** the build passes; computed fonts are Bricolage Grotesque (headline) and Figtree (body).

#### MV-12: whole suite against the container
- **Steps:** `bash test/e2e-container.sh`, then `LORT_E2E_CONTAINER=1 pnpm e2e` in `web/`.
- **Expected:** every test passes in both themes; axe finds no violations.

#### MV-13: the wrapper never wipes the key
- **Steps:** after MV-1, note `LORT_ENCRYPTION_KEY`; run `./setup.sh` again and interrupt it (Ctrl-C) at the first prompt; then run it to completion twice.
- **Expected:** the key is identical every time; `.env.previous` exists after the writes; an interrupted run leaves `.env` intact.

#### MV-14: scripted run with no terminal
- **Steps:** `printf 'localhost\nme@example.test\npw one\npw one\n' | ./setup.sh` (and the PowerShell equivalent in Git Bash and CI).
- **Expected:** completes; plain-input notice shown; the password with a space works at `/dashboard`.

#### MV-15: HTTPS mode after proxy mode
- **Steps:** boot with `LORT_TLS=off`, send `X-Forwarded-For: 9.9.9.9` from a private peer (it is trusted); switch the board to `LORT_TLS=auto` (or test on localhost with the Go test) and repeat.
- **Expected:** the header is trusted in proxy mode and ignored after the switch (stored `TrustedProxy` headers cleared).

#### MV-16: existing data owned by root
- **Steps:** with data already in `lort_data`, run `docker run --rm -v lort_data:/data alpine chown -R 0:0 /data`, then start Lort and run `./setup.sh --reset-admin`.
- **Expected:** both work; `data.db` ends owned by 10001.

## Out of Scope

- Email, voice, Turnstile, backups, `--update`, `--rollback`, the update check (phases 3 and 5); the full README and docs (phase 6).
- Publishing a prebuilt image to GHCR (only after this phase is fully verified, before Phase 5's update/rollback).
- Cloudflare real-client-IP support, a Compose file, and moving the build off the owner's server.
- A `lort reset-settings` recovery for a lost key (revisit in Phase 3, when SMTP credentials join the encrypted settings), and running Next under a second uid (documented in the README instead).

## Implementation Notes

**Deviations and why**
- **tini runs as lort, not root.** The run line drops `CAP_KILL`, so a root tini couldn't forward SIGTERM to a uid-10001 `lort` (`[FATAL tini] Operation not permitted`, exit 1 on every `docker stop`). The entrypoint is now PID 1, fixes `/data`, then `exec setpriv … tini -- lort`. `ENTRYPOINT ["docker-entrypoint.sh"]`.
- **Wizard flags:** besides `--workdir --ports-free --os`, the wrappers pass `--container-running=yes|no` (the wizard can't see Docker; it skips the admin step when Lort is live) and `--script=./setup.sh|./setup.ps1` (so advice names the script the owner ran, e.g. Git Bash on Windows). `--data` defaults to `$LORT_DATA` or `/data/pb_data`.
- **`setup.Host`** is `{Prompt, Net, Admin}`; the work and data folders are plain paths in `Options` (tests use temp dirs, not a Files fake). `Admin` has `Check(ctx,key)`, `Create(ctx,key,email,pw)`, `Exists`, `Reset`. `AppAdmin` (in-process) backs `setup-admin` and `reset-admin`; `childAdmin` re-execs `lort setup-admin --dir …` as uid 10001 with the key in its environment.
- **`web.Proxy`** takes a third argument, `web.ProxyOptions{HeaderTimeout, HSTS}` (default header timeout 20 s). It sets `Referrer-Policy`, and HSTS only with `LORT_TLS=auto` or a TLS request; PocketBase already sets nosniff/`X-Frame-Options`, so the proxy drops its copies and sets each once.
- **`config.SettingError{Var, Problem}`**: `Error()` appends the `.env` advice; setup shows `Problem` alone. `LORT_URL` with `auto` must be `https://` and portless.
- **`team.HasAdmin`** (ignores the installer email) is the one "admin exists" check; `SeedFirstAdmin` also deletes a leftover `__pbinstaller` account.
- **`envfile.Write(path, old, data)`** refuses if the file changed since `old` was read (optimistic check under `.env.lock`), so two wizards can't mint two keys. Malformed, repeated, empty or wrong-length key lines stop setup.
- `setup.sh` on Windows (Git Bash) also runs `icacls` on a new `.env`; `umask` means nothing to NTFS.
- Next's build worker count comes from `NEXT_BUILD_CPUS` (read in `next.config.ts` as `experimental.cpus`); there is no built-in env var.
- Fonts come from Fontsource's variable Latin woff2 files (`app/fonts/*-latin-wght.woff2`, OFL texts beside them). Families are `figtree`/`bricolage` with generated Arial fallback metrics.
- The e2e admin lives in `test/e2e.env`; `web/e2e/helpers.ts`, `e2e/server.mjs` and `e2e-container.sh` read it. `container.sh` uses its own `check@lort.test`.
- Pester fakes are `.cmd`/`sh` shims on a controlled `PATH` (global PowerShell function fakes leaked between tests).

**Surprises**
- pnpm 12 records `packageManager` in the lockfile: pinning it needs a lockfile update or `--frozen-lockfile` fails.
- Next renames its process to `next-server (vX)`; the image has no `pkill`. MV-6's `pkill -f server.js` doesn't work as written (container.sh kills via `/proc`).
- Windows `curl -o /dev/null` fails under `MSYS_NO_PATHCONV=1`; the scripts redirect instead.
- `docker stop` takes about 1 s; the healthcheck in `auto` mode connects to `127.0.0.1:443` with the board's SNI and skips verification.

**For the next planner**
- `RunLine(mode)` in `internal/setup/ports.go` is the single source (`lort run-line https|proxy`).
- Admin step order is enforced: key → `.env` (read back) → chown `/data` → `setup-admin` as 10001.
- Not verified here: MV-8's real-internet half, MV-9 (needs a public host and domain). CI runs bash on macOS 3.2 and Pester on Windows; both were run locally (bash 3.2 in Docker, Pester on Windows 11 and Linux pwsh).
