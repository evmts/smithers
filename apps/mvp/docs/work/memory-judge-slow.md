---
title: Durable opening judge retry timings
status: blocked
area: agent
owner: Codex memory-judge-slow
updated: 2026-10-23
links: [../../src/features/agent/memory.test.ts]
---

The unavailable opening judge was spending 24.8–31 seconds in the durable model
step's five jittered backoffs (1, 2, 4, 8 and 16 seconds). Inject a short policy
through the existing `JudgeSeat` Effect service, preserving all six attempts and
the `OpeningFailed` assertion. Production retains the default retry policy.
It avoids building the unused HTTP server when transport itself is fault-injected.
Uses the library catalog's durable model step and Node flow host entries
(`@smthrs/agent`, `@smthrs/flows`, `@smthrs/platform-node`); no new library.

Validation so far:

- Ten consecutive `pnpm test src/features/agent/memory.test.ts
  --coverage.enabled=false --reporter=verbose` runs passed (90/90 tests).
  The unavailable case measured 1.508 seconds in run 3; shared SQL load made
  some iterations slower, without a production backoff delay.
- The final isolated unavailable-case run passed in 2.443 seconds. The strict
  isolated two-second target is not proven on this loaded host.
- `pnpm typecheck` passed all four projects.
- `pnpm exec smithers-build test '//apps/mvp:importRules'` passed.
- Full `pnpm test --maxWorkers=2` ran with V8 coverage enabled, then was
  interrupted after eight confirmed failures outside the edited files. The
  final coverage report was not produced; 100% coverage is not proven.
  Failures: `src/features/chat/chat.test.ts` (1), `worker/ExecutionHost.test.ts`
  (2), `src/features/terminal/terminal.test.ts` (1), `worker/RemoteRuns.test.ts`
  (1), `src/features/flows-ui/flows.test.ts` (1), and
  `src/features/agent/agent.test.ts` (2). Chat logs include Electric shape 502s.
  Full output: `/tmp/memory-judge-full.log` on the Mac mini.

Before the fix, the focused case failed at the unchanged 30-second limit.
Astra's final review found no issues. Fable is unavailable in the exposed model
inventory and there is no local Claude executable.
