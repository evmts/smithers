---
title: "Installation"
description: "Install @smthrs/platform-bun, its required peers, the smithers-jj-export helper the filesystem slot needs, the jj executable every complete bundle probes at startup, and the import forms for each entry point."
sidebar:
  order: 1
---

## Install the package and its peers

Available now.

Use the `1.0.0-rc.1` candidate from a repository checkout:

```bash
git clone https://github.com/smithersai/smithers.git
cd smithers
pnpm install
```

A consumer inside that workspace declares the package with a workspace
specifier:

```json
{
  "dependencies": {
    "@smthrs/platform-bun": "workspace:*",
    "@smthrs/platform-node": "workspace:*",
    "effect": "4.0.0-rc.115"
  }
}
```

The manifest declares these required peers:

| Peer | Version | Why |
| --- | --- | --- |
| `effect` | `4.0.0-rc.115` | The runtime every service tag belongs to. |
| `@smthrs/platform-node` | `1.0.0-rc.1` | The atomic filesystem slot and containment machinery. |

`@effect/platform-bun`, `@effect/platform-node`, and
`@effect/platform-node-shared` are development dependencies, vendored privately
into `dist/vendor` during the build.

Runtime dependencies are `@smthrs/jj`, `@smthrs/kernel`, `undici`, `redis`,
`@types/ws`, and `ws`. The Smithers dependencies use `1.0.0-rc.1`.

## Supported runtimes

Partly available: preview host; verify your runtime and OS.

Bun 1.4.0 or later, and Node.js 26.4.0 or later. Both are declared in
`engines`. The Bun adapters re-export Node-shared implementations, so no
runtime-detection branch is needed. See
[Runtime parity with Node](./concepts/runtime-parity.md) for what that does and
does not buy you.

## Install the filesystem helper

Available now.

The filesystem slot is `@smthrs/platform-node`'s `AtomicFileSystem`, which
carries the kernel's atomic host extension. That extension does not run
in-process: it executes each guarded path operation through the
`smithers-jj-export` helper so the operation is descriptor-relative and
no-follow. From a source checkout, build it with:

```bash
cargo build --locked --release -p smithers-ffi --bin smithers-jj-export
```

Elsewhere, set `SMITHERS_WORKSPACE_JJ_EXPORT_BINARY` to its absolute path; see
[Configure the filesystem helper](./guides/configure-the-filesystem-helper.md).

Windows is unsupported for this slot.

## Install Jujutsu for the complete bundles

Available now.

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

This package vendors no binaries. [`@smthrs/jj`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/jj/docs/api.md) documents the
resolution order and the `SMITHERS_JJ_PATH` override for an executable that is
not on `PATH`.

A program that must run without jj composes the individual service layers
instead of a complete bundle: `BunFileSystem.layer`, `Path.layer`, and the
spawner and HTTP client layers each build without a probe. See
[The Host surface on Bun](./concepts/host-surface.md) for taking one service
without the other four.

## Import forms

Available now.

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
page composes [`@smthrs/platform-browser`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/platform-browser/docs/api.md) instead.

## What a real composition adds

Available now.

`BunHost.layer` provides the raw host. Two additions are common:

- [`@smthrs/kernel`](https://github.com/smithersai/smithers/blob/main/packages/smithers/flows/kernel/docs/api.md) guards it. Its `FileSystem.layer`,
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

Available now.

Run a command and a file operation through the host in the
[Quickstart](./quickstart.md).
