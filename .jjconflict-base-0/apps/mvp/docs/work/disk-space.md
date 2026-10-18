---
title: Free disk on the MacBook for the agent fleet
status: done
area: infra
owner: lead (smithers-b3); freed by 00:24 on 2026-10-20, then again by 00:31 (16 GiB, still 16 GiB at 00:37); recipe in memory
updated: 2026-10-20
links: [dev-stack-hygiene.md, flows-root-platform-neutral.md, cloudflare-flow-host.md, integrations-effect-httpclient.md, flows-and-agent.md, agent-ui-rendering.md, sdk-test-reds.md, b1-follow-ups.md]
---

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

## Next

From about 02:15 on 2026-10-20: the recurring cleanup lives in [dev stack hygiene](dev-stack-hygiene.md). This item stays done.

Until about 02:15 on 2026-10-20 the next step was: check `df -h /` before fanning out more than 5 agents, and run the recipe below 5 GiB. Rerun the Go half of `pnpm docs:check` for the work that skipped it: F1, the child-flow fix, the `HttpClient` move and V1+V2. The 00:28 full run passed on the tree as it stood then, which covers the first three; V1+V2 hasn't reported.

## Questions for Will

None.
