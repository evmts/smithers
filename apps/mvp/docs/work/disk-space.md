---
title: Free disk on the MacBook for the agent fleet
status: done
area: infra
owner: cleanup coordinator; lead owns deferred maintenance
updated: 2026-10-20
links: [dev-stack-hygiene.md, flows-root-platform-neutral.md, cloudflare-flow-host.md, integrations-effect-httpclient.md, flows-and-agent.md, agent-ui-rendering.md, sdk-test-reds.md, b1-follow-ups.md, second-build-machine.md, ../rulings.md]
---

## Current specification — 2026-10-20, 16:24 PDT

**What:** Free safely rebuildable local disk and archive inactive artifacts on Latitude.

**Why:** Disk exhaustion stopped database writes and container startup.

**Current state:** At 16:20:09 PDT the lead confirmed 52 GiB free after the other session archived 10.4 GiB of old test artifacts to nyc-01, checksum-verified, and left ~/smithers/.artifacts/ARCHIVED.txt. The prior safe cleanup is done. This completes the artifact-transfer wait recorded below; deferred jj operation-history pruning has no completion receipt.

**Next step:** Maintain capacity; coordinate any deferred jj history maintenance after landing and with active workspace users.

**Open questions for Will:** The existing larger-deletion queue question remains unanswered; the archive receipt does not authorize other deletions.

Evidence: lead text replies extracted by script from session 6253ecf2, latest two hours through 23:23:40 UTC; current rulings and queue answers govern. Shared briefs/designs, decisions, proposals, TODOs and rules were consulted. Reported product receipts only; this tracker ran no product tests.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 15:35 PDT

**What:** Free safely rebuildable, idle local disk and move heavy work to Latitude.

**Why:** Will requested safe cleanup; local disk exhaustion blocked development.

**Current state:** The safe cleanup pass finished at 15:23 PDT with 43 GiB free, up from 1.5 GiB: old builds, dependencies in 54 idle folders, seven clean idle jj workspaces and caches. Deferred operation-history pruning and artifact movement are not completed by this receipt. Larger deletions remain a separate priority-500 queue question.

**Next step:** Maintain recovered capacity; collect artifact-transfer receipts and perform deferred jj maintenance only after landing and coordination with active users.

**Open questions for Will:** Choose which larger remaining items may be deleted in the existing queue question; no answer is recorded.

Evidence: last two hours of user-typed messages and lead text replies extracted from session `6253ecf2` through 15:34 PDT; queue answers through 14:36 PDT; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Completion receipts are reported evidence; this tracker ran no product tests. Older briefs yield to later rulings.

## Earlier tracker history

## Current specification — 2026-10-20, 15:24 PDT

**What:** Recover safe disk space and move heavy work/artifacts to Latitude.

**Why:** Will requested more server work and safe local cleanup; low disk stopped the local stack.

**Current state:** At 15:23:16 the lead reported 43 GiB free, up from 1.5 GiB, exceeding the 40 GiB target: rebuildable outputs, dependencies in 54 idle folders, seven clean idle jj workspaces and caches. Another session freed about 5 GB of caches and planned an 11 GB artifact archive on nyc-01. Proposed operation-history pruning is deferred until after landing with no active workspace users; it is not complete.

**Next step:** Keep recovered capacity stable. Coordinate artifact movement and any deferred jj maintenance after the commit round; do not treat the additional queued deletions as authorized.

**Open questions for Will:** A priority-500 queue question asks about the larger remaining deletions, including Go module cache, old Desktop folders and microsandbox data.

Evidence: Will’s typed messages and lead text replies, extracted from session `6253ecf2` for its latest two hours through 15:23:55 PDT; [rulings](../rulings.md), queue answers through 14:36 PDT, shared briefs/designs and current decisions, proposals, TODOs and rules. Receipts above are reported, not fresh product tests run by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 15:14 PDT

**What:** Recover safe local disk space while moving heavy work to Latitude.

**Why:** Low disk stalled database writes and container startup; HOST-6 to HOST-8 require remote heavy work and no local backups.

**Current state:** At 15:13:56 PDT the lead reports 21 GiB free, up from the earlier 18 GiB. Cleanup remains in progress toward 40 GiB. This is a dated report, not a new measurement or proof that Docker recovered.

**Next step:** Finish safe cleanup, preserve active sources/data and collect recovery receipts for Postgres and containers.

**Open questions for Will:** None.

Evidence: lead text replies through 2026-10-20 22:13:56 UTC (15:13:56 PDT), extracted from session `6253ecf2`; [rulings](../rulings.md), queue answers through 21:36 UTC, decisions, proposals, todo and rules. Reported receipts are not fresh test execution by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 15:10 PDT

**What:** Recover safe disk space and move heavy work to Latitude.

**Why:** HOST-6 to HOST-8; low disk blocked database writes and container starts.

**Current state:** The lead reported 15 GiB free at 14:55 and 18 GiB at 15:08, after about 2 GiB at the low point. Cleanup continues toward 40 GiB. These are dated reports, not a fresh measurement. Docker recovery still has no completion receipt.

**Next step:** Complete safe cleanup, preserve active work/data, collect the cleanup receipt and prove database/container recovery.

**Open questions for Will:** None.

Evidence: recent user text and lead replies from session `6253ecf2`, extracted through 15:10 PDT; [rulings](../rulings.md) and queue answers through 14:36 PDT. Reported completion is distinguished from a test run by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 14:55 PDT

**What:** Recover safe local disk space and move heavy work to Latitude.

**Why:** Low disk stalled database writes and container starts.

**Current state:** The lead reports about 2 GiB free at 14:46, 6 GiB after roughly 4 GiB cleanup at 14:50 (pnpm prune yielded 1.9 GB), and 14 GiB at 14:54. Cleanup continues toward 40 GiB. These are time-specific reports, not current measurements.

**Next step:** Finish safe cleanup, report deleted categories and recovered space, and confirm Postgres/Docker recovery; preserve active work and data.

**Open questions for Will:** None; the lead can settle implementation details.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: lead (smithers-b3), on Will's 14:16:52 request on 2026-10-20 for an agent to find safe disk space to free; a home-folder survey on disk at 14:20; no agent report by 14:30. Until 14:16: lead (smithers-b3); freed by 00:24 on 2026-10-20, then again by 00:31 (16 GiB); recipe in memory. Until 14:30: lead (smithers-b3); freed by 00:24 on 2026-10-20, then again by 00:31 (16 GiB, still 16 GiB at 00:37); recipe in memory


## What

Keep enough free disk on Will's MacBook for the agents' checks. The Go half of `pnpm docs:check` refuses to run below 5 GiB free.

## Why

At about 00:15 on 2026-10-20, free disk fell to 1.4 GiB while about 10 agents ran. Every agent's `pnpm docs:check` stopped on the low-disk guard, so work reported done without that check.

## State

- 00:09 to 00:15 on 2026-10-20: V1+V2's `pnpm docs:check` refused with 3 GiB free ([agent UI](agent-ui-rendering.md)). F1 (3.6 GiB), the child-flow agent (4.5 GiB) and the integrations agent (4 GiB) later reported that the Go half of `pnpm docs:check` was skipped for the same guard ([flows and the agent](flows-and-agent.md), [Cloudflare flow host](cloudflare-flow-host.md), [Effect HttpClient](integrations-effect-httpclient.md)).
- By 00:24: **freed to 8.5 GiB.** The lead deleted about 11 GB of `node_modules` directories from dead sessions' scratch folders under `/private/tmp/claude-501`, and about 2 GB of unused Docker cache volumes. No source, logs or workspaces were deleted. The lead told Will at 00:24.
- By 00:31: **16 GiB free** (`df -h /`). The memory records a second pass: `$TMPDIR` held 15 GB, mostly test temp folders and compile caches, and deleting its top-level items untouched for 2 hours freed 10 GB without touching running tests.
- **The recipe**, in memory as `gotcha_disk_dead_session_scratch_node_modules_20261020.md`:
  - Confirm a session is dead: no `~/.claude/sessions/*.json` references it.
  - Delete only the `node_modules` directories under its scratchpad. Keep sources, logs and workspaces.
  - Prune anonymous Docker volumes, and remove named cache volumes by name.
  - Delete `$TMPDIR` top-level items untouched for 2 hours.
  - Leave alone: `smithers-astra-file-mode-*` volumes, `ws-*` workspace copies, and a running browser's caches.
- 00:28: **the full `pnpm docs:check` ran again**, Go half included (`go run ./packages/backend/modelprice/cmd/generate -check`), and passed every package with "50 published package tarballs passed" (scratchpad `docs-check.log`). Which agent ran it isn't on record.
- 00:30: the lead told Will: "I also freed more disk: 10 GB of test temp folders untouched for over two hours. Free space is now 16 GiB."
- 00:37: `df -h /` shows **16 GiB free** (43% used) with 10 agents running.

- About 02:15 on 2026-10-20: the disk was down to 3.3 GiB free again. The lead cleared old test temp folders and it went back to 11 GiB ("I'll repeat that at each tracker tick"). The fix agent for review 3's findings 1 and 4 reported that the Go half of `pnpm docs:check` refused to start at 4.7 GiB. `$TMPDIR` grows about 8 GB an hour with this fleet, so the threshold is now 60 minutes at every tracker tick, not 2 hours. That routine, and the Postgres connection limit, are tracked in [dev stack hygiene](dev-stack-hygiene.md).
- 02:24: `df -h /` shows 11 GiB free.
- 14:03 on 2026-10-20: 6.0 GiB free, after the lander's dependency install for round 3 ([dev stack hygiene](dev-stack-hygiene.md)).
- **14:16:52, Will:** "we should be running more stuff on latitude servers and freeing up unused worktrees and disk space please have an agent find safe disk space on this machine to free". **Status moved from done to in-progress.**
- 14:19 to 14:20, on disk: scratchpad `disk/home_top.txt`, a size survey of the home folder. Largest entries: `~/plue` (about 25 GiB), `~/smithers-lanes` (about 23 GiB), `~/Smithers-Ops` (about 20 GiB), `~/.smithers` (about 19 GiB), `~/zevm` (about 16 GiB). No cleanup report by 14:30.
- 14:30: `df -h /` shows 6.4 GiB free.

## Next

From 14:30 on 2026-10-20: a cleanup report: what is safe to delete (finished sessions' scratch `node_modules`, `$TMPDIR` test folders over an hour old, unused jj workspaces and lane checkouts, Docker caches), what was freed, and nothing in use touched. Heavy work moves to the [Latitude server](second-build-machine.md) where it can.

Until 14:30 on 2026-10-20 the next step was, from about 02:15 on 2026-10-20: the recurring cleanup lives in [dev stack hygiene](dev-stack-hygiene.md). This item stays done.

Until about 02:15 on 2026-10-20 the next step was: check `df -h /` before fanning out more than 5 agents, and run the recipe below 5 GiB. Rerun the Go half of `pnpm docs:check` for the work that skipped it: F1, the child-flow fix, the `HttpClient` move and V1+V2. The 00:28 full run passed on the tree as it stood then, which covers the first three; V1+V2 hasn't reported.

## Questions for Will

None.
