# Lort

A free, open-source feedback board for small apps, which you host yourself. Think of it as free UserJot: people suggest ideas and stick a dot on the ones they want, and you build what gets the most dots.

## Where it runs

Lort runs on any server or Docker host with a persistent volume: a VPS (Hetzner, DigitalOcean and the like), Railway or Fly. **Vercel and Netlify are not supported**, because Lort is one long-running container with its own database.

You need:

- Docker and git.
- At least 1 GB of RAM. Building the image needs about 2.5 GB of RAM and swap together, and setup tells you how to add swap if you're short.
- A subdomain you can point at the server, like `feedback.yoursite.com`.

## Quick start

1. At your DNS provider, add an A record for `feedback.yoursite.com` pointing at your server's address.
2. On the server:

   ```bash
   git clone https://github.com/hacker4ofakind/lort.git
   cd lort
   ./setup.sh
   ```

   On Windows, run `./setup.ps1` in PowerShell 7.4 or later.

3. Setup checks your machine and builds the image (a few minutes the first time). Then it asks for your board's address, checking its DNS record, and an email and password for your admin account. Your settings go into `.env` in this folder; the password doesn't.
4. Run the `docker run` line setup prints at the end. Then open your board, and sign in to `/dashboard` with your admin account.

That's it. Setup picks how Lort meets the internet:

- **Ports 80 and 443 free:** Lort gets its own HTTPS certificate from Let's Encrypt.
- **Ports taken (you already run nginx or Caddy):** Lort listens on `127.0.0.1:4052`. Setup prints a ready-to-paste nginx block, a Caddy block, and a one-line prompt you can hand to your coding agent.

Running setup again offers each saved answer, so you can change one thing and keep the rest. If Lort is already running, or a stopped `lort` container is still around, setup tells you to remove it before running the new line. Your data stays in the `lort_data` volume.

### Keep `.env` safe

`.env` holds `LORT_ENCRYPTION_KEY`, the key to your board's settings. Keep a copy somewhere safe. Without it, a new key can't read your existing data. Setup refuses to make a new key for a board that already has data, and tells you where the old key might still be (a copy of `.env`, `.env.previous` next to it, or `docker inspect lort`).

Setup keeps `.env` readable by you alone and never empties it. It saves the previous version as `.env.previous` whenever it writes.

## Forgot the admin password?

On the server, in the `lort` folder:

```bash
./setup.sh --reset-admin
```

It asks for the admin's email and a new password. The password is never shown, saved in a file or passed on the command line, and every old dashboard session is signed out.

## Try it on your own computer

Run `./setup.sh` and type `localhost` as the address. Lort will run at http://localhost:4052, with no DNS or HTTPS needed.

## Development

The Go server is in `server/` and the Next.js app in `web/` (pnpm only).

```bash
cd server && go test ./...
```

```bash
cd web && pnpm install && pnpm test
```

The Playwright suite starts its own servers from the source:

```bash
cd web && pnpm e2e
```

Or run it against a built image, the way CI does:

```bash
docker build -t lort .
bash test/container.sh lort
bash test/e2e-container.sh lort
cd web && LORT_E2E_CONTAINER=1 pnpm e2e
```

`test/container.sh` checks the image the way an owner runs it: the exact run line, a root-owned volume, bad settings, a wrong key, a graceful stop, and the setup wizard. `test/e2e-container.sh` starts the image on port 4052 for Playwright (`--stop` removes it). The setup scripts have their own tests: `bash test/wrapper.test.sh` and `Invoke-Pester test/wrapper.Tests.ps1`.

## Security notes

- Lort runs as an unprivileged user (uid 10001), with every Linux capability dropped except the few its start-up needs.
- Secrets never go into the image, command lines or logs. The admin password isn't stored in `.env` either.
- The Next.js server doesn't receive `LORT_ENCRYPTION_KEY`. That's hygiene, not isolation: it runs as the same user, so a compromised web server could still read the key from the Lort process or open the database. Anyone with Docker access can also see the key with `docker inspect lort`.
- Behind a reverse proxy, Lort trusts `X-Forwarded-For` only from loopback and private addresses, which is why the proxy run line binds `127.0.0.1`.

## Status

Lort is early. Phase 1 works today: the public board and request pages, accounts, the dashboard with triage and merging, settings for branding, boards, tags and the team, and this setup. Next up are the roadmap and changelog, then email, webhooks and an MCP server, voice dictation, the embeddable widget and backups.

## Licence

GPL-3.0. See [LICENSE](LICENSE).
