---
title: A second build machine on a Latitude server
status: done
area: infra
owner: Latitude coordinator; lead coordinates test capacity
updated: 2026-10-20
links: [dev-stack-hygiene.md, land-to-main.md, decisions-for-will.md, disk-space.md, e2e-suite-and-gifs.md, self-hosted-grafana.md, cloudflare-flow-host.md, flows-root-platform-neutral.md, review-round-4-p3-cleanup.md, will-decision-queue.md, ../rulings.md]
---

## Current specification — 2026-10-20, 18:26 PDT

**What:** Provide independent test capacity on the mini and heavy SDK lanes on Latitude.

**Why:** Free the MacBook from long test and implementation contention.

**Current state:** Mini farm passed its comparative runs earlier. At 18:21 the lead reports Latitude lanes finished: 15 fixes landed, two were already fixed and one stopped for a model-host persistence design decision. Provisioning/lane round is done; unresolved design work stays separate.

**Next step:** Use existing capacity; retain landed-fix receipts and track durable model-host persistence in host-agnostic-flows.md.

**Open questions for Will:** None for compute access.

Evidence: latest two session hours extracted by script as human text/lead replies; queue answers through 2026-10-21 01:24:15 UTC, current rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Latest rulings override historical proposals. Product results are reported receipts; this pass verifies the maintainer-site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 16:44 PDT

**What:** Use Latitude for heavy SDK lanes and the Mac mini for independent test capacity.

**Why:** Reduce MacBook contention using Will’s authorized compute.

**Current state:** The mini farm was reported up at 16:41; see mac-mini-test-farm.md. The latest Latitude lane report still says two jobs found fixes already present and formatting remained running; there is no new formatting completion receipt.

**Next step:** Collect the outstanding Latitude checks and landing receipts; use the mini farm for eligible suites now.

**Open questions for Will:** None; both locations are authorized.

Evidence: user-typed text and lead text replies extracted by script for 21:43–23:43 UTC from session 6253ecf2; rulings and queue answers override older briefs. Product receipts above are reported by the lead; this tracker ran only the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 15:54 PDT

**What:** Use Latitude for SDK lanes and additional build capacity.

**Why:** Reduce MacBook contention while preserving production capacity.

**Current state:** At 15:34 PDT the lead reported two of three SDK lanes found their fixes already present and changed nothing; formatting remains running. At 15:52 a separate Mac mini test-farm setup was started.

**Next step:** Collect coordinator completion receipts for formatting and any observability lane; validate the separate Mac mini farm before moving suites.

**Open questions for Will:** None: Will already authorized Latitude use. The Mac mini work is tracked separately.

Evidence: lead text replies extracted from the latest two hours of session 6253ecf2; current rulings and queue answers take precedence over older briefs. No product tests rerun by this tracker.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 15:35 PDT

**What:** Run heavy SDK jobs in isolated Latitude lanes while preserving production sandbox capacity.

**Why:** Will authorized server use and requested less local compute/disk pressure.

**Current state:** At 15:34 PDT the lead reported that two of three Latitude Codex jobs found their defects already fixed and changed nothing. The formatting job remains running. This is not a receipt that every remote lane or Grafana setup is complete.

**Next step:** Collect formatting checks and landing receipts; avoid duplicate SDK fixes and retain the separate Grafana verification workstream.

**Open questions for Will:** None; server use is authorized.

Evidence: last two hours of user-typed messages and lead text replies extracted from session `6253ecf2` through 15:34 PDT; queue answers through 14:36 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Completion receipts are reported evidence; this tracker ran no product tests. Older briefs yield to later rulings.

## Earlier tracker history

## Current specification — 2026-10-20, 14:55 PDT

**What:** Use isolated remote lanes for SDK work and observability.

**Why:** Will authorized the servers and asked to free local compute/disk.

**Current state:** The coordinator restarted on a working account at 14:23. At 14:37 the lead checked duplication: sandbox fix is already on main and is skipped; the Cloudflare child-flow fix is not on main or this Mac, so remains remote work. Earlier duplicate-work warning is superseded.

**Next step:** Collect per-lane test/landing receipts for child flows, SDK follow-ups and Grafana; preserve production capacity and lane limits.

**Open questions for Will:** None; the lead can settle implementation details.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: Codex Sol SDK coordinator on msb-lat-nyc-01 (user `lane`, account `codex-tevm`), briefed by the lead at 14:20 on 2026-10-20 (scratchpad `final/SERVER-LANES-BRIEF.md`), first started about 14:12 and restarted 14:20 to 14:23; up to 3 lanes at once; report in `~/lanes/sdk20/REPORT.md` on the server. Until 14:30: lead (smithers-b3); waiting on Will to name a server since 13:21:12 on 2026-10-20


## What

A Latitude server set up as a second machine for building the app: its own clone of the repository, its own Postgres, Electric and dev server, and agents that push to `main` themselves. It takes features that today wait on this Mac's shared checkout.

```
MacBook (today)                        Latitude box (proposed)
one checkout, ~10 builders             own clone
one heavy.lock: suites + e2e queue     own Postgres, Electric, dev server
one dev server :1337                   own test queue
lander commits rounds to main   <-->   pushes its own changes to main
```

It must never be one of the two Latitude hosts running production sandbox workers, or nyc-01, the benchmark rig.

## Why

13:20:43 on 2026-10-20, Will: "Can any of those not started get started in parallel now? If you need more computing resources we have latitude servers".

The lead, 13:21:12: "CPU isn't the bottleneck." Two things are:

- **One shared test lock:** every agent's full suite and browser tests run one at a time on this Mac (scratchpad `heavy.lock`).
- **One shared checkout:** each extra builder in it delays the app's next commit round ([land to main](land-to-main.md)).

"Agents there would skip the test-lock queue."

## State

- 13:21:12 on 2026-10-20, the lead to Will: "If you name a Latitude server that isn't running production, I'll set it up as a second build machine for the features that are waiting." The waiting features: the PR list, review, merge and branch resync (after [triage](issue-triage.md)); branch sharing, branch sandboxes and connecting the agent to sandboxes (after the [branch terminal](branch-terminal.md) slice); the agent navigating the repository view (after the [home view](repository-declared-home.md)).
- 13:21:41: Will answered the start question ("start the ones that can start now") without naming a server.
- Not started. No server named by 13:24.
- **14:09:17 on 2026-10-20, Will (queue):** "The servers are yours to do whatever you want". **Status moved from blocked to in-progress.**
- **14:12:55, the lead to Will:** "a Codex Sol coordinator is now running on msb-lat-nyc-01. It runs separate Codex lanes for three SDK jobs, each pushing to `main` once its checks pass". It stays inside the server's lane limits, so the production sandbox workers (msb) keep their capacity. The 13:21 line ("never one of the hosts running production sandbox workers, or nyc-01") gave way to Will's 14:09 answer.
- **14:16:52, Will:** "we should be running more stuff on latitude servers and freeing up unused worktrees and disk space please have an agent find safe disk space on this machine to free" ([disk space](disk-space.md)).
- **14:20 to 14:23: the coordinator restarted on `codex-tevm`**, "the one account that accepts Sol on this server" (`codex-proton` rejects Sol, `codex-4` answers 401), with two more jobs (the lead, 14:23:49). The brief's five tasks, each verified still open on `main@origin` first:
  - (a) child flows and trampoline handoffs on Cloudflare ([Cloudflare flow host](cloudflare-flow-host.md));
  - (b) `@smthrs/sandbox`'s `execHandles` behind a host service ([flows root platform-neutral](flows-root-platform-neutral.md));
  - (c) `dprint fmt` on `@smthrs/agent` and `@smthrs/effect-code-storage`, only after round 3 is on `main`;
  - (d) review round 4's SDK-only P3 findings ([P3 cleanup](review-round-4-p3-cleanup.md));
  - (e) self-hosted Grafana ([self-hosted Grafana](self-hosted-grafana.md)).
- Hard rules: jj only, a short-lived workspace per task, never touch msb services or cgroups, keep 100 GB free, no deploys, never edit `apps/mvp`, `apps/playground` or `apps/maintainer-site`.
- **Risk for the lead:** this tracker records (a) and (b) as fixed on the MacBook (child flows at 00:21, `execHandles` at 02:26 on 2026-10-20). If either fix is still uncommitted here, the lane finds it open on `main@origin` and fixes it a second time, which collides with round 3 ([land to main](land-to-main.md)).
- No report by 14:30.

## Next

From 14:30 on 2026-10-20: the coordinator's `REPORT.md`: each task's `main` SHA or the reason it stopped. Before (a) and (b) land, check whether the MacBook's earlier fixes are already on `main` or in round 3. Then decide which waiting app feature, if any, moves to this server with its own Postgres, Electric and dev server.

Until 14:30 on 2026-10-20 the next step was, from 13:21 on 2026-10-20: Will names a server. Then the lead clones the repository there, starts Postgres, Electric and a dev server, checks disk and the jj setup, and moves one waiting feature to it. Work that lands from both machines still lands on `main` only.

## Questions for Will

None. Answered 14:09:17 on 2026-10-20: "The servers are yours to do whatever you want".

Until 14:30:

- Which Latitude server may become a second build machine? It must not run production sandbox workers or the nyc-01 benchmarks. (Asked 13:21:12 on 2026-10-20.)
