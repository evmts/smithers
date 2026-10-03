---
title: "Installation"
description: "Install @smthrs/time-travel, the five services TimeTravel.layer requires, the import forms, and the packages a runnable composition adds."
sidebar:
  order: 1
---

## Install the package

**Available now**

Use the package from a checkout of the
[repository](https://github.com/smithersai/smithers). After installing the
workspace dependencies, declare it in the consuming workspace package:

```json
{
  "dependencies": {
    "@smthrs/time-travel": "workspace:*",
    "effect": "4.0.0-rc.115"
  }
}
```

The package requires Node.js 26.4.0 or later and ships as both ESM and
CommonJS with TypeScript declarations. Its runtime dependencies are
`@smthrs/database`, `@smthrs/engine-store`, `@smthrs/jj`, `@smthrs/journal`,
`@smthrs/run-store`, and `@smthrs/step-cache`.

[`effect`](https://effect.website) is an exact `4.0.0-rc.115` peer dependency;
declare that version in the consuming package. Declare any runtime dependency
you import by name directly as well. `@smthrs/kernel` is a development
dependency, so examples import the jj service from `@smthrs/jj`.
The quickstart also imports `@effect/platform-node` at `4.0.0-rc.115` for
`NodeCrypto` and `NodeFileSystem`; declare it directly when running that example.

## What the layer requires

**Available now**

`TimeTravel.layer` asks for five injectable contracts and nothing else. Four of
them are the services a durable engine already provides, so the layer merges
straight onto an engine composition:

| Service           | From                                                                                                                    | What time travel does with it                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `TimeTravelStore` | this package                                                                                                            | Reads anchors, state, attempts, and descendants at a frame; writes audits and forks. |
| `Journal`         | [`@smthrs/journal`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/journal/docs/api.md)       | Pages the entries every fold and every assessment reads.                             |
| `RunStore`        | [`@smthrs/run-store`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/run-store/docs/api.md)   | Claims the run a rewind holds, and answers whether a parent or child is still live.  |
| `CacheStore`      | [`@smthrs/step-cache`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/step-cache/docs/api.md) | Reads the sealed results a replay folds in and a fork inherits.                      |
| `Jj`              | [`@smthrs/jj`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/jj/docs/api.md)                 | Provisions a fork's workspace and restores a rewound one.                            |

The store is the only contract this package defines. Pick an implementation
with [Provide a store](./guides/provide-a-store.md): `MemoryTimeTravelStore`
for tests and browser use, `SqlTimeTravelStore` for a durable database.

Building the layer is scoped, and the scope owns every fork workspace the
service adds: a fork lane is forgotten when the service is released, not when
the call that created it returns.

## Import forms

**Available now**

The root entry point exports the service key flat and everything else as a
namespace:

```ts
import { CompensationHandlers, EffectBoundary, Frame, TimeTravel } from "@smthrs/time-travel"
```

Each module is also importable from its own subpath, which is the form the
[API reference](./api.md) uses:

```ts
import * as EffectBoundary from "@smthrs/time-travel/EffectBoundary"
import * as SqlTimeTravelStore from "@smthrs/time-travel/SqlTimeTravelStore"
```

Two subpath forms are not public: `@smthrs/time-travel/internal/*` and
`@smthrs/time-travel/*/index`. Both are mapped to `null` in the package's
export map, because `Replay`, `Fork`, `Rewind`, `Recovery`, `Compensation`,
`SnapshotProjector`, `HistoryLimit`, and `EffectHandlerRegistry` are machinery
a caller never names.
`@smthrs/time-travel/package.json` is exported.

The root entry point is a browser contract: it bundles with no `node:` built-in,
including `SqlTimeTravelStore`, which needs an injected SQLite or PostgreSQL
`SqlClient` rather than a Node binding.

## Reaching the service through the umbrella

**Available now**

A composition that already installs [`@smthrs/flows`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/docs/api.md) reaches the
same service key through it, with no second dependency:

```ts
import { Engine, TimeTravel } from "@smthrs/flows"
```

`TimeTravel` is a service key rather than a namespace, so `yield* TimeTravel`
is the whole onboarding and `TimeTravel.layer` provides it. The umbrella is
also where a caller reaches `Engine.FlowEngine.Lineage`, the one constructor
that mints the lineage id a frame is addressed by.

## What a runnable composition adds

**Available now**

Time travel reads a journal the engine wrote, so a composition that produces
history adds the engine and the storage under it.

- [`@smthrs/engine`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/engine/docs/api.md) is the durable engine a run executes on, and
  the home of `FlowEngine.Lineage`.
- [`@smthrs/engine-store`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/engine-store/docs/api.md) is the producer of everything the
  service reads. It stamps `meta.lineageId` on every record, journals an
  anchor per attempt, and writes effect-boundary records around an irreversible
  dispatch and a child spawn.
- [`@smthrs/flow`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/flow/docs/api.md) is the flow and action authoring model.
- [`@smthrs/database`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/database/docs/api.md) is the driver-neutral SQL contract
  `SqlTimeTravelStore` writes through.

For the durable schema, run `Migrations.run` from this package rather than
letting the store create its own tables. See
[Provide a store](./guides/provide-a-store.md).

## Next step

**Available now**

Execute a durable run and replay it in the [Quickstart](./quickstart.md).
