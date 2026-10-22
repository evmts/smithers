---
title: Control quiet watch and rejection replay
status: done
area: control
owner: codex-rework-88e17533
updated: 2026-10-22
links: []
---

Rework 88e17533b366 on main's downstream snapshotComplete/Deferred handoff.
Use the library catalog's @smthrs/journal and @smthrs/control entries.
Periodic tail checks recover quiet partitions; rejected mutations retain their outcomes.

Latitude validation: baseline regressions 9/9 failed; reworked control suite
1192 passed, 1 existing skip; agent port suite 81 passed; control importRules
passed; TypeScript test project passed. Coverage thresholds were not executed
(the suite used --coverage.enabled=false).
