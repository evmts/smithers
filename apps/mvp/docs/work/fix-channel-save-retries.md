---
title: Retry transient alert-channel save failures
status: done
area: spend
owner: codex-fix-spend-082307
updated: 2026-10-21
links:
  - ../features/spend-alerts.md
---

Confirmed finding: HTTP 408 and 429 must remain retryable through the existing
`@smthrs/flow` retry policy (library catalog: Retry, sleep durably, wait for a person or a webhook).
Regression exercises the faulty AlertsClient Effect service, step outcome metric,
and durable retry decision. Other 4xx responses remain final.

Validation on Latitude: the new 408/429 cases failed before the fix with
`GiveUp(nonRetryable)` instead of `RetryAfter(500)`. After the fix, all 20
spend tests pass (`pnpm test src/features/spend/api.test.ts src/features/spend/spend.test.ts`).
The command exits 1 solely on the existing app-wide coverage gate for this
focused selection (baseline lines 35.16%, functions 21.13%, statements 31.74%,
branches 5.92%; after branches 5.94%, others unchanged). ImportRules passes.

Browser validation: `mini-run apps/mvp -- pnpm e2e e2e/alert-channels.spec.ts`
was requested from this workspace, but never acquired one of the four occupied
Mac mini slots. The queued request was cancelled (exit 130); no browser pass
is claimed. No UI code changed.
