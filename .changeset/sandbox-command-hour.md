---
"@smthrs/sandbox": minor
---

A `SandboxCommand` job's command may run for up to an hour, where `SandboxTools.execute`'s still stop at 600 seconds.

- `SandboxCommand.make(tag, { maxTimeoutSeconds? })` sets the longest command the job takes, `defaults.maxTimeoutSeconds`
  (3600) unless set; its payload's `call` is a `SandboxCommand.Run(maxTimeoutSeconds)`, so a call past it is refused
  before anything starts. `SandboxCommand.Run(seconds)` is the same schema for a caller's own input.
- The job's deadline defaults to `maxTimeoutSeconds` plus `defaults.slack` (20 minutes). `make` throws a `RangeError` for
  a `timeout` that wouldn't cover a command at its limit, its 5-second stop and `probe.max`, and for a
  `maxTimeoutSeconds` under 60 seconds, the timeout of a call that names none.
- `defaults` is `{ probe, maxTimeoutSeconds, slack }`; `defaults.timeout` is gone.
