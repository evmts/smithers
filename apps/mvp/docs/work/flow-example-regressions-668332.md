---
title: Flow example export, replay, launch and listener regressions
status: done
area: flows
owner: codex
updated: 2026-10-21
links: []
---

Fix the four confirmed example findings in the isolated workspace. Library catalog entries: durable workflows (`@smthrs/flow`), control runs (`@smthrs/control`), telemetry (`@smthrs/observability`), and step caching (`@smthrs/step-cache`). No new libraries.

Latitude regression evidence before fixes: replay erased the migrated schema; refused HTTP exports appeared in the collector summary; a failed background launch retained running status; an occupied listener port produced an uncaught EADDRINUSE and an unresolved startup promise. Listener port selection and the launch status callback expose the existing behavior to real listener and Effect failure tests.

Validation through `lat-run packages/smithers/flows`:

- Four affected files: `pnpm exec vitest run test/examples/10-telemetry-export.test.ts test/examples/21-cache-and-compensation.test.ts test/examples/24-control-plane-and-gateway.test.ts test/examples/35-remote-cache.test.ts --coverage.enabled=false`: 50 passed.
- `pnpm exec tsc -p tsconfig.test.json --noEmit --pretty false`: passed.
- Package suite with coverage, excluding the end-to-end authoring file: 199 passed, 5 failed. The same 5 failures reproduce after restoring the original example code: three barrel namespace assertions (Secrets and RunMetrics), one raw-error inventory assertion (PresenceRoom and PresenceSocket), and host containment's empty stderr assertion (Node localStorage warning). No new suite failures.
- E2e: not run (mini offline).
