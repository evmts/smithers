---
title: Backend process and revision regressions
status: done
area: cli
owner: codex-951670
updated: 2026-10-22
links: []
---

Reproduce the nine backend findings in the isolated fix workspace. Use the library catalog's existing process containment services (`@smthrs/kernel` ProcessLedger and `@smthrs/platform-node` ProcessReaper); retain Effect cancellation and scoped cleanup. No new library or runtime is introduced.

The original process implementation failed three real-process regressions on Latitude: pre-aborted cancellation resolved successfully, endless overflow reported a timeout, and repeated backpressure accumulated 63 close/error listeners. The fixes and existing BackendProcess suite pass 11 tests.

The remote mirror excludes `.jj`, so the revision integration probe stopped at tool failure. Extract the existing parser unchanged and reproduce the multiple-record error through its pure boundary instead.


Four findings are fixed: revision cardinality, pre-aborted spawn cancellation, backpressure listener cleanup, and immediate output-limit failure. The parser's behavior-preserving extraction failed two new assertions before the fix; the three original process assertions also failed before the fix. Final related unit/integration run: 18 passed, including exact output-size boundaries on both output streams and both spawn stdio modes. A further CLI assertion exercises a multi-revision query through the real executable.

`apps/mvp` TypeScript check passed on Latitude. The CLI test-project typecheck reports an untouched error in `test/NativeControlInitialization.test.ts:19` (string versus literal `"gateway"`). The requested `//packages/smithers:importRules` command was executed but that target is absent from this revision; no passing importRules receipt is claimed. No device schema changed.

The five remaining findings (host state root, issue-draft durability, config-write atomicity/concurrency, installation-poll durability, and clone fallback) remain unchanged: no no-mock behavioral regression was established for them in this run. Source inspection alone is not a reproduction or a fix. The host path requires a healthy installed launchd service; model drafting and installation polling require authenticated service execution; config fault/concurrency and clone-failure behavior need dedicated real-boundary reproductions. No success is claimed for those findings.
