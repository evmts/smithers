---
"@smthrs/gateway": patch
---

A planned continuation reads as waiting until it can start. The engine schedules a `Node.bindPlanned` continuation
with its plan, ahead of the node it follows; `traceFromJournal` showed it `running` from then, so a run's page drew every
later step Working, each with a bar from the run's start. Now a scheduled node whose plan dependencies haven't all
settled is `pending`, and becomes `running`, timed from then, when the last of them settles (a dependency scheduled
again, or settled `deferred`, keeps it waiting). `monitorFromJournal` shows a pending node `next` and as no step yet.
