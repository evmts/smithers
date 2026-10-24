---
title: Repair newest main test and branch coverage reds
status: in-progress
area: app-tests
owner: codex-main-reds-0024c
updated: 2026-10-24
links: [../rules.md, ./main-reds-0024.md]
---

Trace RemoteRuns and shared TODO status failures to their introducing commits;
repair behavior or test setup without weakening assertions. Exercise missing
issue/pull installed-receipt branches and repository About failures through
real services. Use the catalog's existing @smthrs/flow, @smthrs/effect-electric,
and @smthrs/effect-tanstack-db APIs. Keep the earlier repair jobs' files untouched.
Refresh main before the locked full app suite, then record coverage, typecheck
and ImportRules evidence. No push or deployment from this clone.

The RemoteRuns failure reproduces alone: the test added in `6b05ff32` keeps
asking Electric for the original snapshot (`offset=-1`) instead of consuming
its cursor. When that snapshot is empty, it never observes the later insert.
An explicitly empty first snapshot makes the old polling fail deterministically;
following its handle/offset and applying the actual row changes passes, retaining
the one-row and increasing-revision assertions. Receipts: focused baseline
failed at line 423; strengthened regression red, then green (1 test, 14.46 s).
No remote-run product behavior changed.

Newest main already contains the earlier shared TODO transport repair
`cfcdf6fa` for `dbbb167b`'s durable read: registration must retain the host's
authenticated HTTP transport. Its real-device missing/current-row test passes
unchanged in this clone. No earlier-job file was edited.
