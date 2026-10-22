---
title: Registry metadata literal projection
status: done
area: registry
owner: codex
updated: 2026-10-21
links: []
---

Fix nested expression authority projection and JavaScript string escape decoding.

Both findings reproduced with failing metadata regression tests on Latitude.
After fixing projection boundaries and decoding, all 1,228 registry tests pass
across 40 files, with 100% statements, branches, functions and lines.
Existing metadata warnings remain the observability receipt for conservative projection.

Validation: apps/mvp pnpm exec tsc --noEmit passed on Latitude.
The requested registry :importRules target is absent at the base revision;
smithers-build reports unknown_label. Formatting checks pass.
