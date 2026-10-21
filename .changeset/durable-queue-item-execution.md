---
"@smthrs/flow": major
---

`DurableQueue` workers run each item as a durable execution, so a recorded handler result is never lost or redone.

- The item's first step runs the handler and records its exit; the second records that exit against the caller's
  deferred under `DurableQueue.completionRetryPolicy`, which the engine retries without a limit. A completion the store
  refuses no longer runs the handler again, and the caller always receives the handler's exit once the store records it.
- The persisted queue never drops an item, and a redelivery attaches to the item's execution.
- Breaking: `makeWorker` and `worker` drop the `maxAttempts` option. Retries are the engine's, not the queue's.
- New: `DurableQueue.CompletionUnavailable` (fault class `infra`) and `DurableQueue.completionRetryPolicy`.
