---
title: Two declared deep-import exceptions
status: todo
area: sdk
owner: unassigned; declared by the repo-checks agent (reported about 02:06 on 2026-10-20)
updated: 2026-10-20
links: [repo-checks-green.md, deep-import-migration.md, agent-root-browser-safe.md, library-catalog.md, import-rules-and-jev-lint.md, ../rules.md, ../../../../AGENTS.md, ../../../../docs/libraries.md]
---

## What

The [repo checks](repo-checks-green.md) pass with two deep imports declared as known exceptions, through `SdkRules`' `knownDeepImports` in each package's `PACKAGE.ts`:

```
package              imports                                   declared reason (PACKAGE.ts)
@smthrs/model-host   @smthrs/cli/Catalog,                      the @smthrs/cli root carries the whole CLI,
                     @smthrs/cli/CatalogRequest                which this platform-neutral host can't load
                     (src/HostTools.ts)
@smthrs/rpc          @smthrs/canonical/Record,                 the wire contracts stay runtime-free zod;
                     @smthrs/canonical/Serializer              the @smthrs/canonical root loads Effect
```

Best-guess spec, one change each:
- **`model-host`:** the command catalog leaves `@smthrs/cli`, into a package whose root runs in a browser and a Worker, as `PACKAGE.ts` says: "the catalog has to leave the CLI before the import can use a root". Then `model-host` imports it from that root and the exception goes.
- **`rpc`:** either `Record` and `Serializer` move into a package with an Effect-free root, or `@smthrs/canonical`'s root stops loading Effect. Then the exception goes.

## Why

Root `AGENTS.md`: "consumers import only from a package's root entry", and "No tech debt". Will: "import only from the root if something is not public that should be public make it public" ([deep-import migration](deep-import-migration.md)). A declared exception keeps the check green, but the debt stays until each one is gone.

## State

- 00:55 on 2026-10-20: `model-host/PACKAGE.ts` declares its exception; 01:06: `rpc/PACKAGE.ts` declares its own ([repo checks](repo-checks-green.md)).
- About 02:06 on 2026-10-20: the repo-checks agent reported both as declared exceptions. The lead to Will: "One exception remains as declared debt: `model-host` deep-imports the CLI's catalog, because the CLI root doesn't bundle for browsers yet." The `rpc` one wasn't mentioned to Will.
- Not assigned.

## Next

Assign each after the SDK agents still running land, since the [agent root](agent-root-browser-safe.md) agent is moving host code in the same SDK layer. Proof for each: the `knownDeepImports` entry is gone, `importRules` passes, the browser contract covers the new root, and the export-map check and `pnpm docs:check` pass.

## Questions for Will

None. Open for the lead: where does the command catalog live once it leaves the CLI?
