---
title: Preserve unknown clone App installation status
status: done
area: repositories
owner: codex-fix-apps-mvp-worker-flows-089979
updated: 2026-10-21
links: []
---

An unavailable App lookup must not make a repository reclaimable. Uses the library catalog entries for @smthrs/flow and @smthrs/effect-code-storage; no new library.

Latitude A/B: `pnpm exec vitest run worker/flows/RepoClone.test.ts --coverage.enabled=false --silent` failed before the fix on both reclaimable assertions (17 passed, 2 failed), then passed all 19 tests. The full-flow fault exhausts the real two-minute retry policy before settlement. `pnpm exec smithers-build test "//apps/mvp:importRules"` passed.
