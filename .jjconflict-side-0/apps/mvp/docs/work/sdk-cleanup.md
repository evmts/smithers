---
title: SDK cleanup, ModelProxy deletion and host injection
status: done
area: sdk
owner: SDK cleanup agent
updated: 2026-10-19
links: [../rules.md, ../../../../docs/libraries.md, ../../../../AGENTS.md, ../decisions/0011-the-agent-runs-in-the-browser.md, model-endpoint.md]
---

## What

- `HostModel` in `@smthrs/model-host` makes the model a service built from config, with one redirect-refusing transport.
- `@smthrs/model-host`'s root is platform-neutral; Node-only pieces come from the injected host package.
- `ModelProxy` is deleted: module, tests, guide, exports and catalog row. It lost its consumer when the server took over answering.
- `@smthrs/rpc` exports all 92 modules from its root.
- Provider error text can't reach exported spans or relayed logs, proven with a sentinel against real OTLP export.

## Why

Will: "So What model we are using I would expect to be a service". "there should be a host like package that gets dependency injected depending on the host and the packages outside of that should work on all platforms". "FOr the sdk module nothing uses, we have no tolerance for tech debt or dead code."

## State

- `HostModel` and the platform-neutral root: commit `e552252fdca8` (local).
- The rest landed in the working copy with every touched package green and the SDK packages at 100% coverage. Uncommitted.
- Two `@smthrs/model-host` deep imports remain because the root would pull in Node-only code.
- 22:31 on 2026-10-19: decision 0011 brings `ModelProxy` back as the starting point for the server's metered [model endpoint](model-endpoint.md), restored from commit `fadb89048fc8`.

## Next

The 627-file move is its own item: [deep-import migration](deep-import-migration.md).

## Questions for Will

None.
