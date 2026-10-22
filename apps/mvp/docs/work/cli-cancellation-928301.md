---
title: CLI cancellation and bounded admission scanning
status: done
area: cli
owner: codex-fix-928301
updated: 2026-10-21
links: []
---

Reproduce the seven supplied Detached, Suggest and Ui findings, retain regressions,
and validate on Latitude. Use the catalog's existing CLI terminal adapter and
Effect cancellation; no new UI or workflow library is needed.

All seven findings reproduced and fixed. The four regression files contain 11
cases: all fail on the original source and pass after the change. The focused
12-file Latitude suite passes 123 tests. TypeScript checking passes.

Three additional integration cases fail identically before and after the change:
DetachedChildAfterRoot (two cases; missing smithers-jj-export native helper), and
DetachedHostResume (start returns status 1). They are baseline failures.

The requested //packages/smithers:importRules target is absent at this revision.
The shared ImportRules checker passes directly over the four new regression files
with a forbidCalls rule for setTimeout, sleep and Effect.sleep. No new fixed waits.

The implementation uses the existing CLI terminal adapter and Effect's Schedule,
timeout and TestClock APIs. Cleanup records a span, counter and content-free debug
settlement; the regression verifies its counter advances.
