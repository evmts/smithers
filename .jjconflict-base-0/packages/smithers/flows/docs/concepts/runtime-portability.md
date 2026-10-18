---
title: "Runtime portability"
description: "One durable engine, with Effect services selected at the host boundary."
---

# Runtime portability is a required contract

Smithers flow definitions and domain services must be Effect programs. Runtime
selection, connection creation and process spawning belong to injected host
services. Keep domain definitions independent of the executable that runs them.
`NodeRuntime` in `@smthrs/platform-node` and `BunRuntime` in
`@smthrs/platform-bun` bind the same `NativeRuntime.make` lifecycle to their
matching database, host and cryptography layers. The `@smthrs/flows` root holds
neither, so it imports no platform code.

The shared `Runtime` composition builds the journal, the durable stores and the
engine over injected services; it does not select a SQL driver, and it names no
file. The host injects the SQL client, the owner identity, and whatever its step
boundary and workspace sandbox need: the native compositions supply the driver,
the process identity, a workspace directory and filesystem artifacts beside the
database, while a host without a filesystem supplies
`OwnerIdentity.layerWithoutPid` and the `layerUnsupported` boundary and sandbox.
SQLite adapters share the file guard and startup retries. PostgreSQL uses the
shared Effect SQL adapter and per-schema transaction locking. All stores use the
existing `DurableWriter` transaction policy.

```ts
import { BunRuntime } from "@smthrs/platform-bun"
import { Effect } from "effect"

const application = program.pipe(
  Effect.provide(BunRuntime.layerHost({
    filename: ".flows/engine.db",
    workspaceRoot: ".",
    owner: { hostId: "workspace-host" }
  }, registeredFlows))
)
```

Use `NodeRuntime.layerHost` from `@smthrs/platform-node` with the same flow
definitions in a Node executable.
The outer executable runs the Effect and owns its scope. The native host
composition forks that scope and builds the runtime inside it; closing the
caller's scope initiates runtime shutdown. `signals: []` leaves signal handling
with an embedding application. These examples cover native Node and Bun hosts.
A host that drives one execution per invocation, such as a Worker's Durable
Object, composes `Runtime.layer` with `sweep: { host: executionId }`, drives
the execution with `EngineStore.drive`, and arms its next invocation from the
result.

## Databases

For SQLite, the Node adapter requires Node's SQLite implementation. Under Bun, select
`@smthrs/database/bun/BunDatabase`; a wrong-driver refusal names that correction.
The durable engine itself has no Bun exclusion. Both SQLite drivers reject legacy
Smithers 0.x databases before adding tables. Either runtime can instead select
PostgreSQL using `SMITHERS_POSTGRES_URL` or an explicit connection string; see
[database configuration](../../database/docs/concepts/sqlite-only.md).
