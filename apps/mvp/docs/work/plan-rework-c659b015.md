---
title: Rework plan compatibility and safety fix
status: done
area: SDK
owner: codex-rework-c659b015
updated: 2026-10-21
links: []
---

Reapply c659b015 on current main using the library catalog's @smthrs/plan entry.
Preserve historical scope decoding and current encoding. Flow's rejection test
now uses an unknown scope because persisted workflow/global values remain readable.
The catch combinator now builds its arm through arm(); validate self before that
path and retain regression assertions that continuation builders never run.

Latitude validation: plan vitest passed 29 files / 1,856 tests with 100%
statements, branches, functions and lines. Type-check and dprint check passed.
Flow cache-policy regressions passed 9 tests. The requested plan importRules
command failed with unknown_label: this base declares no such target.

Full flow vitest passed 70 files / 919 tests with 100% aggregate coverage.
Plan eslint src --max-warnings=0 passed. No fixed sleeps were added.

The separate flow importRules command also failed with unknown_label; neither
package declares that target on this base. These checks were attempted on Latitude.
