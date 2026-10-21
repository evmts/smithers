---
title: "CI parity: write-only GitHub commit statuses"
status: blocked
area: sdk
owner: dogfood-loop builder (Claude Opus), from 11:20 on 2026-10-21
updated: 2026-10-21 11:45 PDT
links: [../rulings.md, ../proposals/ci-cd-parity.md, ../features/pulls.md, ci-parity-required-checks.md, ci-parity-github-writes.md, no-github-actions.md, dogfood-loop.md]
---

**What:** Publish durable Smithers flow outcomes as GitHub commit statuses named `smithers/<flow>` on the exact tested commit.

**Why:** GitHub branch protection must be able to require Smithers checks without reading or displaying GitHub Actions (GH-10). The [dogfood loop](dogfood-loop.md)'s step 4 reports our CI this way.

**Current state:** Built, 2026-10-21 11:45, in the dogfood workspace ([pull requests](../features/pulls.md#commit-statuses)):
- `@smthrs/integrations` gains `GitHub.Statuses.create` (write-only; 20 tests on a real socket, 100%).
- `checks/Run` reports each check `pending` as it starts (best effort) and its result from `runs` in a durable `checks/Report` step after the scripts and after the review, as the App with a token minted for `statuses: write` only.
- Refusals (no permission, no App, an unknown commit) are recorded once and never retried; outages and lost answers are retried.
- `docs/rules.md`'s `github.no-actions` and its Jev rule allow this one write.

**Blocked on:** the production App lacks "Commit statuses: Read and write" (the prod-flows panel's live check, 2026-10-21: Issues, Contents and Pull requests write, Metadata read). Until Will grants it and the smithersai installation accepts it, production records each status `refused` and the checks still run. The lead asked Will on 2026-10-21 about 11:25.

**Next step:** Once the permission is granted, run a TODO on production and read `smithers/<name>` on its head through GitHub's combined status as a person would. Requiring a check on `main` is [required checks](ci-parity-required-checks.md).

**Open questions for Will:** None beyond the permission the lead asked for.

## History

2026-10-20 23:44 PDT: added by the Codex tracker curator from the lead's text and Will's queue answer (GH-10, 23:36:55).

2026-10-21 11:45 PDT: built by the dogfood-loop builder; production waits on the App permission.
