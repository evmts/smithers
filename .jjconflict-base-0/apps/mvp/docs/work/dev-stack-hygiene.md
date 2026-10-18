---
title: Dev stack hygiene for the agent fleet
status: done
area: infra
owner: lead (smithers-b3); written into the wiring checklist (scratchpad `final/WIRING.md`, "Dev stack hygiene") at 02:15 on 2026-10-20; compose Postgres recreated with `max_connections` 300 about 02:27; the `$TMPDIR` cleanup stays a step of each tracker tick
updated: 2026-10-20
links: [disk-space.md, app-wiring.md, model-endpoint.md, sign-in.md, repo-clone-and-view.md, code-reviews.md, e2e-suite-and-gifs.md]
---

## What

Keep the shared local dev stack on Will's MacBook healthy while 10 or more agents run test suites at once:
- **Postgres connections:** raise the compose Postgres `max_connections` from 100 to 300 (`-c max_connections=300` in `apps/mvp/docker-compose.yml`'s `command`).
- **Disk:** at each tracker tick, delete top-level `$TMPDIR` items untouched for 60 minutes.

## Why

- Parallel suites from several agents hit Postgres "too many clients" (SQLSTATE 53300). `ExecutionHost` and `RepoApi` pass alone and fail in the crowd, so agents read a shared-stack limit as a regression in their own code.
- `$TMPDIR` grows about 8 GB an hour with this fleet. The Go half of `pnpm docs:check` refuses to run below 5 GiB free ([disk space](disk-space.md)).

## State

- 02:15 on 2026-10-20: the lead added a "Dev stack hygiene" section to `final/WIRING.md`. Postgres is restarted only when no agent is running tests.
- About 02:15: the disk was at 3.3 GiB free. The lead cleared old test temp folders and it went back to 11 GiB. The lead to Will: "I'll repeat that at each tracker tick."
- About 02:16: the findings 1 and 4 fix agent reported that `pnpm docs:check` didn't run in full: its Go price check refused to start at 4.7 GiB free ([model endpoint](model-endpoint.md)).
- 02:22 to 02:23, scratchpad `full5.txt`: a full `apps/mvp` run had 14 failures in 8 files (452 passed). Four failures carry `sorry, too many clients already` (53300), among them `ModelEndpoint.test.ts` "a setting the Worker can't use is refused with 503 no_route", `RecheckRole.test.ts`'s two one-check tests and `RepoClone.test.ts` "each budget settles capacity". Earlier runs `full2.txt` and `full4.txt` (02:18, 02:22) have the same error.
- 02:23: the lead started a tracker refresh; "The disk is steady at 11 GiB free."
- 02:24: `df -h /` shows 11 GiB free (99% of the data volume used).
- 02:24: `apps/mvp/docker-compose.yml` still runs `postgres -c wal_level=logical`; the limit is not raised yet.
- 02:20 to 02:25, R3 to R5 agent: `worker/test/flowHost.ts` (02:25) now defaults each test engine to 4 Postgres connections and opens its pool lazily ([repo clone and view](repo-clone-and-view.md)). Its sample during a full run: 93 to 102 connections, most of them unnamed `@effect/sql-pg` pools. With smaller pools a full run fell from 24 failures to 10.
- **About 02:27: the limit is raised.** The lead recreated the compose Postgres. `docker-compose.yml` (02:27) now runs `["postgres", "-c", "wal_level=logical", "-c", "max_connections=300"]`, with the comment "several agents' parallel suites share this database (100 ran out)". `show max_connections` returns 300.
- 02:27:49: the lead told the wiring agent: "That fixes the 'too many clients' failures that made full `apps/mvp` runs fail different tests each time. Any run that was in flight then may show one connection-reset failure; rerun before chasing it." The wiring agent applied migrations 4 to 8 to the dev database at 02:28 ([app wiring](app-wiring.md)).
- 02:27:54, the lead to Will: "Full app test runs were failing a different set of tests each time, because agents' parallel suites ran out of Postgres connections. I raised the dev database's limit from 100 to 300."
- **02:28 to 02:29, proof:** the R3 to R5 agent's full `apps/mvp` run with coverage (scratchpad `full7.txt`): 465 passed, 2 failed, 4 skipped, of 471. Neither failure is Postgres: `agent.test.ts` streaming ("condition never held", a 2 s wait under load) and `chat.test.ts` "Electric stopping the shape (corrupt)", which fails alone too and fails on the old composition ([app wiring](app-wiring.md)). Before the change, runs failed 34, 5, 24 and 14 tests.
- 02:33: the lead: "The disk has 13 GiB free." `df -h /` at 02:34: 13 GiB available.
- **Before 02:53 on 2026-10-20: an outside SIGINT stopped the shared dev server.** W5 (c)'s late report: the `alchemy dev` on `:1337` it had restarted exited 130 from a SIGINT outside its session, likely another agent, and `:1337` stopped answering. The lead to Will (02:53): "The dev server on `:1337` is down right now, because another agent stopped it. The wiring agent restarts it at the end so you can test." Scratchpad `wiring/dev.sh` (02:53:01) relaunched it; `:1337` was ready at 02:53:21 and answered 200 at 02:55:47 ([app wiring](app-wiring.md)). Which agent sent the SIGINT isn't on record.
- 02:54 to 02:55: full `apps/mvp` runs show no SQLSTATE 53300 (`c1/full.log`, `c1/full2.log`, `wiring/unit.log`). `df -h /` at 02:55: 12 GiB available.
- **About 02:58 on 2026-10-20: "Outdated Optimize Dep" errors in the app at `:1337`** (lead's note). This is Vite's dependency pre-bundle going stale while agents change packages under a running dev server; the browser then fails module requests with 504 "Outdated Optimize Dep". The fix is a dev restart with a clean `.vite` cache. Scratchpad `wiring/dev.sh` (02:53:01) already runs `rm -rf node_modules/.vite` before `pnpm dev`. The dev server started at 02:53 logged "optimized dependencies changed. reloading" once at start, and none since by 03:05. The earlier server's log shows the same message at 23:59, 01:50, 02:20, 02:35, 02:36 and 02:44, each while agents edited packages.
- 02:56:40: a full `apps/mvp` run, scratchpad `wiring/unit2.log`: 472 passed, 0 failed, no SQLSTATE 53300. `df -h /` at 03:05: 14 GiB available.

## Next

Restart the dev server with a clean `.vite` cache (scratchpad `wiring/dev.sh`) before Will tests, and after any agent changes a package the app pre-bundles. Reopen if "Outdated Optimize Dep" shows after such a restart. Keep the 60-minute `$TMPDIR` cleanup at each tracker tick, and check `df -h /` before fanning out more than 5 agents.

Until about 02:58 on 2026-10-20 the next step was: none open. Keep the 60-minute `$TMPDIR` cleanup at each tracker tick, and check `df -h /` before fanning out more than 5 agents. Reopen if a full run fails with SQLSTATE 53300 again or the disk drops below 5 GiB.

Until about 02:27 on 2026-10-20 the next step was: raise `max_connections` to 300 and restart the compose Postgres once no agent runs tests. Then rerun the reds that carry 53300 to confirm they pass in the crowd. Keep the 60-minute `$TMPDIR` cleanup at every tracker tick, and check `df -h /` before fanning out more than 5 agents.

## Questions for Will

None. Open for the lead: should `max_connections=300` land in `docker-compose.yml` for everyone, or stay a local setting? Best guess: land it, since any contributor who runs the suites in parallel hits the same limit. (Answered about 02:27 on 2026-10-20: it is in `docker-compose.yml`, so it reaches everyone when committed.)
