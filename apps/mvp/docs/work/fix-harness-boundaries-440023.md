---
title: QuickJS sandbox boundary regressions
status: done
area: harness
owner: codex-440023
updated: 2026-10-21
links: []
---

Reproduce getter completion, sparse-array probe budgeting, and initialization cleanup findings. Library catalog entry: `@smthrs/harness`; retain its Effect-scoped sandbox implementation.

Confirmed and fixed: input getter completion prevents enclosing dispatch; sparse
array holes and accessor slots spend the probe node budget. Existing call and
limit observability remains the reporting boundary. Regressions failed on the
unchanged source and passed after the fix.

Initialization cleanup was not reproduced: the public limits reject heaps below
1 MiB, and there is no Effect service for faulting runtime configuration or
context allocation. Existing low-heap tests fail after context acquisition and
therefore do not demonstrate the reported leak. No change claimed for it.

Latitude: full vitest run had 2459 passes and nine calibration failures because
the calibration helper invokes Git in a mirror without metadata. Excluding that
file: 2451 passed, three skipped, all coverage dimensions 100%. Browser e2e:
not run (mini offline).
