---
title: Fork intent reclamation review
status: done
area: sdk
owner: codex-sol
updated: 2026-10-21
links:
  - packages/smithers/flows/time-travel/docs/api.md
---

Address the second review round: fence sweep acknowledgments with a reclamation
stamp and reopen reclaimed reservations before all fork validation. Use the
library catalog's `@smthrs/time-travel` entry. Run regressions on real memory and
SQL stores, package checks, lint, and the SQLite/PostgreSQL coverage matrix.

Both reported races reproduced before the fix on SQL and memory stores.
Added delayed-acknowledgment, same-millisecond claim supersession, live-parent
reservation fencing, and legacy schema decoding regressions. Reclamation stamps
strictly increase; acknowledgments compare the exact claim before completion.

Validation: package check and lint pass. The SQLite/PostgreSQL matrix has 1,410
passing tests and 100% lines, branches, functions, and statements in the merged
report. Its only failures are the pre-existing README-paragraph test in each
dialect, left unchanged as requested. No push or main movement is authorized.
