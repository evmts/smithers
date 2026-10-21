---
title: E2e tests against production
status: in-progress
area: test
owner: prod-e2e builder (Claude Opus)
updated: 2026-10-21 10:10 PDT
links: [../rulings.md, ../rules.md, ../infrastructure.md, e2e-suite-and-gifs.md, major-feature-e2e-derisk.md, sign-in.md]
---

**What:** One command, `E2E_PROD_URL=<url> pnpm e2e:prod`, runs the e2e suite against production and reports pass, fail or a declared skip for every spec, with GIFs (TEST-1, TEST-3, TEST-4, TEST-6).

**Design:** the four-model panel's merged plan. A setup project signs the test account `codeplanesmithers` in through real GitHub from its browser profile, or reuses the stored session. It keeps only the app's session cookie, in `~/.smithers-e2e/<host>/`. Every spec declares its needs in `e2e/target.ts`. A summary reporter fails the run on a failure, an undeclared skip or a blocked need. A spend guard stops model-using tests at the run's token budget.

**Evidence, 2026-10-21:**
- 10:01 PDT: the setup signed the test account in to production through GitHub in 11.4 s and stored one cookie, the app's `__Host-smithers_session`, with no GitHub cookie. Identity: codeplanesmithers, guest.
- 10:03 PDT: a second run reused the session (319 ms) and signed nobody in.
- 10:09 PDT: `pnpm e2e:prod answer-ordering.spec.ts observability.spec.ts` ran. Its 3 tests skipped with the declared need `localLogs`, and the run passed.

**Waiting on:**
- Will's Write grant for `codeplanesmithers` on `smithersai/smithers` (queue 985). Until then the account is a Guest, and every Member test reports blocked.
- The MigrationError fix: remote flows fail in production. Their tests are marked `broken remoteFlows` (TEST-5).

**Next:** declare needs across all 37 specs, then do the first full production run.
