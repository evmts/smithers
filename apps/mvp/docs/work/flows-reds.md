---
title: Burn down flows and database reds on main
status: in-progress
area: sdk
owner: codex-flows-reds
updated: 2026-10-22
links: []
---

Baseline: b698e0591730. Reproduce on Latitude; fix each cause in a separate
local jj commit. Never push or alter coverage gates. Catalog entries:
`@smthrs/flows`, `@smthrs/platform-node`, `@smthrs/database` and
`@smthrs/artifacts`. All installs and checks run through lat-run.

Flows baseline: 30 files, 234 tests; 4 files failed, 6 tests failed.
Database baseline and uncovered branch classification pending.
