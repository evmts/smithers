---
title: Node host cancellation on Linux
status: blocked
area: platform-node
owner: codex-node-cancel-red
updated: 2026-10-22
links: []
---

Investigate the reported SIGUSR2 validation error and cross-driver host cancellation failure on Linux. Reproduce on Latitude before changes, retain Linux regression coverage, and validate the complete platform-node coverage gate and typecheck. Library catalog entry: Run flows in a Node or Bun program (`@smthrs/platform-node`). No new dependency.

Baseline: fetched `main@origin` at `656539c3ae0b`. Latitude's original NodeRuntime suite passed 27/27. The unchanged complete suite failed 9 tests (NativeRuntimeRestart: 2, NodeRuntimeSignals: 3, NodeRuntimeReap: 4), with 2 uncaught NaN-pid errors in the reap fixture; the cross-driver test passed. Linux CI job 120051284935 has the same unrelated failures, not a SIGUSR2 validation failure.

Source finding: `NativeRuntime.snapshotSignals` throws `cannot install signal` only when a configured name is absent from `node:os.constants.signals` or is SIGKILL/SIGSTOP. It neither inspects other listeners nor calls `process.on` at that point. The original cross-driver test configures `signals: []`. No product change is justified by this evidence.

Expanded the cross-driver test to run with both no signals and two hosts sharing SIGUSR2, each on its own real SQLite file; retained process-tree cleanup, durable cancelled status and caller interruption assertions. The test now rethrows its original Effect failure instead of replacing it with an undefined-settlement assertion. Documented the diagnostic in platform-node troubleshooting.

Latitude validation: expanded NodeRuntime suite 28/28; `pnpm check` passed (production and test TypeScript). Logs: `~/smithers-builders/node-cancel-red-focused.log`. Full coverage-gate rerun and formatting receipt: `~/smithers-builders/node-cancel-red-coverage.log`. The latter records Linux Node v26.5.0 with SIGUSR2=12. No Linux skip was added; no push or main movement.

Blocked on the exact failing SIGUSR2 job or reproduction environment. The reported error is not reproduced on this revision; do not interpret the new tests as a product cancellation fix. Full-suite acceptance remains blocked by the recorded baseline failures, with coverage enabled and unchanged 100% thresholds.
