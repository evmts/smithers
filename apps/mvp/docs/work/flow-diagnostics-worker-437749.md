---
title: Flow diagnostics and queue failure propagation
status: done
area: flow
owner: codex-fix-437749
updated: 2026-10-22
links: []
---

Use the catalog's `@smthrs/flow` authoring and retry facilities. Reproduce and fix token diagnostic control characters, volatile queue take retries, Graph subpath imports, and fatal diagnostic documentation.

All four regressions failed against the workspace baseline. Latitude: 931 tests pass with 100% coverage; flow importRules passes; apps/mvp `tsc --noEmit` passes. The package test typecheck reports pre-existing unchecked tuple-index errors in unchanged `test/RetryPolicy.test.ts:657-658`.

Token errors now bound and escape excerpts and schema diagnostics. Store take failures log and propagate as defects for host recovery; item completion retries remain engine steps. Graph uses the public roots of the catalog's plan and capability libraries. Its diagnostics documentation distinguishes retained fatal diagnostics from expansion exceptions.
