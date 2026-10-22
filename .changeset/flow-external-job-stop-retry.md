---
"@smthrs/flow": minor
---

A job's stop is never acknowledged unrecorded. `ExternalJob`'s `Operations.cancel` and `Operations.abandon` may now
fail with the adapter's error, and the step's cancel is an action the engine retries as it retries `start`; only the
rollback of an interrupted run, which has no step to retry in, asks once and logs a failure by operation and key.

`ExternalJob.make(...).flows` lists the job's declarations, the job and its two continuations, for a host that resolves
an execution's flow by its tag, such as a Durable Object per execution: `call` runs the job as its own child execution,
and each round hands off to a continuation.
