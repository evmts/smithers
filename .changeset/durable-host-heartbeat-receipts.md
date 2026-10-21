---
"@smthrs/flow": minor
"@smthrs/run-store": minor
"@smthrs/engine-store": minor
---

Add generic, bounded host liveness receipts to interpreter registrations. The durable process driver dispatches `Interpreter.ExecutionOptions.onHeartbeat` only after confirmed ownership heartbeats, separately from its lease writer. Receipts are reinstalled on resume, cannot overlap within a run, and end with the driven round; stalled HTTP never blocks lease renewal. `Ownership.heartbeatLoop` exposes the nonblocking `onPulse` host hook. Count receipt completion, overlap skips and failures without recording application content.
