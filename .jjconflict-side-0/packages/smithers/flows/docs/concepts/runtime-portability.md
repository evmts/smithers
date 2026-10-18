---
title: "Runtime portability"
description: "One durable engine, with Effect services selected at the host boundary."
---

# Runtime portability is a required contract

Smithers flow definitions and domain services must be Effect programs. Runtime
selection, connection creation and process spawning belong to injected host
services. Keep domain definitions independent of the executable that runs them.
`NodeRuntime` and `BunRuntime` bind the same `makeNative` runtime factory to their
matching database, host and cryptography layers.

The shared `@smthrs/flows/Runtime.storage` composition builds journal and durable
store layers over injected services; it does not select a SQL driver. The native
compositions supply that driver. SQLite adapters share the file guard and startup retries. PostgreSQL uses
the shared Effect SQL adapter and per-schema transaction locking. All stores
use the existing `DurableWriter` transaction policy.

```ts
import * as BunRuntime from "@smthrs/flows/BunRuntime"
import { Effect } from "effect"

const application = program.pipe(
  Effect.provide(BunRuntime.layerHost({
    filename: ".flows/engine.db",
    workspaceRoot: ".",
    owner: { hostId: "workspace-host" }
  }, registeredFlows))
)
```

Use `NodeRuntime.layerHost` with the same flow definitions in a Node executable.
The outer executable runs the Effect and owns its scope. The native host
composition forks that scope and builds the runtime inside it; closing the
caller's scope initiates runtime shutdown. `signals: []` leaves signal handling
with an embedding application. These examples cover native Node and Bun hosts;
browser and edge hosts need their own adapters and validation.

## Databases

For SQLite, the Node adapter requires Node's SQLite implementation. Under Bun, select
`@smthrs/database/bun/BunDatabase`; a wrong-driver refusal names that correction.
The durable engine itself has no Bun exclusion. Both SQLite drivers reject legacy
Smithers 0.x databases before adding tables. Either runtime can instead select
PostgreSQL using `SMITHERS_POSTGRES_URL` or an explicit connection string; see
[database configuration](../../database/docs/concepts/sqlite-only.md).
