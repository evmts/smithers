---
title: Prompt submission and action menu regressions
status: done
area: sdk
owner: Codex fix-packages-smithers-ui-src-prompt-901884
updated: 2026-10-21
links: [../../../../packages/smithers/ui/src/prompt/PromptInput.tsx]
---

Fix overlapping submission, borrowed attachment URL lifetime across acceptance
and unmount, and keyboard activation of wrapped action buttons.
Uses the library catalog's Render UI entry, `@smthrs/ui`.
Regression tests run through Latitude against the React component boundary.

Validation: the final real-URL regressions fail on the original source (7
failures, 14 passes). The fixed package suite passes all 2,566 tests across 179
files on Latitude. No fixed sleeps or mocked object URL registry.
The package importRules target also passes on Latitude (1 ran, 0 failed).
