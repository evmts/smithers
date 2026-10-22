---
title: Worker admission and network consistency
status: done
area: worker
owner: codex-fix-worker-590838
updated: 2026-10-21
links: []
---

Fixed mapped network identity, human-wait turn ordering, message commit ordering, and atomic, idempotent steer admission. Uses the existing Effect SQL and catalogued notifications/journal durable writer services.

Validation so far:
- Latitude: `pnpm exec vitest run worker/Throttle.test.ts worker/Answers.test.ts worker/Messages.test.ts worker/RemoteRuns.test.ts`: baseline 61 passed; regressions against old code 7 failed for the reported reasons; fixed 66 passed.
- Latitude: `pnpm exec vitest run src/features/agent/agent.test.ts src/features/runs/remote.test.ts`: 27 passed against both original and fixed workers.
- Both targeted Vitest commands exit 1 on the unchanged package-wide 100% coverage gate; no thresholds were changed. The agent/engine integration comparison introduced no test failures.
- Latitude: `pnpm exec tsc -p worker/tsconfig.json`: passed.
- Mac mini: `pnpm e2e e2e/agent.spec.ts`: both original and fixed workers had 1 passed and the same 3 failures, at assertions `45:11`, `83:65`, and `107:67`. No new failures.
