---
"@smthrs/flow": minor
"@smthrs/engine-store": patch
"@smthrs/platform-cloudflare": patch
---

A run parked under one build no longer strands when the next build's flow can't
decode the payload it recorded, such as after a deploy that added a required
payload field. The resume used to die in the decoder on every wake: the run
never settled, a Cloudflare execution object answered
`Retrying { failure: "SchemaError" }` with backoff forever, and a browser
engine's wake failed the same way after an app update.

The engine now settles that run `failed` before any step dispatches, with the
new `Interpreter.InterpreterError` code `payload_changed` as its defect, so
`Interpreter.refusalCode` reads it from `poll` or `result` in any process. It
logs a warning naming the run and the flow and journals a `payload-changed` run
decision, neither quoting the payload. A Cloudflare execution object decodes the
stored intent's payload only to admit a run the store doesn't hold yet, so a
held run reaches the engine's refusal.

A flow's payload schema is part of its plan, so any change to it refuses that
flow's parked runs: `payload_changed` when the recorded payload no longer
decodes, `plan_changed` when it still does. Let runs settle before the deploy,
or give the new shape a new flow tag and keep the old flow registered until its
runs settle.
