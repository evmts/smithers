---
title: Branch sandboxes (feature 5)
status: todo
area: infra
owner: Panel S (Opus lead, Sol)
updated: 2026-10-19
links: [../decisions/0005-sandboxes-secrets-and-the-forge.md, ../todo.md, sandbox-budgets.md, ../decisions/0007-roles-and-tags.md, ../decisions/0002-local-first.md, design-questions.md, ../decisions/0011-the-agent-runs-in-the-browser.md, connect-agents-sandboxes-forge.md, model-endpoint.md, token-spend-alerts.md]
---

## What

One sandbox per branch on Cloudflare Containers, one Durable Object each; main's follows main. The branch holds the truth: commits and checkpoints in Code Storage, live Yjs edits and the flow journal in Postgres, a container snapshot only as a warm cache. Every sandbox operation is a durable flow. Jobs on main run in throwaway sandboxes. Multiplayer branches work online only; a single-writer branch also works offline.

Since 22:42 (0005 Q2) a sandbox is only a tool provider: it exposes the machine and its tools (exec, files, jobs, previews) as durable flow steps and knows nothing about agents. The agent binds those tools from its own host ([connecting it all](connect-agents-sandboxes-forge.md)).

## Why

Will: "We need to be able to run most git repos in most sandboxes. I think freestyle supports this so our baseline is using freestyle but look at cloudflare. If cloudflare sandboxes support it natively we will jsut use cloudflare." "These sandboxes should be durable restartable."

## State

- Decision 0005 is proposed. Cloudflare and Freestyle tied at 405 of 500, and Will's "use Cloudflare if native" rule broke the tie. Freestyle stays the fallback behind `Sandbox.Provider`.
- Freestyle wins on Docker and persistent disk but costs about twice as much ($0.13 against $0.06 per awake hour).
- On shutdown Cloudflare allows up to 15 minutes to checkpoint; only an unannounced kill loses edits.
- 21:21 on 2026-10-19: the lead asked Will to accept the recommended answers below in one batch ([design questions](design-questions.md)). No answer yet.
- 22:31 on 2026-10-19: under decision 0011's `flows.local-first-placement`, sandboxes are remote because they need a machine to run code on.
- 22:35: design question 6 of 14 (0005 Q1) asked: is losing running processes on sleep acceptable, given files are always safe, so we can use Cloudflare sandboxes? Cloudflare costs about $14 per branch-month; Freestyle about twice that, and it keeps memory and disk. No answer at 22:36.
- 22:38: Will: "Why would it sleep if running process is happenintg?" The lead: it doesn't; our code renews the idle timer while any job runs. Processes are lost only to leftovers after idle, or a Cloudflare restart with up to 15 minutes' warning, after which the job resumes as a durable flow.
- 22:41: **0005 Q1 answered: Cloudflare.** Will: "So it's durable so sleeping shouldn't cause issues also couldn't we manually kick the container on the backend to stop it from sleeping or something?" Recorded in 0005: sleep is our own decision (`sandbox/Keep`), taken only after 15 minutes with no activity and no running job; Cloudflare's 30-minute inactivity timeout is a backstop we keep re-arming. 0005 stays proposed until Q2 and Q3 are answered.
- 22:41: Q2 asked: the agent's loop stays in the browser and only its tools run in the sandbox.

- 22:42: **0005 Q2 answered yes.** Will: "This is a great question! So we want the sandbox to only expose the sandbox and it's tool and the agent to be independent of that. We want as modular/durable an architecture as possible." Recorded in 0005: the sandbox is a tool provider, the agent runs on its own host (the browser, per 0011) and binds its tools, and either side can change without the other.
- 22:43: **Q3 asked** (question 8 of 14), with each limit as an admin setting changeable without a deploy, like the model roles ([model endpoint](model-endpoint.md)):

  | Limit | Recommended | At the limit |
  |---|---|---|
  | Awake sandboxes, whole deployment | 20 | a new one waits for a slot, shown as "Waiting for a sandbox" |
  | Awake sandboxes per person | 2 | same |
  | Sandbox spend alert | $100/month | alert to Will, beside the model-spend alert ([token-spend alerts](token-spend-alerts.md)) |
  | Snapshots kept | branches touched in the last 30 days | older branches restart from main's snapshot plus their commits |

  The lead's cost basis: about $14 per branch-month for a sandbox that stays busy; with zero users the risk is a runaway agent or a forgotten branch. No answer at 22:46. 0005 stays proposed until it is answered.

- 22:45: **Q3 deferred until we ship.** Will: "Add this as a TODO but we won't worry about this until we ship." Recorded in 0005 under Q3; `todo.md` has a new section, "Sandbox budgets, before we ship", tracked in [sandbox budgets](sandbox-budgets.md).
- **All three of 0005's questions are settled** (Q1 Cloudflare, Q2 the sandbox as a tool provider, Q3 deferred), so this item moves from designing to todo. 0005's status line in the file still reads "proposed". Nothing is built.
- 23:02 on 2026-10-19: the lead's board: features 5 to 7 (sandboxes, secrets, and Qwen in sandboxes) are not started; they "wait for disk space and the agent". The Mac had about 10 GB free at 23:01, and the agent's first slice depends on B1 and the [model endpoint](model-endpoint.md).

## Next

A one-day spike after features 1 to 3. Switch to Freestyle if restoring a 2 GB workspace takes over 30 s, more than 10% of a 20-repo set fails, or the shutdown checkpoint can't finish in time.

## Questions for Will

- Is a 15-minute recovery window acceptable instead of a persistent disk? If not, Freestyle wins. (Answered 22:41: Cloudflare, with our own durable keep-awake timer.)
- Budgets: 20 awake sandboxes per deployment, 2 per person, a $100 a month alert, snapshots kept 30 days? Asked 22:43 as question 8 of 14, each as an admin setting changeable without a deploy. Recommended: yes. (Answered 22:45: deferred until we ship; a TODO, [sandbox budgets](sandbox-budgets.md).)
- None open.
- May the agent's loop run on its own host with only its tools in the sandbox? (Answered 22:42: yes; the sandbox exposes only itself and its tools.)
