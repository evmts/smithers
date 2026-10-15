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

npm 11 ends the install with an `install-scripts` warning naming `esbuild`.
Leaving it unapproved is safe: npm installs esbuild's platform binary as an
ordinary dependency, and `SandboxedFlow` bundles without the script.

The `next` tag carries the 1.0 release candidates. With pnpm 11, name the
version instead of the tag, then approve `esbuild`'s install script:

```bash
pnpm add @smthrs/flows@1.0.0-rc.9 effect
pnpm approve-builds esbuild
```

pnpm 11 installs only versions at least 24 hours old (`minimumReleaseAge`), so
`@smthrs/flows@next` resolves to the newest candidate published more than a day
ago, which can be more than one release behind `next`. An exact version is
installed the day it is published: pnpm records it under
`minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. pnpm 11 also ends
the install with `ERR_PNPM_IGNORED_BUILDS` until the project allows or denies
the install script of `esbuild`; the packages are already installed, and
`approve-builds` records the choice in `pnpm-workspace.yaml` so later installs
succeed.

`@smthrs/flows` installs the twenty engine packages it re-exports, the Node host
[`@smthrs/platform-node`](../platform-node/docs/api.md), the Node SQLite driver
`@effect/sql-sqlite-node`, and `esbuild`, which `SandboxedFlow` uses to bundle a
guest entry module. `effect` is a peer dependency. Install it yourself, because
your program imports it directly and pnpm links only the packages a project
declares.

## Requirements

- Node.js 26.4.0 or later, which also runs a `.ts` file directly, with no build
  step. Durable execution is tested on Node.js 26.4+ and Bun 1.4+; `engines`
  requires Node `>=26.4.0`.
- [jj](https://jj-vcs.github.io/jj/latest/install-and-setup/) 0.39.0 or later
  on `PATH`, or `SMITHERS_JJ_PATH` naming the binary, for the steps that use
  it: a compensable step, which the engine snapshots before each attempt; a
  time-travel fork, which adds a jj workspace for the child run; a rewind that
  restores files, because it crosses a compensable step or sets `wholeRepo`;
  and an action that calls `Jj`. A rewind over sealed steps alone needs no jj.
  A compensable step's workspace must also be a jj repository (`jj git init`).
  Every `NodeRuntime` and `BunRuntime` host starts without jj. The first step
  that needs jj runs `jj --version` and fails with `No jj on PATH` when there
  is none. On macOS, `brew install jj`; the linked page covers Linux and
  Windows.
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

| Runtime | Import                      | Platform package                                              | Installed by                            |
| ------- | --------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| Node.js | `@smthrs/flows/NodeRuntime` | [`@smthrs/platform-node`](../platform-node/docs/api.md)       | `@smthrs/flows`                         |
| Bun     | `@smthrs/flows/BunRuntime`  | [`@smthrs/platform-bun`](../platform-bun/docs/api.md)         | You. See [Bun](#bun-durable-execution). |
| Browser | `@smthrs/platform-browser`  | [`@smthrs/platform-browser`](../platform-browser/docs/api.md) | You. It hosts authoring and inspection. |

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
SQLite or PostgreSQL. Durable execution is tested on Node.js 26.4+ and Bun 1.4+; `engines` requires Node `>=26.4.0`. A browser or edge runtime is not a supported durable host even
when you supply another SQL client. Native modules are subpaths
precisely so importing the root never opens `node:sqlite`.

## When to depend on individual packages instead

The barrel is a convenience, not a seam. A library published to other consumers
usually wants the narrower dependency: depend on
[`@smthrs/flow`](../flow/docs/api.md) alone to declare flows and actions, or on
[`@smthrs/engine`](../engine/docs/api.md) and
[`@smthrs/engine-store`](../engine-store/docs/api.md) to execute them. Reach for
`@smthrs/flows` in the program that composes the whole engine, which is where
one dependency saves you twenty.

Install an individual package at `@next` as well, for example
`npm install @smthrs/flow@next effect`. `latest` on several engine packages,
among them `@smthrs/engine` and `@smthrs/testing`, still names a 0.x release.

## Use PostgreSQL

SQLite is the default. To keep the durable stores in PostgreSQL instead,
install the optional adapter:

```bash
npm install @effect/sql-pg
```

Then set `SMITHERS_POSTGRES_URL` to a `postgres://` connection string, or pass
one as the `filename` of `NodeRuntime.layerHost`. `SMITHERS_BACKEND=sqlite`
keeps a filename on SQLite even when `SMITHERS_POSTGRES_URL` is set.
[SQLite and PostgreSQL](../database/docs/concepts/sqlite-only.md) covers the
schema each store gets and the role permissions the adapter needs.

## Next step

Stand a durable runtime up and run a flow on it in the
[Quickstart](./quickstart.md).

## Bun durable execution

```bash
bun add @smthrs/flows@next effect @smthrs/platform-bun@next
```

`@smthrs/platform-bun` carries its own copy of the Effect Bun and Node platform
adapters, and the Bun database opens `bun:sqlite` itself, so a Bun program adds
no `@effect/*` package of its own.

Then import `@smthrs/flows/BunRuntime`. Its `layerHost`, `layer`, `make` and
`storage` compositions share the engine with Node. See
[runtime portability](./concepts/runtime-portability.md).
