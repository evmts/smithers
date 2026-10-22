---
"@smthrs/journal": patch
"@smthrs/engine-store": patch
---

A drive writes its node records in its other transactions instead of one
each. `Journal.emitDeferred(input, owner)` queues a fenced lifecycle entry,
and the run's next durable write through the journal commits it first, in
emission order: the next `emitDurable`, `emitDurableUnfenced` or `checkpoint`
of the run, a `transact` that names the run's partition, or `flush`. Inside an
open transaction it writes at once; an owner that lost the run loses what it
queued. The engine store queues every node record but the plan record. A
not-found `repo/Clone` alarm now writes its 38 journal entries in 14
transactions instead of 38.

Sibling savepoints may flush one batch before their outer transaction commits;
its commit callbacks safely clean up the batch more than once. This preserves
agent module resume after a human answer.
