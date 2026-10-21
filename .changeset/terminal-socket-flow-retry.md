---
"@smthrs/flow": minor
"@smthrs/platform-browser": minor
---

A terminal socket redials on the flow engine's retry decision instead of a
reconnect loop of its own.

- `RetryPolicy.schedule(policy)` in `@smthrs/flow` is the engine's retry
  decision as an Effect `Schedule`, for work no durable step can hold, such as
  a socket a page keeps open. Each failure is decided by
  `RetryPolicy.decideEffect`; the schedule ends when the policy gives up. Its
  output is the attempt that just failed.
- `TerminalSocket.connect` redials through `Stream.retry` on that schedule.
  `TerminalSocket.reconnect` is `TerminalProtocol.reconnect` as a
  `RetryPolicy`, the default, and `options.reconnect` takes another. The
  statuses and delays are unchanged.
- An `onOutput` that throws ends the connection as `Closed` with 1011, hangs
  up and logs `browser.terminal.closed`, instead of leaving the status stale.
