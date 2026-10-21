---
title: E2e tests against production
status: in-progress
area: test
owner: prod-e2e builder (Claude Opus)
updated: 2026-10-21 16:50 PDT
links: [../rulings.md, ../rules.md, ../infrastructure.md, e2e-suite-and-gifs.md, major-feature-e2e-derisk.md, sign-in.md]
---

**What:** One command, `E2E_PROD_URL=<url> pnpm e2e:prod`, runs the e2e suite against production and reports pass, fail or a declared skip for every spec, with GIFs (TEST-1, TEST-3, TEST-4, TEST-6).

**Design:** the four-model panel's merged plan. A setup project signs the test account `codeplanesmithers` in through real GitHub from its browser profile, or reuses the stored session. It keeps only the app's session cookie, in `~/.smithers-e2e/<host>/`. Every spec declares its needs in `e2e/target.ts`. A summary reporter fails the run on a failure, an undeclared skip or a blocked need. A spend guard stops model-using tests at the run's token budget.

**Evidence, 2026-10-21 (Pacific):**
- 10:01: the setup signed `codeplanesmithers` in to production through GitHub in 11.4 s. It stored one cookie, the app's `__Host-smithers_session`, with no GitHub cookie. The account was then a guest.
- 10:03: a second run reused the session (0.3 s) and signed nobody in.
- About 10:20: the test account accepted Will's Write invitations on `smithersai/smithers` and `roninjin10/smithers-github-tests` through its profile. A fresh sign-in read role member.
- 10:29: `chat`, `start-app` and `sign-in` passed with 10 passed and 8 declared skips. That includes chat's streamed answer and the `github` sign-in test. Five run-tagged questions from this run are in the production home conversation.
- 11:05: the first full run (124 tests) gave 15 passed, 14 failed, 17 broken (expected), 43 declared skips and 35 blocked. Of the 14 failures, 8 were asking tests failing on the new gate instead of skipping; they now skip as blocked. The home conversation gained no rows.
- 11:35: after the review fixes, `chat`, `start-app` and `navigate` hover passed, and 4 asking tests skipped as blocked.

- 12:30 to 13:10: the full run after remote flows began to run in production (smoke 18:48 UTC on 931fed70), with the own branch tracked. 124 tests: 40 passed, 29 failed, 3 broken, 1 fixed, 58 declared skips, 0 blocked. Chat's asks, jev, the branch conversation and views, code-intel, home, repo clones and local-first-conflicts passed in the account's own conversation.
- 13:15 to 14:15: two reruns after the harness fixes. flow-usage, slash-commands and web-page now pass. From 20:55 UTC the own conversation's answers failed `rate_limited`, the model provider's limit, with other production runs going at the same time.

**Production state found by the runs:**
- In production a branch is read from its repository's Code Storage mirror, and only the remote flow `repo/Clone` makes one. Until remote flows run, the run can't track its own branch, so every asking test reports blocked (`ownConversation`).
- `flows.spec`: a run reaches Done, but its Steps list has no `flow/run/load`. This fails twice in a row.
- Timing flakes in production: `navigate` hover opened in 348 ms against its 300 ms budget, `flow-usage` showed the Runs row before its success rate, and `start-app` landing took more than 5 s once.

- 15:50 to 16:05: the asking specs again, on the 5M daily budget, with the provider answering: 16 passed, 18 failed, 14 declared skips. Every answer in the own conversation settled `done`. The failures are on the device: the branch page below, and tests that assume `/app` (navigate by the agent, chat's "in view" and "reload mid-answer"). Three also need their owners: status "needs you, live", agent "ask", which sees a second model role, and sync, whose second device doesn't show the answer.

**Codex Sol on five production failures (16:20 to 16:45):**
- navigate "by the agent": the other tab's readiness follows its place (`Tab.ready`).
- chat: `answerTo` takes the first assistant message after the user's question. "in view" asks its own history first, and "reload mid-answer" reloads only once the answer has started.
- agent "ask": `timeline/summarize` calls the `summary` role on its own (docs/features/timeline.md). The test leaves those out and still requires the answer's calls to be `agent` only.
- Runs: hovering Runs now warms the engine's run list (src/router.tsx, `warmList` in src/features/runs/store.ts), so the click no longer waits for the list. The regression test fails on the old route.
- message edit's draft: not found. Branch drafts use the persisted `chat-drafts` collection, and a real SQLite save and reload passes. `src/features/chat/draftWrite.ts` adds stage records, counters and a span, without draft text, to find the production write that stays unsaved.

**Found on the branch page:** asking tests now run on the account's own branch, and that page differs from `/app`:
- the connection pill doesn't read Offline when the device is offline (local-first);
- the page sets no theme attribute until a mode is chosen;
- the composer doesn't mark a draft saved (message-controls "message edit");
- a page opened offline after storage eviction doesn't show its branch chrome (sign-in's ownerless activation).
- `POST /api/branches {create: true}` on a branch Code Storage already holds answers 503, not `exists`.

**Next:** the branch workspace owner settles each branch-page difference above, as a product fix or as a test change, with the spec's owner.

**Built:**
- `e2e/target.ts` declares needs.
- The setup project in `e2e/deployment/` signs in, requests the fixture clones and tracks the run's own branch.
- `e2e/summary.ts` and `e2e/reporter.ts` report each spec; `e2e/spend.ts` guards spend; `e2e/redact.ts` keeps the cookie out of errors.
- All 38 specs declare their needs, factory.spec included.
- Docs: `infrastructure.md` "Against a deployment", the rule `test.e2e-declared-needs`, and the decision record "How e2e tests sign in to a deployment".
