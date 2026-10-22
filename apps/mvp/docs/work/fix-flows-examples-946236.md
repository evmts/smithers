---
title: Secure placed deployment and report sandbox initialization failures
status: done
area: flows
owner: codex-fix-946236
updated: 2026-10-21
links: []
---

Regression tests cover holder authentication, deployment status and transport failures, and sandbox initialization exit handling. Uses the library catalog's @smthrs/flow durable action entry and Effect HttpClient for injected, interruptible HTTP. No new libraries.

All four findings reproduced with failing behavioral tests and fixed. Deployment
regressions pass, including real remote durable execution, typed durable HTTP
refusal, and injected transport cancellation. Sandbox failure and real sandbox
execution pass. Latitude full package run: 229 passed, 5 existing failures
(raw-error inventory, three barrel namespace assertions, and a Node warning in
host-containment); the same five failed before the sandbox change. Package
TypeScript test check and changed-file formatting pass. importRules was attempted
but this package does not declare that target. No thresholds were changed.

Latitude apps/mvp `pnpm exec tsc --noEmit` passes.
