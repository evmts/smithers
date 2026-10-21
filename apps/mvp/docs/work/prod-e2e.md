---
title: E2e tests against production
status: in-progress
area: test
owner: prod-e2e builder (Claude Opus)
updated: 2026-10-21 11:41 PDT
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

**Production state found by the runs:**
- In production a branch is read from its repository's Code Storage mirror, and only the remote flow `repo/Clone` makes one. Until remote flows run, the run can't track its own branch, so every asking test reports blocked (`ownConversation`).
- `flows.spec`: a run reaches Done, but its Steps list has no `flow/run/load`. This fails twice in a row.
- Timing flakes in production: `navigate` hover opened in 348 ms against its 300 ms budget, `flow-usage` showed the Runs row before its success rate, and `start-app` landing took more than 5 s once.

**Waiting on:**
- Remote flows in production, which fail MigrationError and then QuickJS. The `broken remoteFlows` marks and the blocked `ownConversation` tests depend on them. The lead says when to remove the marks.
- A Workers tail adapter for `LogTail`, which the prod-flows builder owns.

**Built:**
- `e2e/target.ts` declares needs.
- The setup project in `e2e/deployment/` signs in, requests the fixture clones and tracks the run's own branch.
- `e2e/summary.ts` and `e2e/reporter.ts` report each spec; `e2e/spend.ts` guards spend; `e2e/redact.ts` keeps the cookie out of errors.
- All 38 specs declare their needs, factory.spec included.
- Docs: `infrastructure.md` "Against a deployment", the rule `test.e2e-declared-needs`, and the decision record "How e2e tests sign in to a deployment".
