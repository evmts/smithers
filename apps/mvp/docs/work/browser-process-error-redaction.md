---
title: Browser process error redaction
status: done
area: platform-browser
owner: codex-fix-460215
updated: 2026-10-22
links: []
---

Confirmed command argument disclosure in aborted process errors and exception message/cause disclosure in interpreter failures. Preserve typed operation diagnostics while removing caller and interpreter content. Library catalog entry: @smthrs/platform-browser; no new dependencies.

Regression: the existing adapter suite failed four assertions before the production change, covering asynchronous Error rejection, synchronous throw, non-Error rejection, and abort command retention. Latitude validation: package suite 306/306 passing with 100% statements, branches, functions and lines; package test typecheck and apps/mvp typecheck pass. Changed TypeScript files pass dprint. The package importRules command was attempted but fails with unknown_label: no importRules target is declared for this package. No schema change or UI change.
