---
title: Code intelligence response and keyboard regressions
status: done
area: code-intel
owner: codex-code-intel-295800
updated: 2026-10-21
links:
  - ../features/code-intelligence.md
---

Reproduce six reported response ordering, keyboard, revision and URI decoding bugs. Use the existing catalog entries for platform-browser LanguageServer and effect-tanstack-db; no new libraries.

Latitude A/B: `pnpm exec vitest run src/features/code-intel/code-intel.test.ts --coverage.enabled=false`: before, 6 new regressions failed and 16 existing tests passed; after, all 22 passed. The suite includes real API, Postgres, Electric and TypeScript integration. E2e: not run (mini offline). No push or bookmark movement.
