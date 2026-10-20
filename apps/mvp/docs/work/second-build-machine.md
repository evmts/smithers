---
title: A second build machine on a Latitude server
status: blocked
area: infra
owner: lead (smithers-b3); waiting on Will to name a server since 13:21:12 on 2026-10-20
updated: 2026-10-20
links: [dev-stack-hygiene.md, land-to-main.md, decisions-for-will.md, disk-space.md, e2e-suite-and-gifs.md]
---

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

## Next

From 13:21 on 2026-10-20: Will names a server. Then the lead clones the repository there, starts Postgres, Electric and a dev server, checks disk and the jj setup, and moves one waiting feature to it. Work that lands from both machines still lands on `main` only.

## Questions for Will

- Which Latitude server may become a second build machine? It must not run production sandbox workers or the nyc-01 benchmarks. (Asked 13:21:12 on 2026-10-20.)
