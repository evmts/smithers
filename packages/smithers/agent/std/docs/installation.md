---
title: "Installation"
description: "Install @smthrs/std, its runtime requirements and import forms, the browser-safe subpaths, and the packages a host adds to make the handlers runnable."
sidebar:
  order: 1
---

## Install the package

Available now

Use a source checkout and write your program in a package that depends on
`@smthrs/std`:

```bash
git clone https://github.com/smithersai/smithers.git
cd smithers
corepack pnpm install --frozen-lockfile
```

It requires
Node.js 26.4.0 or later and ships as both ESM and CommonJS with TypeScript
declarations. Install its exact peer, `effect@4.0.0-rc.115`, in your application. Its runtime dependencies are [`@smthrs/core`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/core/docs/api.md) for the
flow declaration type, [`@smthrs/kernel`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/kernel/docs/api.md) for the permission-aware
host services, [`@smthrs/capability`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/capability/docs/api.md) for the capability
vocabulary, and [`@smthrs/control`](https://github.com/smithersai/smithers/blob/main/packages/smithers/control/docs/api.md) for the credential seam
`ExaWebSearch` reads its API key through, plus [`@smthrs/model`](https://github.com/smithersai/smithers/blob/main/packages/smithers/agent/model/docs/api.md) for Jev evaluation.

## Import forms

Available now

The root entry point re-exports every module as a namespace:

```ts
import { Grep, Manifest, Read, StdError } from "@smthrs/std"
```

Each module is also importable from its own subpath, which is the form this
documentation uses and the form that keeps a bundle to what it needs:

```ts
import * as Read from "@smthrs/std/Read"
import * as StdError from "@smthrs/std/StdError"
```

Two subpath forms are not public: `@smthrs/std/internal/*` and
`@smthrs/std/<Module>/index`. Both are blocked in the export map and carry no
promise. `@smthrs/std/package.json` is exported.

## The browser-safe subset

Available now

The root entry point is Node-only. It re-exports `NodeLanguageServer`, which
imports `node:url`, so importing `@smthrs/std` in a browser bundle pulls a Node
built-in in with it.

Four subpaths are browser-safe, because nothing they import reaches a Node
built-in:

- `@smthrs/std/Grep`
- `@smthrs/std/Glob`
- `@smthrs/std/Search`
- `@smthrs/std/PortableSearch`

`PortableSearch` performs its walk through the injected `FileSystem` service, so
a browser host that provides one gets working `grep` and `glob` with no external
binary.

## What a runnable host adds

Available now

The declarations run nowhere on their own. Handlers ask for host services
through Effect's context, so a composition adds a platform package that provides
them:

```bash
pnpm add @effect/platform-node@4.0.0-rc.115 @effect/platform-node-shared@4.0.0-rc.115
```

`NodeServices.layer` from `@effect/platform-node` provides `FileSystem`, `Path`,
and `ChildProcessSpawner`, which is everything the filesystem, search, and shell
handlers require. A host that wants the permission kernel's capability checks in
front of those services builds them through
[`@smthrs/kernel`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/kernel/docs/api.md)'s `HostServices` instead, which is what the
Smithers CLI does.

| Handler                                     | Services it requires                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `Read.run`, `Edit.run`                      | `FileSystem`                                                                   |
| `Write.run`, `Ls.run`, `ApplyPatch.run`     | `FileSystem`, `Path`                                                           |
| `Grep.run`, `Glob.run`                      | `Search`                                                                       |
| `Bash.run`                                  | `ChildProcessSpawner`, `Path`, and `Container` when a call names one           |
| `TestRun.run`                               | `ChildProcessSpawner`, `Evaluator`, `TestRunner`; optional `Container` |
| `ShellCommand.run`                          | `ChildProcessSpawner`                                                          |
| `Fetch.run`, `HttpPost.run`, `WebFetch.run` | `HttpClient`, `GrantStore`                                                     |
| `WebSearch.run`                             | `WebSearch`                                                                    |
| `Lsp.run`                                   | `LanguageServer`, `FileSystem`                                                               |
| `UpdatePlan.run`                            | none                                                                           |

## The six injected services

Available now

Six flows reach the host through a service rather than through a platform layer.
Each one has a refusal layer a host can bind explicitly. An unbound required
service is a missing-service error; it does not install its refusal layer automatically.

| Service          | Refusal layer              | Working layer                                   |
| ---------------- | -------------------------- | ----------------------------------------------- |
| `Search`         | `Search.layerNoop`         | `PortableSearch.layer` or `NativeSearch.layer`  |
| `Container`      | `Container.layerNoop`      | `Container.layerCommand({ program: "docker" })` |
| `TestRunner`     | `TestRunner.layerNoop`     | `TestRunner.layer(runner)`                      |
| `Checkpoints`    | `Checkpoints.layerNoop`    | `Checkpoints.layerGit({ root })`                |
| `WebSearch`      | `WebSearch.layerNoop`      | `ExaWebSearch.layer(credentialId)`              |
| `LanguageServer` | `LanguageServer.layerNoop` | `NodeLanguageServer.layer(config)`              |

`NativeSearch.layer` drives the `rg` executable, so a host that binds it needs
ripgrep on the path. `PortableSearch.layer` needs nothing beyond `FileSystem`
and `Path`. `ExaWebSearch.layer` additionally requires
[`@smthrs/control`](https://github.com/smithersai/smithers/blob/main/packages/smithers/control/docs/api.md)'s `Credential` service and
[`@smthrs/kernel`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/kernel/docs/api.md)'s `HttpClient`.

Composing these is one job, covered in
[Bind the standard flows into a host](./guides/bind-the-standard-flows.md).
