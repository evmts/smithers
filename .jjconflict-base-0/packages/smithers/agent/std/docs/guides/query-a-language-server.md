---
title: "Query a language server"
description: "Run the ten LSP operations through the lsp flow, bind a server with @smthrs/platform-node's NodeLanguageServer, and understand the 1-based coordinates and the pass-through result."
sidebar:
  order: 8
---

`lsp` is one flow with ten operations. It answers the questions a text search
cannot: where a symbol is defined, who calls it, what type it has.

## Bind a server

The flow calls the `LanguageServer` service. On Node.js and Bun, bind it to a
host server process with `NodeLanguageServer` from
[`@smthrs/platform-node`](/api/platform-node):

```ts
import { NodeLanguageServer } from "@smthrs/platform-node"

const server = NodeLanguageServer.layer({
  command: "/opt/lsp/node_modules/.bin/typescript-language-server",
  args: ["--stdio"],
  cwd: "/workspace",
  initializationOptions: { tsserver: { path: "/opt/lsp/node_modules/typescript/lib/tsserver.js" } }
})
```

[Run a language server](../../../../flows/platform-node/docs/guides/run-a-language-server.md)
covers that client: one server per language, lazy start, why it refuses a
server program inside the workspace, how long `diagnostics` waits, and the
bounds it enforces.

A host with no server binds `LanguageServer.layerNoop`, and every operation
fails with `unsupported`. A host with its own client implements the service;
see [Bring your own server](#bring-your-own-server).

## Edits reach the server

With a `LanguageServer` bound, `edit`, `write` and `apply_patch` send each file
they write to its server after the entire operation succeeds: `textDocument/didOpen` the first time, then
`textDocument/didChange` with the full text. A file `apply_patch` deletes or
moves away gets `textDocument/didClose`. `edit` then returns `errors`, the
error-severity diagnostics in the file after the edit (at most 20, 1-based
positions). `errors` is absent when no server is bound or it did not answer;
the edit itself never fails because of the server.

`bash` does not know which files a command changed, so after a command on the
host it calls `refresh`: the client re-reads every file it has open, sends the
text of each that changed, and closes each that is gone. A command run in a
container leaves the host's files alone and refreshes nothing.

How `diagnostics` reads a server that only publishes, and how long it waits,
belongs to the client. For `NodeLanguageServer`, see
[Diagnostics](../../../../flows/platform-node/docs/guides/run-a-language-server.md#diagnostics).

## Run a query

```ts
import { Lsp } from "@smthrs/std"

const definition = Lsp.run({
  operation: "definition",
  path: "/workspace/src/widen.ts",
  line: 12,
  character: 17
})
// definition.result is the server's own answer, passed through unchanged
```

| Operation               | What it takes               |
| ----------------------- | --------------------------- |
| `hover`                 | `path`, `line`, `character` |
| `definition`            | `path`, `line`, `character` |
| `references`            | `path`, `line`, `character` |
| `implementation`        | `path`, `line`, `character` |
| `prepareCallHierarchy`  | `path`, `line`, `character` |
| `callHierarchyIncoming` | `path`, `line`, `character` |
| `callHierarchyOutgoing` | `path`, `line`, `character` |
| `documentSymbols`       | `path`                      |
| `diagnostics`           | `path`                      |
| `workspaceSymbols`      | `query`                     |

`line` and `character` are **1-based**, which is how `read` and `grep` report
them, so a hit from a search is a position you can pass straight in. The flow
converts to the protocol's 0-based coordinates for you.

`path` must be a normalized absolute path. A relative path, or a missing one for
any operation except `workspaceSymbols`, fails with `invalid_input`, as does a
position operation missing `line` or `character`. The server reads the file
itself, so the flow first reads `path` through the bound `FileSystem`: a path the
guarded filesystem denies fails with `permission_denied` before the server sees
it.

`references` includes the declaration. The two call-hierarchy directions run
`prepareCallHierarchy` first and return an empty array when the server prepares
no item, so a position that is not a callable is an empty answer rather than a
failure.

## The result is not a schema

`Output` is `{ result: unknown }`. The server's answer is passed through in the
server's own shape, because LSP responses vary by server and by version, and
narrowing them here would be a second, staler schema. Decode it on the caller's
side against what the server you bound actually returns.

## Bring your own server

`LanguageServer` is an ordinary service interface: ten query methods, each
taking a `Position` (`path`, `line`, `character`) or a string, plus
`sync(path, text)`, `close(path)`, and `refresh`. A host with its own client,
in-process index, or remote service implements those thirteen members and
binds them with `LanguageServer.make`. Nothing above the service knows which one
answered.

One detail to implement against: a `Position` reaching the service is already
**0-based**. The 1-based to 0-based conversion happens in the flow, so the
service speaks the protocol's own coordinates.
