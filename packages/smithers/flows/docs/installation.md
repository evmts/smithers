---
title: "Installation"
description: "Install @smthrs/flows from npm, its Node and effect requirements, its three import forms, the platform packages each runtime needs, and when to depend on individual engine packages instead."
sidebar:
  order: 1
---

## Install the package

```bash
npm install @smthrs/flows@next effect
```

The `next` tag carries the 1.0 release candidates. With pnpm, run `pnpm add`
with the same two packages.

`@smthrs/flows` installs the twenty engine packages it re-exports, the Node host
[`@smthrs/platform-node`](/api/platform-node), the Node SQLite driver
`@effect/sql-sqlite-node`, and `esbuild`, which `SandboxedFlow` uses to bundle a
guest entry module. `effect` is a peer dependency. Install it yourself, because
your program imports it directly and pnpm links only the packages a project
declares.

## Requirements

- Node.js 26.4.0 or later with local SQLite, which is what `package.json`
  declares in `engines`. That is what durable execution needs, and it is also
  what runs a `.ts` file directly, with no build step.
- [`effect`](https://effect.website) in the range `^4.0.4`, as a peer
  dependency. This is an Effect library throughout: a flow's payload and result
  are Effect schemas, an action's implementation is an `Effect`, and a host is
  a `Layer`. Install one `effect` in the consuming project, so the service
  tags and schemas this package exports are the same classes the project
  constructs. A project already on Effect 4.0.4 or later keeps its version.

The package ships as ESM and CommonJS with TypeScript declarations.

## Import forms

The root entry point is the barrel. Authoring names are flat and infrastructure
packages are namespaces:

```ts
import { Action, Engine, Flow, Interpreter, Journal, Kernel } from "@smthrs/flows"
```

Native compositions are explicit subpaths. The runtime core consumes injected services:

```ts
import * as NodeRuntime from "@smthrs/flows/NodeRuntime"
import * as SandboxedFlow from "@smthrs/flows/SandboxedFlow"
```

Two subpath forms are blocked in the export map and are not public:
`@smthrs/flows/internal/*` and `@smthrs/flows/*/index`.
`@smthrs/flows/package.json` is exported.

## Platform packages

The root entry point imports no platform, for the same reason `effect`'s own
index does not re-export `@effect/platform-node`: one import must not resolve
`node:child_process`, ZenFS, and Bun at once. A platform is reached through an
explicit subpath or its own package:

| Runtime | Import                      | Platform package                                    | Installed by                            |
| ------- | --------------------------- | --------------------------------------------------- | --------------------------------------- |
| Node.js | `@smthrs/flows/NodeRuntime` | [`@smthrs/platform-node`](/api/platform-node)       | `@smthrs/flows`                         |
| Bun     | `@smthrs/flows/BunRuntime`  | [`@smthrs/platform-bun`](/api/platform-bun)         | You. See [Bun](#bun-durable-execution). |
| Browser | `@smthrs/platform-browser`  | [`@smthrs/platform-browser`](/api/platform-browser) | You. It hosts authoring and inspection. |

`@smthrs/platform-node` supplies the Node host, containment, process reaping,
and the liveness probe. It carries its own copy of `@effect/platform-node`, and
`@smthrs/flows` installs the SQLite driver `@effect/sql-sqlite-node` beside it,
so a Node program adds no `@effect/*` package of its own.

Test doubles are reached through their own packages:
`@smthrs/testing/TestHost`, `@smthrs/database/node/NodeDatabase`,
`@smthrs/journal/test/TestJournal`.

## Bundling for a browser is not durable execution

The root entry point bundles for a browser, and so does every package root it
re-exports. What bundles is the authoring and inspection surface: you can
declare flows, read a plan, and decode a journal event in a browser.

Durable execution is a different claim: it needs a native Node.js or Bun host and
SQLite or PostgreSQL. Node.js requires version 26.4.0 or later. A browser or edge runtime is not a supported durable host even
when you supply another SQL client. Native modules are subpaths
precisely so importing the root never opens `node:sqlite`.

## When to depend on individual packages instead

The barrel is a convenience, not a seam. A library published to other consumers
usually wants the narrower dependency: depend on
[`@smthrs/flow`](/api/flow) alone to declare flows and actions, or on
[`@smthrs/engine`](/api/engine) and
[`@smthrs/engine-store`](/api/engine-store) to execute them. Reach for
`@smthrs/flows` in the program that composes the whole engine, which is where
one dependency saves you twenty.

## Next step

Stand a durable runtime up and run a flow on it in the
[Quickstart](./quickstart.md).

## Bun durable execution

```bash
bun add @smthrs/flows@next effect @smthrs/platform-bun@next \
  @effect/platform-bun @effect/platform-node-shared \
  @effect/sql-sqlite-bun
```

Then import `@smthrs/flows/BunRuntime`. Its `layerHost`, `layer`, `make` and
`storage` compositions share the engine with Node. See
[runtime portability](./concepts/runtime-portability.md).
