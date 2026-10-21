---
title: E2e tests against production
status: in-progress
area: test
owner: prod-e2e builder (Claude Opus)
updated: 2026-10-21 11:50 PDT
links: [../rulings.md, ../rules.md, ../infrastructure.md, e2e-suite-and-gifs.md, major-feature-e2e-derisk.md, sign-in.md]
---

**What:** One command, `E2E_PROD_URL=<url> pnpm e2e:prod`, runs the e2e suite against production and reports pass, fail or a declared skip for every spec, with GIFs (TEST-1, TEST-3, TEST-4, TEST-6).

**Design:** the four-model panel's merged plan. A setup project signs the test account `codeplanesmithers` in through real GitHub from its browser profile, or reuses the stored session. It keeps only the app's session cookie, in `~/.smithers-e2e/<host>/`. Every spec declares its needs in `e2e/target.ts`. A summary reporter fails the run on a failure, an undeclared skip or a blocked need. A spend guard stops model-using tests at the run's token budget.

**Evidence, 2026-10-21:**
- 10:01 PDT: the setup signed the test account in to production through GitHub in 11.4 s and stored one cookie, the app's `__Host-smithers_session`, with no GitHub cookie. Identity: codeplanesmithers, guest.
- 10:03 PDT: a second run reused the session (319 ms) and signed nobody in.
- 10:09 PDT: `pnpm e2e:prod answer-ordering.spec.ts observability.spec.ts` ran. Its 3 tests skipped with the declared need `localLogs`, and the run passed.

- 10:30 PDT: piece A landed on main as e93c4812547a.
- Will sent Write invitations on `smithersai/smithers` and `roninjin10/smithers-github-tests`. The test account accepted both through its profile. A fresh sign-in (`E2E_FRESH_SIGN_IN=1`) then read role member, and the setup requested the `octocat/Spoon-Knife` clone (202).
- 11:45 PDT: `pnpm e2e:prod chat.spec.ts start-app.spec.ts sign-in.spec.ts` passed. That is 10 passed, among them chat's streamed answer as a Member and sign-in's `github` test, and 8 declared skips. The GIFs are in `~/Desktop/smithers-mvp/prod/`.
- Every one of the 37 specs now declares its needs. `e2e/target.test.ts` fails on a `test.skip(`, a localhost check or `E2E_SESSION_COOKIE` in a spec.

**Waiting on:** the MigrationError fix. Remote flows fail in production, and their tests are marked `broken remoteFlows` (TEST-5).

**Next:**
- The first full production run.
- Chat specs should ask in the test account's own branch conversation instead of the team's home conversation.
- A Workers tail adapter for `LogTail`; the prod-flows builder owns it.
