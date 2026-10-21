---
"@smthrs/time-travel": minor
---

Store implementers must add `forgetForkIntent`, keep returning reclaiming intents
from `abandonForkIntents` until lane removal is recorded, and atomically refuse
`createFork` with `fence_lost` when its reservation was reclaimed. SQL migration
0006 adds the nullable completion timestamp and makes older reclaimed intents
retryable. Callers get startup retries after failed or interrupted lane removal;
a fork reclaimed while provisioning resets even a forgotten intent to reclaiming
in the refusal transaction, then fails after commit with `fence_lost`. Startup
retries lane removal if its refused-commit cleanup fails; successful cleanup
makes the later forget a no-op. Retrying the fork uses a fresh child id.

`ForkIntent.reclaimedAtMs` is optional for older encodings but always supplied by
`abandonForkIntents`. Store implementations must strictly advance it on every
claim and reopen, even within one millisecond. `forgetForkIntent(childRunId,
reclaimedAtMs)` now requires that stamp and acknowledges only an unforgotten row
with the same current stamp. Delayed acknowledgments cannot erase reopened work.
Reclaimed reservations reopen and fail `fence_lost` before any other validation,
including parent liveness checks.
