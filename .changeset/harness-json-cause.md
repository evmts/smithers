---
"@smthrs/harness": patch
---

A `HarnessError` whose cause is a provider's `ModelError` keeps it across the journal. `AgentAction` renders the
`ModelError` to JSON before journaling, but `Schema.Defect` decoded it back to an `Error` without its fields, so a flow
that caught a refused model call saw `{}` as the cause and couldn't tell `no_route` from `rate_limited`. The cause
schema now tries `ModelError` (after `Evaluator.EvaluatorError`) before `Schema.Defect`, so the replayed cause is a
`ModelError` with its `code`, `httpStatus` and reset fields. Any other cause still encodes through `Schema.Defect`.
