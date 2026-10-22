---
"@smthrs/run-store": minor
"@smthrs/journal": minor
"@smthrs/engine-store": minor
"@smthrs/platform-cloudflare": patch
---

A resumed run's replay no longer costs statements per replayed step. A round reads its run's attempt rows (`AttemptStore.listRun`, new and optional) and, into the journal's memory, its committed entries (`Journal.recall`, new and optional) in one read transaction, and answers each recorded step's attempt number and row from them. A dispatch that a recorded success, failure, or suspension answers on its own sends no fence heartbeat; every dispatch that runs a body or writes more still heartbeats first, so a run that lost its fence is stopped at its first such step. The node, plan, and attempt records a replay re-emits are not written when the journal already holds them with the same content (`Journal.recorded`, new and optional; `emitDeferred` drops them), while a record a crash lost is still written through the fenced channel. `EngineStoreMetrics.replaySeeds` counts the rounds that read their seed. On `@smthrs/platform-cloudflare`'s command-latency benchmark (a command that outlives its drive's budget, Postgres at a 25 ms round trip, 20 replayed steps) the woken run's stretch from its alarm to the step's answer falls from 1,086 statements and 25.1 s to 310 statements and 7.3 s (31 statements for each replayed step to none), and the call's overhead from 40.7 s to 20.9 s. Uses the library catalog's `@smthrs/flow` durable engine entry.
