---
title: Durable scoring without a private queue
status: blocked
area: sdk
owner: codex-scorers-durable
updated: 2026-10-22
links: []
---

Remove the volatile scoring Runner. Library catalog entries: `@smthrs/scorers`
for blocking scoring and `@smthrs/flow` for caller-owned durable actions.
Keep the original change and message; no push or local dependency installation.

Scoring now runs inside its caller's durable action. Evaluation persists
cloneable inputs, binding positions and request identity, resumes interrupted
work, rejects failed score-store writes, and uses the engine's transient retry
policy. Real SQL-journal interruption, replay and failed-write recovery have
regression tests.

Rebased onto `ed39207e`. Latitude target-index succeeds on both the original
`8f76343321b6` and main, and on the rebased change. The lander's opaque failure
did not reproduce, so its cause is unconfirmed. The original scorer commit
already updates PACKAGE.ts to Scoring; regenerated target-index removes its
stale Runner/RunnerLive paths and is byte-identical after a second write.

Fresh Latitude proof: scorers 276 tests and evals 285 tests, each 100% in all
four coverage categories; both package lint and typecheck commands pass.
CLI selected suites pass 173 tests, plus both existing-output refusal cases;
17 bootstrap tests also pass. Changed-source lint and both CLI programs' production typechecks pass. The diagnostic
regression fails when the old Entry reporter is restored, then passes with
receipts enabled. Startup failures have the same reporting path and a regression.

Docs remain blocked: site synchronization succeeds, but the durable
`pnpm docs:sync` and `pnpm docs:check` commands each fail to finish within a
five-minute bound. Initially the confined filesystem reported a missing
smithers-jj-export helper. Building the current revision's release helper on
Latitude succeeds; repeating both commands with its supported absolute-path
override still times out. Neither has a successful durable completion receipt.
The separate CLI diagnostics change prints a bounded redacted tag/message and
private log path without serializing error payloads, arguments or environment.

The extra public-export contract run passes 38/39: main already exports
@smthrs/model/WireTrace without its reviewed baseline entry. This change does
not modify the model package, and its model fixture entries equal main.
