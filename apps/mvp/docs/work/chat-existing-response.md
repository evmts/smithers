---
title: Validate existing-question receipts
status: done
area: chat
owner: codex-fix-apps-mvp-src-features-chat-300391
updated: 2026-10-21
links:
  - src/features/chat/api.ts
  - src/features/chat/api.test.ts
---

Validate the HTTP 200 receipt before the outbox starts an answer. Retain the
existing Effect HttpClient and Schema APIs; no new library is needed.

Regression cases use the gateway tests’ real loopback HTTP server and sockets.

Latitude: `pnpm test src/features/chat/api.test.ts --silent`: before, 11 failed
and 5 passed; after, 16 passed (file-only run fails the global app coverage gate).
`pnpm test src/features/chat`: after, 105 passed, with only the baseline failure
in `shortcuts > are unbound when their scope closes`. No new failures.

Mac mini: `pnpm e2e chat.spec.ts` baseline: 1 passed, 4 failed (answer-related
cases). The after run waited over 20 minutes for the shared browser permit and
was cancelled while still queued; no after E2E result is claimed.
