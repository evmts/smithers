---
"@smthrs/time-travel": patch
---

Bind rewind commit evidence to the journal generation being truncated. Rewind
audits now record that generation before truncation, and
`TimeTravelStore.archivedAt(runId, seq, generation?)` requires an exact match when
given a generation in both SQL and memory stores. Recovery and rewind failure
handling use that generation to distinguish earlier archives from the current
commit. Legacy audits and journals without generations retain the old
generation-agnostic archive check: rolling back a committed truncation would
reverse compensation whose history has already been truncated. Explicit
committed phases remain sufficient evidence.
