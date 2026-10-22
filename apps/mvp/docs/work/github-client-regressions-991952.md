---
title: GitHub client URL privacy and reconciliation regressions
status: done
area: integrations
owner: codex-991952
updated: 2026-10-21
links: []
---

Uses the library catalog entry `@smthrs/integrations` for GitHub calls.
Reproduce URL leakage in request, pagination and count spans; counting from a
caller final page; and adoption of a copied issue marker in a truncated scan.

Latitude baseline: six new regression cases fail; 154 existing cases pass.

Fixed all four findings. URL-bearing transport spans are disabled for this
client; GitHub spans retain method, response status and classification without
caller paths. Count forces page one. Issue reconciliation refuses truncated
scans even when a marker matches.

Latitude validation: `pnpm exec vitest run` passed 766 tests; four credentialed
GitHub live tests skipped. Coverage gates passed: GitHubClient.ts and Issues.ts
100% on all measures, package branches 100%, lines/statements 99.95%, functions
99.85%. `pnpm exec vitest run test/ClientTracing.test.ts test/GitHubClient.test.ts
test/Issues.test.ts --coverage.enabled=false` first failed six regressions on
unchanged production code (154 passed). Full post-fix suite also passed without
coverage. Targeted dprint formatting completed.
