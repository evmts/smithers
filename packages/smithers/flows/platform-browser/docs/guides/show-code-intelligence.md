---
title: "Show code intelligence in a page"
description: "Run TypeScript's language service in a dedicated worker over a repository at a commit, and ask it for hovers, definitions, references and diagnostics from the tab."
---

`BrowserLanguageServer` puts TypeScript's language service in a worker of its
own, so a page can answer hovers, definitions, references and diagnostics
without a machine. This guide wires it into a Vite app that reads files from
its own API.

## 1. The worker module

The worker hands `serve` the TypeScript compiler API and TypeScript's lib
files. Each lib file is its own lazy chunk, loaded only when a project names
it, and `typescript` lands in the worker's bundle alone.

```ts
// language.worker.ts
import { BrowserLanguageServer } from "@smthrs/platform-browser"
import ts from "typescript"

const libs = import.meta.glob<string>("/node_modules/typescript/lib/lib.*.d.ts", { query: "?raw", import: "default" })

BrowserLanguageServer.serve({
  typescript: ts,
  lib: (name) => libs[`/node_modules/typescript/lib/${name}`]?.() ?? Promise.resolve(undefined)
})
```

## 2. The tab

`make` starts the worker when it is first needed and stops it with its scope.
The workspace is the file list and a read; the worker asks for each file it
needs by path.

```ts
import { BrowserLanguageServer } from "@smthrs/platform-browser"
import * as Effect from "effect/Effect"

const program = Effect.gen(function*() {
  const server = yield* BrowserLanguageServer.make({
    worker: () => new Worker(new URL("./language.worker.ts", import.meta.url), { type: "module" }),
    workspace: { paths, read: (path) => readAtCommit(sha, path) }
  })
  const hover = yield* server.hover({ path: "/src/main.ts", line: 3, character: 22 })
  const places = yield* server.references({ path: "/src/main.ts", line: 3, character: 22 })
}).pipe(Effect.scoped)
```

## 3. Read the answers

The answers are the Language Server Protocol's shapes. A location's `uri` is
`BrowserLanguageServer.uriOf` of a workspace path; `pathOf` reads it back, and
`isLib` tells a definition in TypeScript's own lib files from one in the
workspace. Decode them where the page reads them, as it would any language
server's.

A test runs both halves in one process over a `MessageChannel`: `serve` with
`port` set to one end, and `make` with a `worker` whose `postMessage` and
`addEventListener` are the other.

Workspace reads include package manifests needed for self-references and
`package.json` imports. Path mappings without `baseUrl` use the directory of
the config declaring them, including inherited mappings. A request after
`sync` loads newly introduced imports, including files in new overlay directories. Interrupted references requests leave
widening available to the next request. Oversized columns stop at the line's
end, and a load that exceeds the text cap reports a partial workspace.
