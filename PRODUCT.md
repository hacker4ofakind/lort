# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router, `output: 'standalone'`) + shadcn/ui + Tailwind CSS + Motion + Tiptap v3 on the frontend; a single Go binary embedding PocketBase (business logic, certmagic TLS, reverse proxy, MCP server, whisper.cpp runner) on the backend; Tabler icons; one Docker image, no Compose; pnpm.

## Users

- **Board owner (admin):** a solo or tiny-team "vibecoder" shipping a web app, often with an AI coding agent doing most of the work. Has some real coding experience, little patience for ops. Wants a cheap, self-hosted place to collect feature requests and bug reports, triage them fast, show a roadmap, and announce what shipped. Uses the dashboard in short bursts between building, frequently on a laptop, sometimes on a phone.
- **Board visitor (end user):** a user of the owner's app who lands on `feedback.theirapp.com` (or the embedded widget) to suggest something, upvote, or check whether a thing is planned. Low commitment, arrives once, may never sign up. Never sees the word "Lort" except in the footer.
- **The owner's agent:** Claude Code / Codex / Cursor operating the board over MCP, and receiving webhooks.

## Product Purpose

Give every small app a full-featured public feedback board, roadmap and changelog that costs nothing beyond the VPS it runs on. Success: an owner goes from `git clone` to a live HTTPS board in one setup script and one `docker run`, and their users' requests reliably turn into shipped, announced features.

## Positioning

Everything UserJot charges for, free and self-hosted. Plus what UserJot doesn't have at any price: webhooks, and an MCP server on every install.

## Operating Context

- Self-hosted on a VPS or any Docker host with volumes; not Vercel/Netlify.
- The public board lives on the owner's subdomain and should feel like part of the owner's product: app name, logo, and one primary color are the owner's; light/dark follows the visitor's system.
- Triage ritual: Pending → Reviewing → Planned (on roadmap) → In Progress → Completed, plus Closed; merge duplicates; skip through a queue.
- Shipping ritual: write a changelog in a Notion-style editor, attach the requests it covers, publish now or schedule; upvoters get emailed.

## Capabilities and Constraints

- Six statuses, each with a custom SVG circle icon at a distinct fill level (yellow empty → orange sliver → light-blue half → purple nearly full → green full with check; red with cross). Wherever a status appears it is either icon + label or colored text, never both, never neither (table icons carry a tooltip/aria-label).
- Boards (public/private, per-board approval), admin-managed tags, one-level comment replies, internal notes, merge, similar-request suggestions, embeddable widget.
- Optional features that vanish entirely when off: email (Resend/SMTP), voice dictation (Whisper), Turnstile.
- Custom skeleton loaders per page layout; no generic skeletons.
- Settings is a single page split into sections.

## Brand Commitments

- Name: Lort. Voice: friendly and encouraging — celebrates shipping moments, warm in empty states, never corporate. Short sentences.
- "Powered by Lort" footer link is always present on public pages; the floating "Get your own board" card is optional and links to the in-app `/lort-landing` page, whose headline uses the owner's app name.
- The owner's brand (name, logo, primary color) leads on public surfaces; Lort's own identity leads on the dashboard and `/lort-landing`.
- UserJot screenshots are layout references only; their design system, fonts, colors and copy must not be copied.

## Evidence on Hand

None yet: no logo, no screenshots, no users, no testimonials. Landing page must not invent customers, star counts, or benchmarks.

## Product Principles

1. Works really well before it looks impressive; function first.
2. One command to run it; every optional feature is a clean on/off, never half-working.
3. Anything a human can do in the dashboard, an agent can do over MCP (except managing admins, keys, backup restore).
4. The owner's users should feel the owner listened: shipped means notified.
5. Nothing managed-service-shaped: no plans, seats, or upsells anywhere.

## Accessibility & Inclusion

WCAG 2.2 AA in both themes, including custom accent colors (auto-adjusted for contrast). Full keyboard operation, including keyboard alternatives for roadmap drag-and-drop. Respect `prefers-reduced-motion`. Icon-only status always has an accessible name.
