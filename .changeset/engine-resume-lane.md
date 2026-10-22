---
"@smthrs/engine-store": minor
"@smthrs/flows": minor
---

Resumed runs wait their turn; a run someone starts does not. `EngineStore.Options.resumeConcurrency` (and `Runtime.Options.resumeConcurrency` in `@smthrs/flows`) bounds how many runs the engine resumes on its own at once: the runs its sweep reclaims and the runs a host drives with `EngineStore.drive`. The rest wait in the order asked. `execute`, a join, a wake from a deferred, clock or child, `interrupt`, and the sweep's delivery of a cancellation never wait, and they drive a run still waiting its turn at once. Absent, the default, keeps every resumption immediate.
