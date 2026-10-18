# `@smthrs/effect-electric`

Electric for Effect programs. An Electric collection is a TanStack DB
collection synced from a Postgres shape, built on
[`@smthrs/effect-tanstack-db`](../effect-tanstack-db/README.md): scoped, its
rows decoded by an Effect `Schema`, its mutation handlers Effects that share
your program's services. It retries failed requests on an Effect `Schedule`,
reports its sync status as a `Stream`, and waits for a write by transaction id
or by match. With `persist`, it keeps its rows and Electric's resume state on
the device, so the next program shows them before the network answers and
resumes the shape where it stopped. For the server, `ShapeProxy` serves a browser's shape requests from
your own route, with the table, the allowed parameters and Electric's secret
chosen there.

The package will move to its own repository as an open-source library; its
proposed npm name is `effect-electric`.

**Documentation:** [`docs/`](docs/README.md)

## Install

The package is private in this repository. Add it as a workspace dependency,
with its peer dependencies at these exact versions. It depends on
`@smthrs/effect-tanstack-db`, which comes with it.

```json
{
  "dependencies": {
    "@smthrs/effect-electric": "workspace:*",
    "@electric-sql/client": "1.5.28",
    "@tanstack/db": "0.15.1",
    "@tanstack/electric-db-collection": "0.6.2",
    "effect": "4.0.5"
  }
}
```

To use `persist`, add `@tanstack/db-sqlite-persistence-core` 0.4.11 and a
host's persistence package, such as `@tanstack/browser-db-sqlite-persistence`
0.2.36. The versions are exact because the package is tested against them. It
imports no Node built-in, so it runs in a browser, a Worker, Node and Bun.

## Quickstart

```ts
import { ElectricCollection } from "@smthrs/effect-electric"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })

const program = Effect.scoped(Effect.gen(function*() {
  const todos = yield* ElectricCollection.make({
    id: "todos",
    schema: Todo,
    getKey: (todo) => todo.id,
    shape: { url: "https://example.com/api/shapes/todos" }
  })
  yield* todos.sync.pipe(
    Stream.runForEach((event) => Effect.log(`sync: ${event._tag}`)),
    Effect.forkScoped({ startImmediately: true })
  )
  yield* todos.preload
  return yield* todos.toArray
}))
```

[`examples/collection.ts`](examples/collection.ts) adds an `onInsert` that
writes the row and waits for its transaction, and runs with
`node examples/collection.ts` against a Postgres and Electric.
[`examples/proxy.ts`](examples/proxy.ts) mounts the shape proxy.

## Learn more

- [Overview](docs/README.md): what the package guarantees.
- [API reference](docs/api.md): every export.
- [The sync policy](docs/sync-policy.md): retries, `reconnect`, and what the
  sync status means for a UI.
- [Proxy shapes through your server](docs/shape-proxy.md).
