---
title: Fix the four MVP code review findings
status: in-progress
area: app
owner: codex-review-fixes-2026-10-20
updated: 2026-10-21
links: [old-app-context-mvp-code-review.md, ../features/sign-in.md, ../features/issues.md, ../features/agent.md, land-to-main.md]
---

Will requested all four fixes from the old-app-context review: account isolation after session expiry, replayable TODO successor admission, renewable credentials for queued agent writes, and ordering while an earlier answer is actively reasoning or running a tool.

Acceptance: each reported failure has a regression test that fails on the reviewed behavior and passes on the fix; same-account offline recovery remains usable; different-account writes never inherit another person's queue; TODO admission retries preserve exactly one successor attempt; queued writes retain agent attribution after renewal; active runs keep their turn while abandoned runs can release it. Include device-schema migrations where stored shapes change, diagnostics without content or credentials, and feature documentation. Validate the current state, obtain finished-work reviews, and land only this change through jj without disturbing concurrent work.

Library catalog entries: `@smthrs/effect-tanstack-db` for stored collections, payload migrations and outbox; `@smthrs/flow` and the existing engine/hosts for durable actions and liveness; Effect services for choices and fault injection. Extend these public SDK interfaces if needed; do not add app retry loops or a second execution system.

Baseline inspected at working-copy revision `2d4415a7381f914b7c5f653d1695e4adc61dd21a`; shared checkout contains concurrent work. Review evidence is retained in `/tmp/smithers-mvp-context-review.html` and the three `/tmp/smithers-mvp-review-*-probe.ts` programs (the TODO probe is `/tmp/smithers-mvp-review-probe.ts`). A Smithers implementation launch is being prepared; no completion is claimed.

The `coding/dispatch` launch again did not reach durable admission. A live sample showed repeated native workspace-helper subprocesses during startup (`/tmp/smithers-review-fixes-launch.sample.txt`); the runs API still listed only the old failed `run-50`. The launcher was terminated before any worker started. Implementation proceeds with repository-authorized Sol workers (PROC-12, TEST-7) rather than waiting on that orchestration fault. The `quality-mini` environment is reachable and has the repository and dependencies; its revision differs, so tests must use the exact fix snapshot.
