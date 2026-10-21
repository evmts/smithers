---
title: "CI parity: write-only GitHub commit statuses"
status: todo
area: sdk
owner: unassigned; lead schedules after deployment
updated: 2026-10-20 23:44 PDT
links: [../rulings.md, ../proposals/ci-cd-parity.md, ci-parity-required-checks.md, ci-parity-github-writes.md, no-github-actions.md]
---

**What:** Publish durable Smithers flow outcomes as GitHub commit statuses named `smithers/<flow>` on the exact tested commit.

**Why:** GitHub branch protection must be able to require Smithers checks without reading or displaying GitHub Actions.

**Current state:** Will approved write-only statuses at 23:36:55; lead recorded GH-10 at 23:37. Implementation is after deployment and has no completion receipt. This explicitly amends M-52; it does not grant Actions ingestion or agent merge authority.

**Next step:** Add a scoped status-write action through the Smithers integration library and durable flow layer. Prove pending and terminal outcomes, failed delivery/recovery, stale-head isolation and branch-protection use with real dependencies. Document permissions and content-free observability.

**Open questions for Will:** None; the permission decision is answered.

History: added by Codex tracker curator from script-extracted lead text and Will’s queue answer, 2026-10-20 23:44 PDT. Execution remains unassigned; no product tests performed by tracker.
