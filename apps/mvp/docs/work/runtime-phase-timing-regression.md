---
title: Runtime phase timing regression
status: blocked
area: runtime
owner: codex-todo-start-latency
updated: 2026-10-22
links: [../../../../packages/smithers/flows/docs/runtime-construction.md]
---

Repair bounced be9b41b54559 on main 90ea5caf53f9. Preserve all five
construction phase durations and the host's RunMetrics log level.
Catalog entries: durable runtime (@smthrs/flows) and run telemetry (@smthrs/flow).
This is core runtime instrumentation, not a product plugin.

The observer wrapped construction in Effect.withSpan. Registrations capture their
construction context for later execution, retaining the temporary construction
span. Tweet-thread's durable waits timed out. Removing that span preserves the
host context and makes all 240 agent examples pass (two live examples skipped).
The observer now uses the caller's memo map and scope through Layer.fromBuild and
Layer.buildWithMemoMap instead of starting another Layer.build per phase.
The tracing-context regression fails with construction spans restored.

Main has removed the hosted-flow configuration modified by the bounced commit;
retain main's configuration and registration behavior. Admit the new phase
record and phase field in the browser telemetry contract.

All installs and validation run on Latitude, one invocation at a time. No push.
Final validation receipts are recorded in the builder report outside the repo.

Validation: all 240 agent examples pass (two live examples skipped). The tracing
context regression fails with construction spans reinstated and passes with the
fix. The flows package typecheck, changed-source ESLint and formatting pass;
its six full-suite failures reproduce on main.

Acceptance remains blocked: the final full app run on nyc-01 (two workers,
coverage enabled) has 3,212 passes and four failures. Telemetry drift and the
status-flow restart timeout reproduce on main. The repository-warm failure and
an unexpected pass of the known-broken coediting test did not reproduce in the
same-host main comparison (26 passed, two expected failures). An earlier
four-worker app run also had three additional failures that passed on main and
in the two-worker full run. No clean full-suite equivalence receipt is claimed.
