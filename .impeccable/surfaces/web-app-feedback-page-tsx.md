---
version: 1
slug: "web-app-feedback-page-tsx"
primary_target: "web/app/feedback/page.tsx"
related_targets: ["web/app/dashboard"]
---

## Scope

Whole product UI for Lort (public board + admin dashboard + /lort-landing share one world). Visitor mode: Operate for board and dashboard; Read for changelog and docs; Persuade for /lort-landing (inherits the world, re-briefed when built).

## Audience, job, constraints

Board visitors: drop by once, suggest or upvote, check if something is planned. Owners (vibecoders): triage in short bursts, drag the roadmap, publish changelogs. Owner brand (name, logo, one primary color) leads on public pages. WCAG 2.2 AA in light and dark. Status rule: icon + label, or colored text, never both, never neither.

## Direction contract

THESIS: Voting is dot-voting. The board is a workshop wall where people stick round dots on the ideas they want; refuses the grey SaaS list with a tiny up-arrow counter.

OWN-WORLD: Warm charcoal ground (#1A1716 dark, warm off-white light), warm surfaces and borders, generous radii (14–18px cards, pill controls). Saturated status colors appear as round stickers with a light keyline. Owner primary owns every live state (voted, selected, primary action). Bricolage Grotesque display, Figtree UI. Tabler icons.

STORY: A visitor sees what others want, sticks a dot on it in one tap, suggests something new from the bottom bar, and later hears it shipped. An owner triages a request with one floating bar and feels the board is alive.

FIRST VIEWPORT: /feedback: top bar (logo + app name left, Feedback/Roadmap/Changelog pills, search + avatar right); friendly 44px headline and one-line explainer; list of request cards, each led by a 58px vote sticker (dashed empty spot → filled primary sticker with keyline, rotated −7°, soft drop shadow when voted); floating pill bar bottom-center: Trending/Newest tabs, Board and Status drop-ups, primary "Suggest something".

FORM: Dot vote (workshop dot-voting stickers), position 1 on the grounded list (Impeccable's pick, chosen by the user over the rolled direction). seed: none (unavailable)

SIGNATURE MOVE: The vote sticker "slaps" on (scale 1.15→1, rotate 0→−7°, shadow lands) and peels off on unvote; status icons share the sticker keyline.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

Light-mode rendition; mobile compaction of the bottom bar; landing page composition.
