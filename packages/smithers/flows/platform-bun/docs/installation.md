---
title: "Installation"
description: "Install @smthrs/platform-bun from npm with its required peers, the smithers-jj-export helper @smthrs/platform-node ships for the filesystem slot, the jj executable every complete bundle probes at startup, and the import forms for each entry point."
sidebar:
  order: 1
---

## Install the package and its peers

The package is on npm under the `next` tag, which carries the 1.0 release
candidates. Install the current candidate with Bun:

```bash
bun add @smthrs/platform-bun@1.0.0-rc.8 effect @smthrs/kernel@1.0.0-rc.8
```

`@smthrs/kernel` is on the line because the [Quickstart](./quickstart.md)'s
`contained.ts` imports its `ProcessLedger`, which the contained bundles require.
Bun's isolated linker and pnpm link only the packages a project declares.

The manifest declares two required peers, neither optional:

| Peer                    | Version                        | Why                                                       |
| ----------------------- | ------------------------------ | --------------------------------------------------------- |
| `effect`                | `^4.0.4`                       | The runtime every service tag belongs to.                 |
| `@smthrs/platform-node` | exactly this package's version | The atomic filesystem slot and the containment machinery. |

Bun installs required peers, so the line above also installs
`@smthrs/platform-node` at the matching version. Install one `effect` in the
peer range so the host shares one Effect runtime. `@effect/platform-bun`,
`@effect/platform-node` and `@effect/platform-node-shared` are bundled
privately, built from `effect@4.0.4`, so your project installs none of them.

## Supported runtimes

Bun 1.4.0 or later, and Node.js 26.4.0 or later. Both are declared in
`engines`, and both are real: the bundle falls back to the
`@effect/platform-node` adapters off Bun, so it runs unchanged under Node. See
[Runtime parity with Node](./concepts/runtime-parity.md) for what that does and
does not buy you.

## The filesystem helper

The filesystem slot is `@smthrs/platform-node`'s `AtomicFileSystem`, which
carries the kernel's atomic host extension. That extension does not run
in-process: it executes each guarded path operation through the
`smithers-jj-export` helper so the operation is descriptor-relative and
no-follow.

`@smthrs/platform-node` ships the helper prebuilt for macOS (arm64, x64), Linux
(arm64, x64), and Windows (x64), so installing the package installs it; there
is nothing to build. `SMITHERS_WORKSPACE_JJ_EXPORT_BINARY` only overrides the
packaged helper with another absolute path; see
[Configure the filesystem helper](./guides/configure-the-filesystem-helper.md).

Windows is unsupported for this slot.

## Install Jujutsu for the complete bundles

Every complete bundle, `BunHost.layer`, `layerAt`, `layerContained`, and
`layerContainedAt`, requires jj 0.39.0 or later on the host, whether or not
the program uses the `Jj` slot. Each factory merges its `Jj` layer with the
other four, and that layer runs one `jj --version` probe while the layer is
built. On a host without the executable, or with an older one, construction
fails with `JjError` carrying `not_installed` or `unsupported_version` before
the program body runs, even for a program that asked for only `FileSystem`.

Install [Jujutsu](https://jj-vcs.github.io), a version-control system that
works on a Git repository, and confirm the version:

```bash
jj --version
```

This package vendors no binaries. [`@smthrs/jj`](/api/jj) documents the
resolution order and the `SMITHERS_JJ_PATH` override for an executable that is
not on `PATH`.

A program that must run without jj composes the individual service layers
instead of a complete bundle: `BunFileSystem.layer`, `Path.layer`, and the
spawner and HTTP client layers each build without a probe. See
[The Host surface on Bun](./concepts/host-surface.md) for taking one service
without the other four.

## Import forms

The root entry point re-exports both modules as namespaces:

```ts
import { BunFileSystem, BunHost } from "@smthrs/platform-bun"
```

Each module is also importable from its own subpath, which is the form the
[API reference](./api.md) uses:

```ts
import * as BunFileSystem from "@smthrs/platform-bun/BunFileSystem"
import * as BunHost from "@smthrs/platform-bun/BunHost"
```

Two subpath forms are blocked in the export map and are not public:
`@smthrs/platform-bun/internal/*` and `@smthrs/platform-bun/*/index`.
`@smthrs/platform-bun/package.json` is exported.

The bundle resolves `node:` built-ins, so it does not bundle for a browser. A
page composes [`@smthrs/platform-browser`](/api/platform-browser) instead.

## What a real composition adds

`BunHost.layer` provides the raw host. Two additions are common:

- [`@smthrs/kernel`](/api/kernel) guards it. Its `FileSystem.layer`,
  `ChildProcessSpawner.layer`, `HttpClient.layer`, `Jj.layer`, and `Path.layer`
  decorate the very tags this bundle provides, in place, so a capability check
  runs before every host call. The guarded filesystem is also where the atomic
  extension earns its keep, and it needs a `Workspace` root and a `GrantStore`.
- A `ProcessLedger`, from `@smthrs/kernel/ProcessLedger`, is required by
  `BunHost.layerContained` and `BunHost.layerContainedAt`. It is a requirement
  rather than a default because only your program knows whether it has a
  durable journal to write to. See
  [Contain and reap child processes](./guides/contain-child-processes.md).

The `Jj` slot spawns the `jj` command that
[Install Jujutsu for the complete bundles](#install-jujutsu-for-the-complete-bundles)
covers. A bundle probes it at construction, so the executable is a startup
requirement rather than a slot the program opts into.

## Next step

Run a command and a file operation through the host in the
[Quickstart](./quickstart.md).
