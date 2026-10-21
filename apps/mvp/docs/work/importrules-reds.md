---
title: Clear remaining importRules timing violations
status: done
area: testing
owner: codex-importrules-reds
updated: 2026-10-21
links: []
---

Remove six factory video pauses with no additional observable condition; retain the existing status, route, step, warning, checks and file assertions. Preserve the heartbeat and no-polling observation windows with Effect.sleep, and bound the stalled-body heartbeat with Effect.timeout.

Library catalog: Effect time composes with the existing Smithers agent and flow runtime; no SDK changes or dependencies.

Validation: importRules passes unchanged with zero violations. Latitude: all 51 tests across agent, remote runs and Answers pass (targeted run without app-wide coverage collection). Factory browser test not run: Mac mini offline; its TypeScript is included in the app typecheck. The base also needed the exact late-lock timer replacement from d9f667dd2162. No observable condition existed for the six removed video pauses.
The late browser-lock regression also passes on Latitude (1 selected test; 60 unrelated tests skipped). Targeted suites do not establish full-app coverage.
App typecheck passes across browser (including e2e/factory.spec.ts), Worker, infrastructure and evals.
