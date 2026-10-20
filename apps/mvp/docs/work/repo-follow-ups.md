---
title: "Repo follow-ups: the import switch, the spend alert, the chat embed, large-fixture benchmarks"
status: todo
area: app
owner: unassigned; listed as "not built" by the R3 to R5 agent's report (by 02:35 on 2026-10-20)
updated: 2026-10-20
links: [repo-clone-and-view.md, code-storage-spend-caps.md, token-spend-alerts.md, agent-ui-rendering.md, benchmarks.md, decisions-for-will.md, ../decisions/0006-repo-clone-and-view.md, ../todo.md]
---

## What

Four parts of decision 0006 that R3 to R5 didn't build ([repo clone and view](repo-clone-and-view.md)):

```
item                         what it is                                         waits on
repo/SetImports {paused}     the operator switch: pauses new clone admissions;  nothing; CLI-only until roles
                             running imports finish and reads go on              gate a route
spend alert delivery         the 50/80/100% Code Storage alerts reach Will;      Will's channel answer
                             today they are a `repo.spend.alert` error line      (Telegram, email or other)
                             and the `repo_spend_alerts` counter
chat embed                   0004's `repo` template: RepoView inline in a        V3, the app's view
                             message, full at /app/views/$viewId                 template registry
large-fixture benchmarks     the bench's `repo` suite reads only               a large public repository
                             octocat/Spoon-Knife's tree and README               to mirror; Code Storage budget
```

## Why

Decision 0006's "Capacity and spend" section promises the operator switch and the alerts; Will asked that Code Storage "fail gracefully if we reach capcity". Will asked that the repo view be "an embedded app". `apps/mvp/AGENTS.md`: every feature lands with its benchmarks, and Will wants benchmarks "that can be run locally and also on live".

## State

- By 02:35 on 2026-10-20: the R3 to R5 agent reported these four as not built.
- **Spend alerts:** `worker/RepoMetrics.ts`' `recordSpend` raises a `repo.spend.alert` error line and counts `repo_spend_alerts` once a month per threshold. Its comment: "Delivering the alert to Will is the token-spend alert's channel (docs/todo.md), which reads this line." The channel is still an open question for Will ([token-spend alerts](token-spend-alerts.md)).
- **`repo/SetImports`:** no file in `worker/` or `src/` names it.
- **Chat embed:** waits for V3, the app half of [agent UI](agent-ui-rendering.md).
- Not assigned.

## Next

Best guess, in this order:
1. `repo/SetImports`, test first: a paused switch refuses a new clone as `capacity` and leaves a running import to finish.
2. The large-fixture bench case: pick a public repository near the 1 GB per-repository cap, mirror it once, and record tree and blob read times cold and from `ImmutableCache`.
3. The alert delivery, once Will names the channel ([token-spend alerts](token-spend-alerts.md)).
4. The chat embed, after V3 ([agent UI](agent-ui-rendering.md)).

## Questions for Will

- Where should the token-spend and Code Storage alerts reach you: Telegram, email or other? (Open since 2026-10-19 on [decisions for Will](decisions-for-will.md).)
