---
title: Answer exchange deadlines and progress isolation
status: done
area: agent
owner: codex
updated: 2026-10-21
links: []
---

Reproduce stalled answer HTTP exchanges, progress delivery blocking, and terminal progress retention. Use the existing Effect HTTP service and durable flow retry policies (library catalog: durable workflow and retry entries); add no retry loop.

Implemented a host-configurable 15-second deadline for each whole answer exchange, independent per-answer progress writes with coalescing, direct NaN decoding coverage, and terminal cleanup. The settlement graph runs sealed `chat/ForgetProgress` only after durable retry expiration, then preserves the original typed failure. Transient attempts keep their progress.

Validation on the Mac mini farm, mirrored only from this isolated jj workspace:

- Before fixes: `pnpm exec vitest run src/features/agent/answers.test.ts src/features/agent/progress.test.ts --coverage.enabled=false`: 7 failed, 18 passed. Failures proved missing exchange deadlines, NaN becoming null, cross-answer blocking and terminal retention.
- Before expiration cleanup: `pnpm exec vitest run src/features/agent/settlement.test.ts --coverage.enabled=false`: 1 failed at retained progress after the real engine exhausted the ten-minute settlement policy under Effect TestClock.
- After fixes: `pnpm exec vitest run src/features/agent src/telemetry.test.ts --coverage.enabled=false`: 8 files, 65 tests passed, including the real agent/answer routes and retry-expiration regression.
- `pnpm exec tsc -p tsconfig.json --noEmit --pretty false`: passed after correcting two type issues in the new helper/test.
- `pnpm test` with the unchanged coverage configuration: reported 9 failures in unchanged `src/features/home/home.test.ts` amid repeated Electric shape-service 503 responses. Stopped that failing run (exit 143) to release farm capacity. The full package suite is not verified green.

Astra review found the expiration path; its follow-up review found no remaining concrete issues after the graph cleanup fix. No Fable tool is exposed in this session. No push, bookmark movement or deployment was performed.
