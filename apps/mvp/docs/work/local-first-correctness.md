---
title: Local-first correctness, the stale tab, the first session check, and Queued not Not sent
status: in-progress
area: app
owner: local-first merger (Opus)
updated: 2026-10-21 11:11 PDT
links: [local-first-conflicts.md, local-first.md, ../decisions/0002-local-first.md, ../decisions/0021-local-first-migrations.md, ../features/chat.md, ../features/sign-in.md]
---

## The three bugs — 2026-10-21 11:11 PDT

A four-model panel (Codex Sol, Codex Astra, Claude Opus, Claude Fable) investigated; the Opus merger checked each claim
against the code and builds the fixes.

| Bug | Cause | Fix | State |
|---|---|---|---|
| A tab alone shows its first question `Not sent` | `Outbox.lockLeader` answered "follower" when the Web Lock grant took over 100 ms, and the offline executor kept that answer until the grant came | The leader asks the lock (`Lock.tryHold`, Web Locks `ifAvailable`); the timer is gone | Built: 67aa73e5bf05 |
| Stale tab: both tabs of a device saw a question arrive, then lost it | Every tab stored its own Electric shape into the one device store; a tab's fresh snapshot, taken before the question and stored after another tab stored it, erased it from the device, and the full reload that followed took it from both tabs | One tab per device stores each synced collection's rows (the holder of Web Lock `persisted-sync:<id>`); the others watch. The send waits for the question's row (`awaitRow`), counted from the device's restore | Built; e2e on the MacBook next |
| A failed first session check needs a reload | `load` turned a 503 into `unreachable` and nothing asked again; the identity code reopened a visitor device once a person's session came back | A durable `auth/refresh` flow and in-place adoption of a visitor device | Building (session track) |

**Evidence:**
- **Queued:** `Outbox.test` "a program alone leads before requestLeadership answers, however late its lock manager answers" fails on the old code (`{ write: false, leads: false }`). So does `chat.test` "a tab alone whose browser grants the outbox's lock late …" (`['user unsent hello']`). Both pass now.
- **Stale tab:**
  - `OneWriter.test` "a snapshot a second program's source takes late never erases rows the first stored since" fails on the old code (the device keeps `['seed']`, not `['question', 'seed']`).
  - `chat.test` "a tab whose snapshot reaches the device store late never erases a question another tab stored" fails on the old code: both tabs record the question's delete. Both pass now.
  - The panel's Node reproduction is Opus's `exp5`, and its browser trace is Fable's f2.

**Next step:**
1. Run the stale-tab e2e 10 times, unmarked, on a dev server of our own with the real model.
2. Land the session track.
3. Deploy, then smoke-test production.
