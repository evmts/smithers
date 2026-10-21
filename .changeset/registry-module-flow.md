---
"@smthrs/registry": minor
---

Adds `ModuleFlow.fromModule`: a `flow.ts` module's descriptor, the tag `Flow.make("<tag>", ...)` declares, and its
warnings, read from source text without importing it. `Discovery` reads every module entry through it, and a host that
keeps a flow's source outside a file system (a database row, an editor buffer) reads it the same way.
