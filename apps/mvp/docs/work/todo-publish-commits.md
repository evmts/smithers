---
title: Publish agent commits relative to the TODO base
status: done
area: todos
owner: codex-todo-publish-commits
updated: 2026-10-23
links: []
---

Fix production T7 empty_change after the agent committed its work. Use the catalog's @smthrs/sandbox tools and @smthrs/integrations publication; decision 0016 requires one host-created commit fenced by the TODO base.

Completed: base-relative collection includes local commits and pending changes, squashed by the existing fenced host publication. Real-repository regressions cover committed work, mixed work, empty trees, invalid paths, rename/delete handling and index preservation.

Latitude receipts: TODO/branch suites 264 passed, four existing Docker-only tests skipped; apps/mvp typecheck and importRules passed. Sandbox SDK 27 tests, check and source lint passed. Coverage disabled for selected suites; no production deployment performed.

Coverage repair: real-repository regressions refuse oversized base-relative status output and a malformed base tree path escaping the workdir. Rebased onto main a78c2907; preserved both sides of the TODO docs and test-import updates. Latitude full sandbox gate `pnpm vitest run --coverage`: 60 files passed, 855 tests passed, 31 skipped; statements, branches, functions and lines all 100%. Final dprint check passed; nyc-01 slot 1, exit 0, 147.5 seconds. Receipt: `/tmp/todo-publish-coverage-rebased.log`. No local installs or validation, no push.
