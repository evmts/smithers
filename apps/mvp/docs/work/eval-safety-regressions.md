---
title: Eval safety regressions
status: done
area: evals
owner: codex
updated: 2026-10-21
links: []
---
Reproduce the six reported evaluation harness findings with Latitude tests.

All six findings reproduced and fixed. Filtered or unsafe runs cannot replace the baseline; empty trials are
rejected; navigation is checked after browser URL normalization. Dispatch exits are observed before polling,
and provider scopes close at teardown and on acquisition failure.

Library catalog entry: @smthrs/evals remains the baseline/runner implementation; Effect provides scopes and exits.
No new library or feature interface.

Latitude regression run before fixes: 8 failed, 56 passed, including unhandled-rejection events and an unrun
finalizer. Original revision: evals plus agent integration, 77 passed. After fixes with regressions, 87 passed. Eval TypeScript check passed.
Browser e2e: not run (mini offline).
