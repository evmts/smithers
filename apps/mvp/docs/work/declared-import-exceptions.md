---
title: Two declared deep-import exceptions
status: in-progress
area: sdk
owner: evals builder removed the mechanism; SDK cleanup owner verifies remaining callers
updated: 2026-10-20
links: [repo-checks-green.md, deep-import-migration.md, agent-root-browser-safe.md, library-catalog.md, import-rules-and-jev-lint.md, ../rules.md, ../../../../AGENTS.md, ../../../../docs/libraries.md]
---

## Current specification — 2026-10-20, 16:54 PDT

**What:** Remove all deep-import exceptions and consume public package roots.

**Why:** SDK-5 and SDK-11 require root imports and completion of migrations.

**Current state:** At 16:53 the lead confirmed the evals builder removed its CLI NodeControl exception and deleted the exception mechanism itself. The older two exceptions retained below are historical, not sanctioned exemptions. The reply does not provide a fresh repository-wide import audit proving every historical caller migrated.

**Next step:** Verify the old model-host and rpc callers through root imports and run the owning import/export/browser checks. Keep any remaining violation assigned until real passing receipts exist.

**Open questions for Will:** None.

Evidence: script-extracted user-typed messages and lead replies, 21:53–23:53 UTC, session 6253ecf2. Current rulings and queue answers override older panel proposals. Product checks are lead-reported; this pass validates the site build only.

## Earlier tracker history (retained)

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
