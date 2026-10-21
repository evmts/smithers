---
title: Benchmark correctness regressions
status: done
area: app
owner: Codex bounced-commit amendment
updated: 2026-10-21
links: [../benchmarks.md]
---

Reproduce the eight reported benchmark findings in the isolated workspace. Unit and integration validation runs through Latitude; browser validation uses the mini. No baseline timings are claimed.

All eight reported findings reproduced before correction. Repository replay and selected-baseline regressions failed 2/2; follower and resource regressions failed 7/7 for the reported behavior. An additional bodyless-204 regression also failed before its fix.

Validation through `LAT_RUN_SRC=<this workspace> scratchpad/lat-run apps/mvp -- ...`:

- `node --test bench/chatapi.test.ts bench/follower-regressions.test.ts bench/probe.test.ts bench/regressions.test.ts bench/resources.test.ts bench/stats.test.ts`: **25 passed, 0 failed**. Includes real HTTP body cancellation, real resource release on partial acquisition and cancellation, and baseline provenance.
- `pnpm test`, before: **2528 passed, 16 failed, 9 skipped** across 206 files. After: **2539 passed, 5 failed, 9 skipped**. Every remaining failure occurred before; **0 newly failing tests**. Existing failures are in boot, the window's fault switches, and shortcut unbinding. This is the authorized farm A/B comparison, not a claim of a green full suite.
- `pnpm exec tsc -p bench/tsconfig.json`: no errors in changed files; **8 unchanged errors** in the independent `bench/cerebras-load` campaign. That gate is not green; its errors were not suppressed or its scope narrowed.
- Astra reviewed the fix, three findings were corrected, and its final review found no remaining correctness issue. Fable is unavailable through this session's tools/model list.

Effect services/scopes are existing dependencies. No live benchmark timing or model-cost claim is made. Follower transport errors fail observation instead of retrying across an unmeasured gap; the old retry loop is deleted. No push, bookmark change, deployment, or merge is performed.

Amendment: replace both follower test timer races with condition completion bounded by test timeouts; renumber the observation-failure decision to [0029](../decisions/0029-benchmark-observation-failures.md). Latitude: the six-file `node --test` benchmark suite passed 25/25, including both changed follower tests. The requested `pnpm test bench/follower-regressions.test.ts --coverage.enabled=false` found no files because Vitest excludes bench/. `pnpm exec smithers-build test //apps/mvp:importRules` confirms no follower violations, but fails on 12 pre-existing violations in e2e/factory.spec.ts, src/device/identity.ts, src/features/agent/agent.test.ts, src/features/runs/remote.test.ts and worker/Answers.test.ts; the full gate is not green.
