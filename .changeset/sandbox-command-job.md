---
"@smthrs/sandbox": minor
---

Adds `SandboxCommand`, a sandbox command as durable external work, so a command that runs for minutes holds no flow
step, host or exec session while it runs.

- `SandboxTools.start(session, run, { key, callsDirectory })` starts a command detached in a process session of its own
  and answers its `Started { pid, startedAt }` at once; the same key again answers the same handle and starts nothing.
  `observe` answers `running`, `finished { exitCode, timedOut }` or `lost` (the box restarted, or the runner died before
  it recorded the exit); `collect` answers the `RunResult` `execute` answers, as often as asked; `cancel` stops the
  runner's and the command's process groups while each is still the process the runner recorded, and a key cancelled
  before it started never starts. Each key has a fence of its own.
- `SandboxCommand.make(tag, { target, error? })` declares an `ExternalJob` over one command on the box `target` names,
  and `SandboxCommand.operations(reach)` implements it over that box's `Commands`; `onSession` gives a session's.
  A lost command is cancelled and fails `ExternalJobLost` (no replacement unless `restarts` is set); past its deadline,
  `ExternalJobTimedOut`.
- `ToolRefused`, `ToolLost` and `ToolUnavailable` are registered with `@smthrs/flow`'s `Fault`, so a keyed step retries
  only a session that couldn't answer.
- `execute`'s `run` and `start` share one runner script.
