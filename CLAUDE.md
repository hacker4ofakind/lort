# Working on Lort

## Frontend stack

The web app is Next.js, shadcn/ui and Tailwind CSS, set up with `pnpm dlx shadcn@latest init -t next`, plus Motion and Tabler icons, with pnpm.

- `design/` (the canvases, `design/components` and `lort.css`) and the Claude Design artifacts are the design, treated like a Figma file. They show how the app looks and behaves. Their React and CSS are not production code: never copy, port or import them into `web/`, and never plan to.
- Build the UI from shadcn/ui components, added with `pnpm dlx shadcn@latest add …` and never written from memory. Use the shadcn component for anything shadcn has, styled through its variants and Tailwind classes. Build only what shadcn lacks, from shadcn parts and Tailwind.
- Style with Tailwind utility classes. Lort's tokens are Tailwind theme variables in `globals.css`, with shadcn's theme variables mapped onto them. No hand-written component CSS.
- If a task seems to need a different approach, ask before doing it, and say so in the plan.

## Review process for every PR

1. **Round 1:** the owner runs their CodeRabbit-style review on the PR and pastes its findings here. Verify each finding against the current code before acting: reproduce it with a failing test where possible, fix what is real, and give a short reason for anything skipped. Take the time to make robust fixes; don't rush. Push one commit.
2. **Round 2:** the same review runs again on the latest commit, to catch anything round 1 introduced or missed. Handle it the same way and push.
3. **Docs commit:** after both rounds, make a third commit that brings every doc up to date with what changed: the spec in `.superpowers/specs/`, the plans in `.superpowers/plans/`, `DESIGN.md`, `PRODUCT.md` and any READMEs.

The review can't post on the PR, so its findings always arrive in the chat. Don't subscribe to PR activity for it.
