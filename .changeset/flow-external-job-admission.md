---
"@smthrs/flow": minor
---

`ExternalJob` no longer leaves external work running when a generation's
`start` never answered, and its deadline now bounds every provider call.

- `Operations.abandon(payload, key)` is new and optional. A job calls it when
  the run is cancelled, the deadline passes, or `start` fails before `start`
  returned a handle, since the provider may already have admitted the key. A
  provider must let `abandon` of a key it has not admitted yet win over a later
  `start` of that key.
- No `start` runs after the journaled deadline, so an engine retry or a
  restarted host's replay can't admit work late. A `start` still running at the
  deadline is abandoned, and a `collect` still running at it is cancelled; both
  fail `ExternalJobTimedOut`.
