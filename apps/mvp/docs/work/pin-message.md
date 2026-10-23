---
title: Pin a message
status: blocked
area: chat
owner: Codex pin-message-r2
updated: 2026-10-23
links:
  - ../decisions/0090-pin-message.md
---

Will's 2026-10-23 request: one personal pinned message above each conversation, synced across devices. Catalog entries: @smthrs/flow, @smthrs/effect-tanstack-db, @smthrs/effect-electric and @smthrs/ui.

Rebased the original implementation onto main 98bd3487. Migration 0054 follows 0053_repo_runs; decision 0090 replaces the conflicting pin decision number. Regenerated the device lock from main with UPDATE_DEVICE_SCHEMAS=1; no hand-edited fingerprints.

The queued-question integration retains the rendered local Pin callback, waits for real admission and acknowledgment, verifies both local question stores and pending intents are empty, and calls it. It preserves the synced pin on both devices and creates no new intent. Removing chat.ts's guard fails that assertion; restoring it passes against default Postgres, Electric and durable engine services (pin-stale-red.log, pin-stale-green.log). The correction changes no production behavior, coverage exclusions, thresholds or timeouts.

Validation on 2026-10-23:

- Device schema regeneration: 8 tests pass. Pin unit/step tests: 5 pass.
- Typecheck, importRules and docs:check pass; 51 published package tarballs checked.
- Pin Playwright: 3/3 pass at 390, 768 and 1280, with real Postgres, Electric, Workers and browser engine on an isolated local stack (pin-r2-e2e-rerun.log). The first attempt used the shared development schema, whose older migration history returned 503 before pinning. That shared schema was not migrated. The isolated stack was removed after proof.
- Full default-service suite: pnpm test --maxWorkers=2, under .full-suite.lock with EXIT cleanup, completed in 6077.33 seconds, exit 1. Results: 302 files passed, 16 failed, 4 skipped; 4027 tests passed, 35 failed, 2 expected failures, 10 skipped (4074 total). Pin integration completed without failure. The lock was removed. An earlier locked attempt was interrupted after database I/O caused unrelated memory timeouts; the completed retry is pin-r2-full-gate-rerun.log.
- Full coverage: statements 99.99% (22957/22958), branches 99.96% (12576/12581), functions 99.98% (6894/6895), lines 99.99% (19878/19879). The exhaustive uncovered-file report has no chat.ts or pin files. Remaining misses: agent/memory.ts:80; home/metrics.ts:29; home/reads.ts:30; repo/actions.ts:232; terminal/actions.ts:145; worker/flows/RevokeGitHubToken.ts:173.
- Failures are in FileTabs navigation, ExecutionHost, RemoteRuns, Expire, RevokeGitHubToken, TodoRecovery, Triage, agent/agent, agent/memory, chat/chat, home/home, repo/repo, repo/warm, secrets/secrets, status/flows and views/agentViews. Many are test or database-reset hook timeouts; the log retains all assertion failures. These tests were not changed by this correction.
- Astra reviewed the correction with no actionable findings. Fable could not start: the account runner reported no available account (pin-r2-fable-review.log). No reset was used.

BLOCKED: no passing full gate at 100% on all four metrics. No push or deployment.
