---
title: Local-first conflicts, one e2e test per class
status: in-progress
area: app
owner: local-first conflicts builder
updated: 2026-10-20 23:44 PDT
links: [local-first.md, ../decisions/0002-local-first.md, ../features/chat.md, ../decisions/0016-todos-and-the-stack.md]
---

## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Retain one end-to-end test per real device-conflict class.

**Why:** Prove recovery, ordering and cross-device consistency.

**Current state:** Will approved Playwright page.clock at 23:37 (TEST-12) for clock tests only. This resolves the pending permission in older history; it grants no broader mocking exception. No new all-green conflict-suite receipt is reported.

**Next step:** Use the approved page clock in clock cases, use the real model for happy paths, and fix the four reported product bugs with retained regressions.

**Open questions for Will:** None on clock simulation.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## What

Will, about 18:36 on 2026-10-20, on the "local-first tabs and devices" walkthrough: "you should show more than 1 type of conflict I'd prefer to see all of them". `e2e/local-first-conflicts.spec.ts` has one test per conflict class the device store and the outbox resolve, on two devices or two tabs, each with chaptered steps and a summary for its video's title card.

## Classes, checked against the code

| Class | Real? | How it resolves | Test | Mini run, 21:00 to 21:12 |
|---|---|---|---|---|
| Two devices change the same thing | yes: one question id from two writers; one TODO dropped twice | 409 keeps the device's copy `Not sent`, Edit asks it again; a second drop changes nothing | `same question id`, `same TODO on two devices` | passed, passed |
| An edit against a delete | no | a stored message is never edited or deleted; TODO Amend is 0016 slice 2 | none | |
| Both offline, back in either order | yes | Postgres' arrival order | `back in either order` | passed |
| A duplicate send | yes | 200 `existing`, stored once | `duplicate send` | passed |
| A stale tab after a leader switch | yes | `sent_elsewhere`: not sent twice | `stale tab` | failed: tab 1's conversation blank; now marked broken there |
| Withdraw while another tab sends | yes | `Outbox.withdraw` under the permit | `taken back before it is sent`, `taken back, still shown in the other tab`, `taken back after ChatApi took it` | failed (tab 1 blank, now marked), broken as marked, broken as marked |
| Server refusal: permission revoked offline | yes: 401, 403 `view_only` | `Not sent`, never resent | cut: see Next | |
| Schema or payload change across a deploy | yes: `plan_changed`, `payload_changed` | `chat/Close`: `Couldn't answer`, Retry | `new build refuses a parked answer` | passed |
| Clock skew | across devices: handled; one device's clock stepping back: not | arrival order; the outbox orders writes by `createdAt` | `clock skew`, `clock steps back` | passed; failed on a one-frame duplicate, now polled, not rerun |
| Co-edited draft (CRDT) | not landed | | none | |

## Bugs found

- **Fixed:** `IssueWrites.layer` handed over its outbox writes with `OutboxWrites.of`, replacing co-editing's `text-update`, so every keystroke in the composer threw "Unknown mutation function: text-update". It now uses `OutboxWrites.adding`; `src/outbox.test.ts` "every feature's mutation reaches the one outbox" fails on the old code.
- **Marked broken, not fixed:** a tab that loses the outbox's lead goes blank about 20 s later (`views` collection error); Edit after ChatApi took a question the device hasn't seen arrive takes it back anyway; a question taken back in one tab stays `Queued` in the tab that led; a clock stepping back sends two offline questions out of order (`@tanstack/offline-transactions` 1.1.3 orders and schedules by `createdAt` and `nextAttemptAt`).
- `e2e/devices.ts` gave a resent question's second response to its first post; each response now goes to the first post of its id still open.

## Run

The tests ask the real model (23:05: the lead ruled out a scripted agent without Will's yes), so they run on the MacBook under the heavy lock; the TODO test asks nothing and runs on the mini. The two clock tests use Playwright's clock, which Will approved for them only (ruling TEST-12, 23:37). The mini run in the table above used a scripted agent that has since been removed.

## Next

- After the test pause: one mini run of the whole spec, then `pnpm e2e:gifs`, and look at the frames. Videos land in `~/Desktop/smithers-mvp/videos/local-first-conflicts/`.
- Status todo: access lost while offline. Maya makes Ben a viewer of her branch while his question waits offline; ChatApi refuses it (403 `view_only`) and it stays `Not sent`. It needs a tracked branch (GitHub) and the dev teammate's sign-in: on the MacBook at 21:28 Ben's session read signed out, and at 19:18 the share route answered 503 `sql:SqlSyntaxError`.
