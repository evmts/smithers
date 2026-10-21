---
"@smthrs/time-travel": patch
---

`EffectBoundary.guard` keeps its result and its boundary evidence in
agreement when an action succeeds but its `succeeded` record fails. It writes
`unknown` at the terminal sequence and fails with a `TimeTravelError` coded
`unknown`. When that write conflicts because the `succeeded` record committed
and only its acknowledgment was lost, an identical `succeeded` write confirms
it and `guard` returns the value. Before, `guard` failed and left the journal
at `intended`, or failed while the journal said `succeeded`.
