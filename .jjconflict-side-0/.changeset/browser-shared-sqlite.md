---
"@smthrs/platform-browser": minor
---

Add `SharedSqlite`: the app's own SQLite database, opened by the durable
engine's leader beside its store and reached from every tab with `execute`.
`SharedSqlite.open` is the `{ execute, close }` that TanStack DB's browser
persistence takes, so an app loads one SQLite build and keeps one OPFS pool.
A transaction is one tab's own until it ends, and the leader rolls back the
open transaction of a tab that closes. When the leading tab closes, a tab's
open transaction runs again on the next leader and carries on if it reads the
same, so the handover is invisible to TanStack DB.

```ts
import { SharedSqlite } from "@smthrs/platform-browser"
import { createBrowserWASQLitePersistence } from "@tanstack/browser-db-sqlite-persistence"

const persistence = createBrowserWASQLitePersistence({ database: await SharedSqlite.open({ name: "smithers" }) })
```

`WebLock.hold(name, { steal: true })` takes a lock at once from whichever
context holds it, and the held lock's `lost` tells that context it was taken.

Breaking: `BrowserRuntime.run` and `layerHost` take the SQLite build as lazy
imports, `sqlite: { module, wasm }`, instead of `wasm` bytes, and
`BrowserSqlite.layerSqlite` takes `build` instead of `wasm`. The package no
longer imports the build or the engine eagerly, so a tab bundle that imports
the root carries neither.

```ts
BrowserRuntime.run({
  name: "smithers",
  sqlite: {
    module: () => import("@journeyapps/wa-sqlite/dist/wa-sqlite.mjs"),
    wasm: () => fetch(wasmUrl).then((response) => response.arrayBuffer())
  },
  flows,
  registerFlows
})
```

`BrowserEngine` fails every pending and later request with `EngineUnavailable`
when the tab's own engine worker throws or cannot build the engine, instead of
waiting forever, and `BrowserEngine.unavailable` says why, so an app can show
that it cannot run in this browser.
