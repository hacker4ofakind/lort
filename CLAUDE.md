# Working on Lort

## Review process for every PR

1. **Round 1:** the owner runs their CodeRabbit-style review on the PR and pastes its findings here. Verify each finding against the current code before acting: reproduce it with a failing test where possible, fix what is real, and give a short reason for anything skipped. Take the time to make robust fixes; don't rush. Push one commit.
2. **Round 2:** the same review runs again on the latest commit, to catch anything round 1 introduced or missed. Handle it the same way and push.
3. **Docs commit:** after both rounds, make a third commit that brings every doc up to date with what changed: the spec in `.superpowers/specs/`, the plans in `.superpowers/plans/`, `DESIGN.md`, `PRODUCT.md` and any READMEs.

The review can't post on the PR, so its findings always arrive in the chat. Don't subscribe to PR activity for it.
