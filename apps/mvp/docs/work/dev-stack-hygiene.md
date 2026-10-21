---
title: Dev stack hygiene for the agent fleet
status: in-progress
area: infra
owner: lead and dev transport owner to assign
updated: 2026-10-20 22:44 PDT
links: [will-decision-queue.md, cerebras-rate-limits.md, flow-authoring.md, chat-message-controls.md, review-round-4.md, decisions-for-will.md, navigate-flow.md, site-deployment-test.md, docs-check-flow-outcome.md, land-to-main.md, disk-space.md, app-wiring.md, model-endpoint.md, sign-in.md, repo-clone-and-view.md, code-reviews.md, e2e-suite-and-gifs.md, second-build-machine.md, issues.md, connect-agents-sandboxes-forge.md, branch-sharing.md, self-hosted-grafana.md, ../rulings.md, local-dev-sync-connections.md, mac-mini-test-farm.md]
---

## Tracker reconciliation — 2026-10-20, 22:44 PDT

**What:** Keep the shared dev server stable and timeline summaries configured through the model service.

**Why:** Builders and recordings require a usable dev stack.

**Current state:** At 22:39 PDT the lead reports a clean 22:37 restart with the cheap default Cerebras summary model configured. No build errors or summary refusals followed, but no timeline summary has run during the test pause. This is a shared-server receipt, not fresh proof of the Mac mini farm. At 22:43 MacBook load remains 86; the lead asked the VibeLang session to stop its high-CPU gopls process.

**Next step:** Verify summaries with a real conversation after the pause; obtain fresh mini startup/test receipts separately and resolve resource contention.

**Open questions for Will:** None; the requested secret-output hook has no recorded approval and is not applied by this tracker.

Evidence: script-filtered human messages and lead text replies, approximately 20:44–22:44 PDT, session 6253ecf2; notifications and tool blocks excluded. Current rulings and queue answers (latest 19:38 PDT) prevail over historical briefs and designs. Product receipts are lead-reported; this tracker verifies the maintainer-site build. Execution owners and statuses retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 21:54 PDT

**What:** Keep shared development services usable without applying unfinished migrations.

**Why:** Builders need stable services and reproducible failures.

**Current state:** The shared dev server restarted cleanly at 21:51. The restart now skips migrations and leaves the database at 0028; its previous behavior applied unfinished migrations. The coding-factory owner is switching the TODO sandbox to the bundled QuickJS build.

**Next step:** Prove the sandbox in Cloudflare local runtime and collect mini startup receipts before clearing that blocker. Apply later migrations only with owner readiness.

**Open questions for Will:** None.

Evidence: script-filtered user text and lead replies from session 6253ecf2, approximately 19:54–21:54 PDT; compaction summaries, tool blocks and relayed agent messages excluded. Current rulings and queue answers take precedence over historical briefs, decisions and proposals. Execution ownership retained; reconciliation by Codex tracker curator. Product receipts are reported evidence; tracker validation is the maintainer-site build.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 20:57 PDT

**What:** Keep shared dev services and remote test environments ready for the active builders.

**Why:** Environment failures must not masquerade as feature failures or successful verification.

**Current state:** At 20:29 PDT the lead applied stable migrations through 0028: co-editing text, issue-to-TODO links and clone progress; cloning on :1337 works again. Migrations 0029–0033 were still in progress and left unapplied then. Mini installs recovered after the 20:27 lockfile repair, but the 20:57 update reports a new Node/WebAssembly startup blocker there.

**Next step:** Coordinate the factory startup fix through mac-mini-test-farm.md, then restart waiting recordings. Apply later database migrations only once their owners confirm readiness.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies from session 6253ecf2, approximately 18:57–20:57 PDT; current rulings and queue answers, decisions through 0021, proposals and shared briefs/designs. Transport details additionally use its final builder report. Product checks are reported evidence; this pass runs the maintainer-site build. Execution ownership retained.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 17:14 PDT

**What:** Keep the shared stack usable and local behavior representative of production.

**Why:** Development delays must not mask product or test failures.

**Current state:** Docker/Postgres/Electric recovered; the Mac mini farm is proven separately. At 17:13 the lead identifies persistent plain-HTTP feed connection contention delaying cross-device sync by about 40 seconds. Earlier low-priority sync scheduling helped writes but is not a full resolution.

**Next step:** Fix the newly tracked local-dev connection bottleneck and measure multi-tab sync; preserve isolated test capacity and passing recordings.

**Open questions for Will:** None.

Evidence: script-extracted human text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:13:56 UTC; queue answers through 00:06:34 UTC; current rulings, decisions, proposals and shared briefs. Queue answers supersede older design proposals. Test results are lead-reported; this tracker runs the site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 15:24 PDT

**What:** Keep the shared development stack usable and serialize disruptive restarts with the test lock.

**Why:** Disk exhaustion had stalled writes and stopped container startup.

**Current state:** At 15:17:27 the lead reported Docker starting containers, database/Electric up and repository pages loading; waiting builders were told to rerun. This supersedes the queued-restart blocker. Sandbox-tool and tab-close recordings followed.

**Next step:** Collect dependent terminal, sharing, hover-controls and spend-alert browser receipts; move heavy work to isolated Latitude lanes.

**Open questions for Will:** None.

Evidence: Will’s typed messages and lead text replies, extracted from session `6253ecf2` for its latest two hours through 15:23:55 PDT; [rulings](../rulings.md), queue answers through 14:36 PDT, shared briefs/designs and current decisions, proposals, TODOs and rules. Receipts above are reported, not fresh product tests run by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 15:14 PDT

**What:** Recover OrbStack, Postgres, Electric and the shared dev server under the shared test lock.

**Why:** Repository pages and branch sandboxes remain unavailable on the shared dev server.

**Current state:** At 15:10:02 PDT the lead says the restart will take the test lock as soon as it frees. Repository pages and branch sandboxes still do not work, and the home recording waits. No completed restart receipt appears through 15:13:56. Disk recovery alone is not service recovery.

**Next step:** Restart Docker, migrate/start the database and Electric, then restart dev with Code Storage credentials. Prove repository reads, sandbox startup and sync before dependent tests resume.

**Open questions for Will:** None.

Evidence: lead text replies through 2026-10-20 22:13:56 UTC (15:13:56 PDT), extracted from session `6253ecf2`; [rulings](../rulings.md), queue answers through 21:36 UTC, decisions, proposals, todo and rules. Reported receipts are not fresh test execution by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 15:10 PDT

**What:** Recover OrbStack, Postgres, Electric and the shared dev server under the test lock.

**Why:** Repository pages and branch terminals are blocked by host failures.

**Current state:** At 14:59 the Docker restart was still waiting on the shared test lock. The lead’s 15:08 tracker recap still calls repo view and branch terminal blocked. Free disk reached a reported 18 GiB, which alone does not prove recovery. Earlier Code Storage credential omission also remains part of the restart fix.

**Next step:** Restart with migrations and the Code Storage key; verify repo reads, a real terminal and sync before dependent browser reruns.

**Open questions for Will:** None.

Evidence: recent user text and lead replies from session `6253ecf2`, extracted through 15:10 PDT; [rulings](../rulings.md) and queue answers through 14:36 PDT. Reported completion is distinguished from a test run by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 14:55 PDT

**What:** Keep the shared database, Electric, Docker and dev server healthy for real tests.

**Why:** Tests and repository pages are blocked by host failures.

**Current state:** At 14:53 Docker cannot start containers. OrbStack → database/Electric → dev server restart is queued behind the shared lock. The 14:26 restart omitted Code Storage credentials, breaking repo pages. Budget was separately raised to 10M daily tokens at 13:13, resolving earlier message-control failures.

**Next step:** Restore the stack under the lock with migrations and the Code Storage key, then prove repository pages and terminal startup before rerunning affected tests.

**Open questions for Will:** None; the lead can settle implementation details.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: lead (smithers-b3); `restart-dev.sh` migrates the database first since 14:25 on 2026-10-20; the live GitHub tests run on a second, separate dev server (scratchpad `live/`). Until 14:30: lead (smithers-b3); from 13:13 on 2026-10-20 it also owns the shared dev server's model budget (raised to 10,000,000 tokens a day in `apps/mvp/.env`) and restarts the server only under the shared test lock (scratchpad `restart-dev.sh`). Until 13:13: lead (smithers-b3); from 11:42:48 on 2026-10-20 it resumes the agents each usage limit stops, and it offered Will a cap of about 8 agents at a time (no answer by 11:46); reopened from done at 11:46. Until 11:42: lead (smithers-b3); from 07:30:21 on 2026-10-20 full test suites wait for one shared lock (scratchpad `heavy.lock`). Until 07:30: lead (smithers-b3); written into the wiring checklist (scratchpad `final/WIRING.md`, "Dev stack hygiene") at 02:15 on 2026-10-20; compose Postgres recreated with `max_connections` 300 about 02:27; the `$TMPDIR` cleanup stays a step of each tracker tick


## What

Keep the shared local dev stack on Will's MacBook healthy while 10 or more agents run test suites at once:
- **Postgres connections:** raise the compose Postgres `max_connections` from 100 to 300 (`-c max_connections=300` in `apps/mvp/docker-compose.yml`'s `command`).
- **Disk:** at each tracker tick, delete top-level `$TMPDIR` items untouched for 60 minutes (20 minutes from 07:16 on 2026-10-20).
- **Load (from 07:30 on 2026-10-20):** full test suites run one at a time behind a shared lock, scratchpad `heavy.lock`.

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
- **07:16:03 on 2026-10-20, the lead to Will:** "The disk had dropped to 8.6 GiB. Test runs are writing about 7 GB of temp files an hour now, so I'll clear temp files untouched for 20 minutes instead of an hour. It's back to 14 GiB."
- 07:24:01, the lead: "The disk has 12 GiB free after cleanup."
- **07:30:21 on 2026-10-20, the lead to Will:** "The machine's load average hit 170 from agents running test suites at once, which made tests flaky. Full test suites now wait for a shared lock, so they run one at a time." The lock is the directory scratchpad `heavy.lock` (created 07:30, present at 07:37).
- 07:30:37, the lander: round 1's checks "ran before the machine got busy", so they need no recheck ([land to main](land-to-main.md)).
- 07:34:02, the lead: "The machine's load average is down from 170 to 32, and the disk has 14 GiB free."
- **07:44:39 on 2026-10-20, the [navigate](navigate-flow.md) agent:** ChatApi answered 503 to every question because the dev database lacked other agents' migrations, so every agent-run unit test failed. It ran `pnpm db:migrate`, which applied 0010 to 0012. The lead to Will at 07:44:43: "Without them, questions were briefly answered with errors. That's applied now." A migration an agent adds doesn't reach the shared dev database until someone runs `pnpm db:migrate`.
- 07:51:49, the lead: it removed `~/smithers/review-evidence`, an untracked symlink to a folder deleted since Sep 12, which failed `support-matrix.test.mjs` on this Mac ([site deployment test](site-deployment-test.md)).
- **About 08:15 to 10:40 on 2026-10-20: the Claude usage limit stopped the lead and every Claude agent** (the lander and seven builders) for about two and a half hours. The lead resumed all eight at 10:42 from where they stopped ([land to main](land-to-main.md)). The dev server's flow databases (`apps/mvp/.alchemy/local/…FlowExecution/*.sqlite`) kept changing until 08:36:51.
- 10:42:03, the lead: "The machine's load is low (about 5) and the disk has 14 GiB free." 10:43: `uptime` shows load averages of 32, 14 and 8 as the eight agents restart; `df -h` shows 14 GiB free (99% used). 10:43:40: the shared `heavy.lock` is held again (the client Fable fix agent's full unit run).
- 10:53:49, the lead: a tracker refresh was skipped because "20 subagents, the session's limit, are running": review round 4 and the build agents, plus their sub-agents. "The disk has 12 GiB free."
- **11:14:36, the lead:** "The disk is down to 10 GiB, mostly from the lander's temporary 4.1 GB workspace, which goes away when the landing finishes." 11:24:01: 10 GiB free ([land to main](land-to-main.md)).
- **11:19:46, the lead:** it "stopped three docs checks that had been stuck for 3 to 4 hours, each burning about 70% CPU." The cause was every Smithers CLI process taking the database's write lock every 5 seconds; the fix reads without it, and "a waiting CLI dropped from about 100% CPU to about 5%" ([docs check](docs-check-flow-outcome.md)).
- **About 11:30 on 2026-10-20: the account's weekly limit stopped the lead and every Claude agent** ("You've hit your weekly limit · resets Oct 26 at 12pm", 11:30:17), about 50 minutes after the session limit's 10:40 reset. The 11:39:52 tick hit the same limit.
- **11:41:39: Will logged in to another account** ("keep going", 11:41:41). **11:42:18, the lead:** "The weekly limit stopped every agent on the old account at about 11:30. On your new login I've resumed all nine, each from where it stopped with its work intact": landing round 2, the server, browser and two SDK sets of review fixes, and the issues, flows, branch and agent-status slices. "Each agent restarts its own stopped sub-agents."
- **About 11:35 (the lead's time; the session showed it at 11:42:19, "resets Oct 23 at 8pm"): the second account's weekly limit stopped the agents again.** Will, 11:42:36: "keep goign i used usage reset." **11:42:48, the lead:** "I resumed the five agents the second account's limit stopped: the server fixes, both SDK fix sets, the branch workspace and the tracker refresh." The lander, the chat fixes, issues, flows and agent status weren't reported stopped.
  - "We're using limits fast: about 15 agents run at once, plus their sub-agents. If you'd rather stretch this account, I can cap it at about 8 at a time and finish the review fixes and landing first." No answer by 11:46.
- The day's capacity record:

  ```
  08:15 ──── session limit ──── 10:40   every agent stopped (~2 h 25 m); 8 resumed 10:42
  11:30 ── weekly limit, account 1      every agent stopped; Will logs in to account 2 at 11:41
  ~11:35 ─ weekly limit, account 2      5 agents stopped; Will applies a usage reset; resumed 11:42:48
  ```

- 11:43: `df -h` shows 8.2 GiB free (100% used); 11:44:22, the lead: 11 GiB free; 11:46: 10 GiB free, load averages 36, 20 and 20.
- **Status moved from done to in-progress** at 11:46: the fleet hit three usage limits in three and a half hours, and the lead's cap offer waits on Will.
- 12:14 on 2026-10-20 (the lead): the shared lock (scratchpad `heavy.lock`) was taken at 12:13 and a full suite runs. If an agent dies holding it, the lead clears it so it can't block everyone. 10 GiB free at 12:03 and 12:14. No answer from Will on the agent cap by 12:14.
- 12:23:45 on 2026-10-20 (the lead): the shared lock is free again; 10 GiB free. The [agent status](agent-status.md) browser test ran from 12:16; [issues](issues.md) waits for the lock from 12:18.
- **About 12:52 on 2026-10-20:** stopping its own duplicate suite, the issues builder ran `pkill -f 'vitest run --coverage.enabled=false'`, a pattern that matches every agent's vitest run, so other agents' tests may have died around 12:52 ([issues](issues.md)). 12:54:04, the lead: "I told those agents to rerun anything that died."
- 12:54:43 (the lead): 8.5 GiB free.
- 12:53 to 12:58, `apps/mvp/test-results/`: the message controls e2e ran four times (a first try and three retries), each failing ([message controls](chat-message-controls.md)).

- 13:04:08 on 2026-10-20 (the lead): 8.0 GiB free.
- **13:06 on 2026-10-20: the lander removed its 4.1 GB `~/smithers-lander` workspace** after round 2 ([land to main](land-to-main.md)). It reported the 12:52 `pkill` killed none of its runs.
- **13:08 to 13:09:31 on 2026-10-20: the shared dev server had spent its daily model budget.** Every model call answered 429 "Today's model budget is spent": `model_budget_days` held 1,022,891 committed tokens against the 1,000,000 cap, of which 496,311 were spent. The rest were reservations of calls whose tests were killed; by design an unsettled reservation stays charged at its worst case and is final once it expires (`worker/ModelUsage.ts`: "nothing sweeps it"), so only the next UTC day starts fresh ([model endpoint](model-endpoint.md)). It blocked the [flows](flow-authoring.md) e2e and very likely caused the [message controls](chat-message-controls.md) "Couldn't answer" failures, first read as [Cerebras rate limits](cerebras-rate-limits.md).
- **13:11:42 to 13:13:19: the restart.** The lead set `MODEL_DAILY_TOKEN_BUDGET` to 10,000,000 in `apps/mvp/.env` (not committed). The first restart (13:11:42 to 13:11:48) never stopped the old server, so two dev servers ran. 13:12:01, the lead: "My script never stopped the old server, so two dev servers are now running." The fixed `restart-dev.sh` waits for `heavy.lock`, kills both process trees (13 pids at 13:13:03), checks that port 1337 is free, starts one server and waits for `/app` to answer 200; up at 13:13:19 with one listener on 1337 (scratchpad `restart-dev.log`). The repository home builder's flows e2e ran in the two-server window (13:12:05 to 13:12:56) and failed ([flow authoring](flow-authoring.md)).
- 13:13:57, the lead: "The dev server is back on its own, with a daily model budget of 10 million tokens. I've told the message-controls and branch agents to rerun their live-model tests." It saved the cause and fix as a memory. 13:15:50: the message controls e2e passed on the new server.
- 13:14:32 (the lead): 9.0 GiB free; 8.4 GiB at 13:17.
- **13:20:43 on 2026-10-20: Will offered Latitude servers.** "If you need more computing resources we have latitude servers". The lead, 13:21:12: "CPU isn't the bottleneck": the one shared test lock and the one shared checkout are. A Latitude box helps only as a second build machine with its own clone, Postgres, Electric and dev server, pushing to `main` itself, and never the two hosts running production sandbox workers or nyc-01. Waiting on Will to name one ([second build machine](second-build-machine.md)).
- 13:22:27: the lead rewrote the builder rules (scratchpad `final/BUILD-COMMON.md`): the heavy lock before any full suite, e2e or `docs:check`; never `pkill` or `killall` by pattern; the shared dev server restarts only through the lead; no git; no clones or large toolchains; about 9 GiB free.
- 13:22:43 to 13:23:25: six more agents started (evals, secrets, spend alerts, notifications, Panel T with a Codex Sol member, the 0012 docs agent), on top of the triage, branch workspace, home view and SDK builders. 13:23:36: the lead checked the lock's age and cleaned stale temp items. **13:23:56: 8.6 GiB free.**
- 13:34 (the lead): 9.0 GiB free. 13:43: 8.9 GiB, and nothing held the test lock.
- **13:54, the lead:** "Load peaked at about 130 from many parallel test runs and the commit round's dependency install, then settled. Nothing ran away."
- **13:59: the session hit its cap of 20 agents at once** when the queue's curator started; the lead stopped that round's tracker refresh to make room ([Will's decision queue](will-decision-queue.md)).
- **14:03: 6.0 GiB free**, because the lander installed dependencies in `~/smithers-lander` (its `node_modules` at 13:55) for landing round 3 ([land to main](land-to-main.md)). 14:04: 6.2 GiB. The lead's line (12:34): below 6 GiB, clear older material from finished sessions. The Go half of `pnpm docs:check` refuses below 5 GiB ([disk space](disk-space.md)).
- 14:02: `heavy.lock` was taken, and round 3's per-package type checks and unit run (scratchpad `r3/`) ran from about 14:02, still going at 14:06.
- **14:07:58 on 2026-10-20: the fleet-cap question is gone.** The curator dropped "cap the agents at 8" from the queue because "ship faster" answered it.
- 14:12:55: the live GitHub test agent runs on its own dev server (scratchpad `live/start-live-dev.sh`, `dev-live.log`), "so the other agents' tests aren't affected".
- **14:12: the shared dev server went down**: a new import was missing from `package.json` (the lead, 14:25:28: "It's restarting, and I told that agent to add the missing dependency").
- **About 14:15: the session usage limit stopped 13 agents** (home view, sync bug, triage, TODOs Track A, spend alerts, queue UI, agent in the sandbox, repo-view split, branch sharing, live GitHub tests, agent evals, Playground, notifications). 14:18:28, Will: "keep going". The lead resumed all 13 at 14:19.
- **14:16:52, Will:** "we should be running more stuff on latitude servers and freeing up unused worktrees and disk space please have an agent find safe disk space on this machine to free" ([disk space](disk-space.md), [second build machine](second-build-machine.md)).
- 14:24: the Playground paused to free an agent slot ([Playground](smithers-playground.md)).
- **14:26:05 to 14:26:25: the shared dev stack migrated and restarted** (scratchpad `restart-dev.log`): `db:migrate` applied `18_triage, 19_spend_alerts, 20_notifications, 21_secrets, 22_todos, 23_branch_sharing, 24_sandbox_calls`; 7 old processes killed; up after 10 s. It also loads [branch sharing](branch-sharing.md)'s `RoomObject`. 14:27:52, the lead: "The dev server was migrated and restarted at 14:26 and is answering again."
- 14:30: 6.4 GiB free on the MacBook.

## Next

From 14:30 on 2026-10-20: keep one slot free under the 20-agent cap; restart the shared dev server only under the shared test lock and only through `restart-dev.sh`, which migrates first; with free disk near 6 GiB, act on Will's 14:16 disk request before the next fan-out ([disk space](disk-space.md)).

Until 14:30 on 2026-10-20 the next step was, from 14:04 on 2026-10-20: as below, plus: with free disk at the 6 GiB line, run the cleanup recipe before the next fan-out or full suite; the lander's `~/smithers-lander` dependencies go once round 3 lands. Keep one slot free under the 20-agent cap, since the tracker tick is the first one stopped.

Until 14:04 on 2026-10-20 the next step was, from 13:13 on 2026-10-20: as below, plus: restart the dev server only through `restart-dev.sh` (under `heavy.lock`, both trees killed, port checked); when a live-model e2e fails, read the 429's body first, since our own budget and a provider limit both answer 429; and check `model_budget_days` before a fan-out of live-model tests, because killed runs keep their reservations until midnight UTC.

Until 13:13 on 2026-10-20 the next step was, from 12:54 on 2026-10-20: as below, and every brief says to stop a test run by its own pid, never with `pkill -f` on a shared pattern (the 12:52 kill).

Until 12:54 on 2026-10-20 the next step was, from 11:42 on 2026-10-20: Will answers the cap offer. Until then the lead resumes every agent a usage limit stops, from where it stopped, and each parent restarts its own sub-agents. With a cap, the review fixes and landing round 2 go first. The rest stands: run `pnpm db:migrate` when an agent adds a migration; every full suite takes `heavy.lock`; clear `$TMPDIR` files untouched for 20 minutes at each tracker tick; check `df -h /` and the load before fanning out more than 5 agents; restart the dev server with a clean `.vite` cache before Will tests. The lander's 4.1 GB workspace returns once round 2 lands.

Until 11:42 on 2026-10-20 the next step was, from 07:44 on 2026-10-20: run `pnpm db:migrate` on the dev database whenever an agent adds a migration, before e2e runs or Will tests. Every full test suite takes the shared lock (scratchpad `heavy.lock`) first; clear `$TMPDIR` files untouched for 20 minutes at each tracker tick; check `df -h /` and the load average before fanning out more than 5 agents; restart the dev server with a clean `.vite` cache (scratchpad `wiring/dev.sh`) before Will tests.

Until 07:44 on 2026-10-20 the next step was, from 07:30 on 2026-10-20: every full test suite takes the shared lock (scratchpad `heavy.lock`) first; clear `$TMPDIR` files untouched for 20 minutes at each tracker tick; check `df -h /` and the load average before fanning out more than 5 agents; restart the dev server with a clean `.vite` cache (scratchpad `wiring/dev.sh`) before Will tests.

Until 07:30 on 2026-10-20 the next step was, from 07:16 on 2026-10-20: clear `$TMPDIR` files untouched for 20 minutes, not 60, at each tracker tick; check `df -h /` before fanning out more than 5 agents; restart the dev server with a clean `.vite` cache (scratchpad `wiring/dev.sh`) before Will tests and after any agent changes a package the app pre-bundles.

Until 07:16 on 2026-10-20 the next step was: Restart the dev server with a clean `.vite` cache (scratchpad `wiring/dev.sh`) before Will tests, and after any agent changes a package the app pre-bundles. Reopen if "Outdated Optimize Dep" shows after such a restart. Keep the 60-minute `$TMPDIR` cleanup at each tracker tick, and check `df -h /` before fanning out more than 5 agents.

Until about 02:58 on 2026-10-20 the next step was: none open. Keep the 60-minute `$TMPDIR` cleanup at each tracker tick, and check `df -h /` before fanning out more than 5 agents. Reopen if a full run fails with SQLSTATE 53300 again or the disk drops below 5 GiB.

Until about 02:27 on 2026-10-20 the next step was: raise `max_connections` to 300 and restart the compose Postgres once no agent runs tests. Then rerun the reds that carry 53300 to confirm they pass in the crowd. Keep the 60-minute `$TMPDIR` cleanup at every tracker tick, and check `df -h /` before fanning out more than 5 agents.

## Questions for Will

None. The fleet cap question was dropped at 14:07:58 on 2026-10-20 ("ship faster" answered it).

Until 14:30:

- **Cap the fleet at about 8 agents at a time** to stretch the second account, finishing the review fixes and landing first? The lead offered it at 11:42:48 on 2026-10-20; about 15 agents run now, plus their sub-agents. No recommendation is on record. ([Decisions for Will](decisions-for-will.md), row 8.)

Until 11:42 on 2026-10-20 this section read: None. Open for the lead: should `max_connections=300` land in `docker-compose.yml` for everyone, or stay a local setting? Best guess: land it, since any contributor who runs the suites in parallel hits the same limit. (Answered about 02:27 on 2026-10-20: it is in `docker-compose.yml`, so it reaches everyone when committed.)
