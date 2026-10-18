---
"@smthrs/platform-cloudflare": minor
---

A settled execution's Durable Object now forgets its execution after a
retention window, so storage no longer grows with every execution. When a run
settles, `ExecutionObject.alarm` records when (`settledKey`) and arms one final
alarm for the end of the window, `settledRetentionMs` (one day, or the
`settledRetentionMs` option). Until then a duplicate `start` or a `wake` is
answered without a drive. At the window's end the alarm deletes the intent, the
failure count and the settlement, deletes the alarm and answers the new outcome
`Forgotten`. `Settled` now carries `forgetAtMs`.

A late `start` of the same intent settles from the run the engine stored,
runs no step and is forgotten again. The engine's run history is untouched;
`smithers gc` still owns it. `IntentConflict` now guards an execution id only
while its object holds the intent.
