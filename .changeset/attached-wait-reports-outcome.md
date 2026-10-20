---
"@smthrs/cli": patch
"@smthrs/control": patch
"@smthrs/engine-store": minor
"@smthrs/agent": patch
---

`smthrs flow start --wait` always ends with what the run did. The receipt names
the outcome in `status` (`completed`, `failed`, `cancelled`, `parked`), so a
passing run no longer prints a bare `_tag: Accepted`. A run parked on
`released`, because the engine interrupted a step when its host's lease lapsed,
ends the wait with exit status 3 and the command that resumes it, instead of
waiting forever. An interruption names its signal instead of "All fibers
interrupted without error".

A busy project no longer interrupts its own runs. `DurableEngineState` gains
`readTransaction`, one read snapshot that takes neither the write permit nor
the store's write lock, and run observation uses it: every health beat of every
open run used to take the engine's write lock, which queued lease heartbeats
until leases lapsed. `codeDrift` reads the flows on disk only when no pinned
snapshot answers.
