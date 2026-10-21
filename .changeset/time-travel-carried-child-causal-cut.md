---
"@smthrs/time-travel": patch
---

A fork's carried child is cut by its own journal sequence instead of by the
parent frame record's emission time. The child keeps every record before the
first one that reached it from outside, a `deferred-completed` record or a
`cancel-requested` decision, because either may come from the parent's history
after the frame. A child that ran on a host with a skewed clock is now carried
the same as one that did not. Before, a child whose clock ran ahead lost history
the parent's frame had already consumed and ran its steps again, and one whose
clock ran behind kept records written after the frame. A deferred the child
awaited after the cut must be completed again on the carried child.
`MemoryTimeTravelStore` cuts the same way; `JournalRecord.emittedAtMs` stays
accepted and no longer orders anything.
