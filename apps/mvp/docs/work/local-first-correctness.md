---
title: Local-first correctness, the stale tab, the first session check, and Queued not Not sent
status: in-progress
area: app
owner: local-first merger (Opus)
updated: 2026-10-21 15:30 PDT
links: [local-first-conflicts.md, local-first.md, ../decisions/0002-local-first.md, ../decisions/0021-local-first-migrations.md, ../features/chat.md, ../features/sign-in.md]
---

## The three bugs — 2026-10-21 11:11 PDT

A four-model panel (Codex Sol, Codex Astra, Claude Opus, Claude Fable) investigated; the Opus merger checked each claim
against the code and builds the fixes.

| Bug | Cause | Fix | State |
|---|---|---|---|
| A tab alone shows its first question `Not sent` | `Outbox.lockLeader` answered "follower" when the Web Lock grant took over 100 ms, and the offline executor kept that answer until the grant came | The leader asks the lock (`Lock.tryHold`, Web Locks `ifAvailable`); the timer is gone | Built: 757aa2e27d5f, queued with the lander |
| Stale tab: both tabs of a device saw a question arrive, then lost it | Every tab stored its own Electric shape into the one device store; a tab's fresh snapshot, taken before the question and stored after another tab stored it, erased it from the device, and the full reload that followed took it from both tabs | One tab per device stores each synced collection's rows (the holder of Web Lock `persisted-sync:<id>`); the others watch. The send waits for the question's row (`awaitRow`), counted from the device's restore | Built: 5eacfed79ef6, queued with the lander; the stale-tab e2e passes unmarked, 10-run proof below |
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

## The stale-tab e2e, unmarked — 2026-10-21 15:08 PDT

The test ran on a dev server of our own (stage `localfirst_williamcory`, database `smithers_localfirst`, Electric on
:30004, https://localhost:1448) with the real model, its results outside `apps/mvp`.

- **Run 1, 14:35–14:51:** 9 of 10 passed.
  - The one red stopped before the test's subject: device B's reload never opened the app. Vite answered the HTTPS
    proxy `ECONNRESET` for a module (`502`), with the MacBook under load.
- **Run 2:** stopped after two load-induced timeouts. It ran beside this merger's GIF build.
- **Run 3, 15:10–15:29:** 9 of 10 passed.
  - The one red: tab 2's device store took 64 s to restore (`chat ready` at 125 s for a tab opened at 61 s), with the
    MacBook's load average at 33. The first answer's 60 s wait ran out in tab 2 while tab 1 and device B showed both
    answers.
  - No question vanished, here or in any of the 20 runs. The restore's slowness is its own defect, outside this topic
    (see Fable's note in the panel).
- **GIF and video** (run 1, a passing repeat, `e2e:gifs:check` clean):
  - `~/Desktop/smithers-mvp/gifs/local-first-conflicts-stale-tab-a-tab-that-lost-the-outbox-s-lead-to-another-and-l.gif`
  - `~/Desktop/smithers-mvp/videos/local-first-conflicts/`

**Lessons for anyone running e2e on a dev server of their own:**
- **Results inside `apps/mvp` reload every page.** Vite reloads every page when a Playwright trace's `.html` lands under
  the app root, as `--output=test-results-*` does. That reload sent a tab into memory mode (`DeviceIdentityRefused`)
  and voided the first runs. Write results outside the app.
- **A GitHub App in the environment changes who is signed in.** With one configured, ChatApi signs nobody in. Local
  development's fallback, the local developer the local e2e target expects, applies only without one.
