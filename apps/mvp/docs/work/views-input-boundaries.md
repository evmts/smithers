---
title: Views input boundaries
status: done
area: views
owner: codex-fix-packages-smithers-ui-views-src-213420
updated: 2026-10-21
links:
  - packages/smithers/ui/views
---

Reproduce and repair the five reported Home, Interactions and WebPage input validation bugs. Use the existing @smthrs/views schemas and framing API; no new libraries.

All five findings reproduced as failing regression tests before the fixes. Full package suite: 211 tests passed, 100% statements/branches/functions/lines; package TypeScript checks passed on Latitude. The package importRules target passed on Latitude.
