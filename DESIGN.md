---
name: Lort
description: Self-hosted feedback board where users stick dots on what they want.
colors:
  ground: "#1a1716"
  ground-light: "#f3f1ef"
  ground-sunken: "#151211"
  ground-sunken-light: "#ebe7e4"
  surface: "#24201e"
  surface-light: "#ffffff"
  surface-2: "#2c2725"
  surface-2-light: "#efeae6"
  surface-3: "#352f2c"
  surface-3-light: "#e4ddd8"
  border: "#352f2c"
  border-light: "#e3ddd8"
  border-strong: "#423a36"
  border-strong-light: "#cfc6bf"
  dot-empty: "#7a6e67"
  dot-empty-light: "#8c817a"
  ink: "#f5efea"
  ink-light: "#1e1a18"
  ink-2: "#d8cdc5"
  ink-2-light: "#3d3532"
  muted: "#b3a79e"
  muted-light: "#655b55"
  primary: "#cc3a6d"
  on-primary: "#ffffff"
  primary-text: "#f08aae"
  primary-text-light: "#b02a5a"
  primary-soft: "#3a1e29"
  primary-soft-light: "#f9e3eb"
  keyline: "#f5efea"
  keyline-light: "#ffffff"
  focus: "#f5efea"
  focus-light: "#1e1a18"
  danger-text: "#ff8a7a"
  danger-text-light: "#b42318"
  note-bg: "#2a2418"
  note-bg-light: "#fbf3df"
  note-border: "#6b5a33"
  note-border-light: "#c9a961"
  note-ink: "#e8c77e"
  note-ink-light: "#7a5a12"
  status-pending: "#eab308"
  status-pending-light: "#b27703"
  status-reviewing: "#f97316"
  status-reviewing-light: "#e2520b"
  status-planned: "#38bdf8"
  status-planned-light: "#0284c7"
  status-progress: "#a855f7"
  status-progress-light: "#9333ea"
  status-completed: "#22c55e"
  status-completed-light: "#15913f"
  status-closed: "#ef4444"
  status-closed-light: "#dc2626"
  status-pending-text-light: "#8f5606"
  status-reviewing-text-light: "#b23a0a"
  status-planned-text-light: "#0369a1"
  status-progress-text: "#c084fc"
  status-progress-text-light: "#7e22ce"
  status-completed-text: "#4ade80"
  status-completed-text-light: "#13733a"
  status-closed-text: "#f87171"
  status-closed-text-light: "#b91c1c"
typography:
  display-xl:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 800
    lineHeight: "46px"
    letterSpacing: "-0.03em"
  display-l:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: "38px"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "25px"
    letterSpacing: "-0.01em"
  count:
    fontFamily: "Bricolage Grotesque, Figtree, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    lineHeight: "17px"
    fontFeature: "tnum"
  body-lg:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "26px"
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "23px"
  label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  caption:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  micro:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: "14px"
rounded:
  sm: "10px"
  md: "16px"
  lg: "18px"
  xl: "22px"
  pill: "999px"
  full: "50%"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "14": "56px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "42px"
  button-secondary:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "42px"
  button-ghost:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "42px"
  chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "34px"
  vote-sticker-empty:
    textColor: "{colors.ink}"
    typography: "{typography.count}"
    rounded: "{rounded.full}"
    size: "58px"
  vote-sticker-voted:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.count}"
    rounded: "{rounded.full}"
    size: "58px"
  request-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px 22px"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "16px 16px 10px"
  floating-bar:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.pill}"
    padding: "8px"
  internal-note:
    backgroundColor: "{colors.note-bg}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.lg}"
    padding: "14px 18px"
---

# Design System: Lort

Live, browsable version (tokens, component previews, both themes): the "Lort" Design System artifact at https://claude.ai/artifact/A9Uo2hkwam4Q63WKpUhtVA. Token values here mirror it; keys ending `-light` are the light-theme value of the key without the suffix.

## Overview

**Creative North Star: "The Dot-Vote Wall"**

Lort's board is a workshop wall: people walk up, read the ideas, and stick round dots on the ones they want. The interface around the dots stays warm, plain and quiet so the stickers, the status circles and the owner's own brand carry the screen. Surfaces are warm charcoal in dark (the first theme) and warm pale grey with white cards in light; both follow the visitor's system setting.

Density is relaxed on the public board (big friendly headline, generous cards) and a notch tighter in the dashboard. Everything clickable is a pill; containers are soft rectangles; stickers, status icons and avatars are circles with a light keyline. The owner's primary colour is the only accent and owns every live state.

**Key Characteristics:**
- Voting is a round sticker that slaps onto the card (tilt −7°, keyline, drop shadow).
- Six status circles that fill from the bottom as a request progresses.
- Warm neutrals, one owner-chosen accent, status colours only for status.
- Bricolage Grotesque for headlines and counts, Figtree for everything else.
- Floating pill bars at the bottom centre for the board's controls and the dashboard's triage.

## Colors

Warm, low-chroma neutrals with one accent the board owner chooses, plus six status colours reserved for status.

### Primary
- **Owner Pink** (`#cc3a6d`, demo value): the owner's primary colour. Primary buttons, the voted sticker, switches, selected states, the realtime "new" tint (`primary-soft`). As text or an outline use `primary-text` (`#f08aae` dark / `#b02a5a` light). Replaced at runtime by Settings → Primary colour; a custom hex is auto-adjusted so `on-primary` and `primary-text` keep 4.5:1.

### Status
- **Pending Yellow** (`#eab308` / `#b27703`), **Reviewing Orange** (`#f97316` / `#e2520b`), **Planned Sky** (`#38bdf8` / `#0284c7`), **In-progress Violet** (`#a855f7` / `#9333ea`), **Completed Green** (`#22c55e` / `#15913f`), **Closed Red** (`#ef4444` / `#dc2626`). Icon marks only, ≥3:1 on ground, surface and surface-2 in both themes.
- **Status text** (`status-*-text`): the same statuses as coloured text with no icon, ≥4.5:1 on ground, surface and surface-2 in both themes. In dark, pending, reviewing and planned reuse the icon colour.

### Neutral
- **Charcoal Ground** (`#1a1716` / `#f3f1ef`): page background.
- **Sunken Ground** (`#151211` / `#ebe7e4`): dashboard sidebar.
- **Card Surface** (`#24201e` / `#ffffff`): cards, composer, modals.
- **Raised Surface** (`#2c2725` / `#efeae6`): chips, floating bars, active nav pill.
- **Button Surface** (`#352f2c` / `#e4ddd8`): secondary buttons on a bar.
- **Warm Ink** (`#f5efea` / `#1e1a18`): titles and primary text. **Ink 2** (`#d8cdc5` / `#3d3532`): body copy. **Muted** (`#b3a79e` / `#655b55`): meta, placeholders.
- **Dot Spot** (`#7a6e67` / `#8c817a`): dashed outline of an empty vote spot.
- **Note** (`note-bg`, `note-border`, `note-ink`): internal team-only notes, nowhere else.

### Named Rules
**The Owner's Colour Rule.** `primary` is the only accent and it means "live": voted, selected, primary action. It never decorates.

**The Status Label Rule.** A status is shown as icon + label in ink, or as label text in its status colour. Never both, never neither. An icon-only status (the requests table) has a tooltip and an `aria-label`.

## Typography

**Display Font:** Bricolage Grotesque (with Figtree, system-ui)
**Body Font:** Figtree (with system-ui)

**Character:** A chunky, slightly quirky grotesque for headlines and vote counts, next to a clean, round, friendly sans for everything you read and click.

### Hierarchy
- **Display XL** (800, 44/46, −0.03em): public page headlines.
- **Display L** (800, 34/38, −0.025em): request titles, changelog post titles.
- **Title** (700, 20/25, −0.01em): card titles, modal titles, settings section headings.
- **Count** (800, 17/17, tabular): numbers inside vote stickers.
- **Body LG** (400, 17/26): page intros.
- **Body** (400, 15/23): descriptions, comments, changelog body; max 68ch.
- **Label** (600, 14/20): buttons, nav pills, chips, tabs.
- **Caption** (500, 13/18): meta rows.
- **Micro** (700, 11/14): badges and counters.

### Named Rules
**The Sentence Case Rule.** Every label, heading and button is sentence case. No uppercase tracking labels, no eyebrows above headings.

## Layout

- Public board: top bar (logo + app name left; Feedback / Roadmap / Changelog pills; search and avatar right), one centred column (max 860px), 32px gutters on desktop and 24px on phones, `space-3` between cards, 140px bottom padding so content clears the floating bar.
- Dashboard: collapsible sidebar (244px expanded) on Sunken Ground, content centred at max 820px with 40px padding, triage bar floating at the bottom centre of the content area.
- Phones: the floating bar compacts to sort tabs + one filter button (bottom sheet) + a round 48px primary "+".
- Spacing steps: 4, 8, 12, 16, 20, 24, 32, 40, 56px.

## Elevation & Depth

Flat at rest; tonal layering (ground → surface → surface-2 → surface-3) carries most depth. Drop shadows mean "stuck on" or "floating above"; inset shadows mean "pressed in". Nothing else.

### Shadow Vocabulary
- **Sticker** (`0 3px 8px rgba(0,0,0,0.45)` dark / `0 2px 6px rgba(60,30,20,0.28)` light): voted stickers and the app logo mark.
- **Float** (`0 14px 36px rgba(0,0,0,0.5)` / `0 14px 36px rgba(60,40,30,0.18)`): floating bars, menus, modals.
- **Card float** (`0 8px 20px rgba(0,0,0,0.35)` / `0 8px 20px rgba(60,40,30,0.12)`): small floating cards and a card being dragged.
- **Inset small** (`inset 0 2px 3px -1px rgba(0,0,0,0.9)` / `inset 0 2px 3px -1px rgba(60,30,20,0.2)`): pressed slightly into the page along the top edge. Used on the SortTabs track, the FloatingBar, the TriageBar and toasts; layered with Float on the floating ones (`box-shadow: var(--shadow-inset-sm), var(--shadow-float)`). Containers only; buttons and cards stay flat.

Each shadow has a utility class in `design/components/lort.css`: `.lt-shadow-sticker`, `.lt-shadow-float`, `.lt-shadow-card-float`, `.lt-shadow-inset-sm`.

### Named Rules
**The Only-Stickers-Tilt Rule.** Voted stickers rotate −7° and the logo mark −4°. Nothing else rotates.

## Shapes

Pills for everything clickable (buttons, chips, tabs, inputs, nav, floating bars). Soft rectangles for containers: cards and notes 18px, composer and modals 22px, menus and reply bubbles 16px, thumbnails and the logo mark 10px. Circles (with a keyline ring) for stickers, status icons and avatars.

## Components

React 18 + TypeScript source for each lives in `design/components/src/` (styles in `design/components/lort.css`, classes prefixed `lt-`); copy them into the Next.js app as client components. The design system artifact has a live, interactive preview and usage notes for each.
- **StatusIcon:** 16px circle; 1.5px ring in the status colour, 30% tint inside, solid fill rising from the bottom (0 / 28 / 50 / 80 / 100%), check for Completed, cross for Closed.
- **VoteSticker:** 58px (40px compact). Empty: 2px dashed Dot Spot ring. Voted: primary fill, 3px keyline, −7° tilt, sticker shadow. The signature motion: slap on (scale 1.15 → 1 and rotate to −7° over ~220ms, springy) and peel off (160ms). Instant under reduced motion.
- **Button:** primary / secondary / ghost / danger-text pills, 42px (32px small). One primary per view; no filled red buttons.
- **Chip:** 34px pills on Raised Surface for status, board, tags, add-tag and the visibility switch.
- **SortTabs:** Trending / Newest with an ink indicator that slides (Motion `layoutId`); the selected label inverts.
- **FloatingBar:** sort tabs, Board and Status drop-ups (open upward, Clear at the bottom, state in the URL), primary "Suggest something".
- **RequestCard:** sticker left; title, two-line excerpt, meta row (status, board pill, author, comments).
- **Composer:** prompt-box comment field: images (≤3), a Public/Internal toggle for admins (no chevron; flat in Public with a hover fill; borderless in Internal with a note-tint hover and a small lock tip), mic only when voice is enabled, round send.
- **TriageBar:** status-driven actions for the dashboard request page; forward action is the one primary button, last.
- **InternalNote:** note-bg, 2px dashed note-border, "Only the team sees this".
- **Avatar:** picture or initial on a warm fill picked from the name; keyline on public pages; primary ring for team members.
- **FilterMenu:** multi-select drop-up behind a secondary button, custom checkboxes, Clear at the bottom; summary text on the trigger.
- **Toast:** past-tense confirmation with at most one action; undo toasts draw a 60-second countdown bar in primary.

## Do's and Don'ts

- **Do** use Tabler icons (outline, 2px stroke) and Lort's own SVG components for statuses and stickers.
- **Do** build per-page skeletons that match the real layout, drawn in Raised Surface.
- **Do** hide controls for features switched off in Settings rather than disabling them.
- **Do** keep a 3px solid focus ring with a 3px offset on everything focusable.
- **Don't** use status colours for tags, boards or charts.
- **Don't** use emoji, Unicode glyphs as icons, gradients, glass effects or coloured side-stripes on cards.
- **Don't** show "Lort" on public pages beyond the footer and the optional "Get your own board" card.
- **Don't** use cream or serif display type; the warmth comes from the charcoal and the stickers.
