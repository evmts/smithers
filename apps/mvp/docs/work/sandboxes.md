---
title: Branch sandboxes (feature 5)
status: in-progress
area: infra
owner: sandboxes builder (Claude Opus, workspace `sandboxes`, from 09:50 on 2026-10-21)
updated: 2026-10-21 10:07 PDT
links: [branch-terminal.md, branch-sharing.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md, ../todo.md, sandbox-budgets.md, ../decisions/0007-roles-and-tags.md, ../decisions/0002-local-first.md, design-questions.md, ../decisions/0011-the-agent-runs-in-the-browser.md, connect-agents-sandboxes-forge.md, model-endpoint.md, token-spend-alerts.md, secrets-proxy.md]
---

## Production sandboxes — 2026-10-21 10:07 PDT

**State:** doesn't work in production yet; nothing has ever started a container there (0 instances). The four-model panel (Sol, Astra, Opus, Fable) agreed on the cause; the merged plan is in the session's `sandbox-panel/MERGED.md`.

**Why it fails in production** (each fixed in this change unless noted):
- Every sandbox flow runs on `FlowExecution`, which fails `MigrationError` in prod. The prod-remote-flows builder owns that fix; sandboxes wait on it.
- A deployed container's `exec` refuses user names; local Docker accepts them, so dev passed. Every command now runs as a numeric `uid:gid`, with `HOME`, `USER` and `LANG`, which `exec` doesn't pass.
- Every box started as `lite` (256 MiB). It now starts as `SANDBOX_INSTANCE`, `standard-1` by default.
- A deploy restarts the object, which loses the inactivity timeout, and Cloudflare then stops a busy box. The object now re-arms it in its constructor and on every ask.
- A failed restore marked the checkpoint restored, and the next save overwrote it; a commit made in the box was lost on wake. Restore now fails on a transient error, keeps an unrestorable checkpoint aside, and carries unpushed commits as a git bundle.
- Wake failures now log the step that failed.
- The image was already published and bound in prod; it now also has Node and npm.
- Not fixed here: a signed-in Member and the Spoon-Knife fixture in prod (the prod-e2e builder's sign-in).

**Next step:** land the fix, run `e2e/sandbox-lifecycle.spec.ts` locally, deploy once the MigrationError fix is live, then run the same spec against production with a GIF.

## Tracker reconciliation — 2026-10-21 09:24 PDT

**What:** Run a durable sandbox per branch, shared by the terminal and agent tools.

**Why:** Will explicitly prioritizes production sandboxes and requires a four-model investigation followed by implementation.

**Current state:** Local terminal, keep-awake, 15-minute idle sleep and working-copy restore reportedly passed on 10-20. Production does not work: the image has not been published or verified, and the lead reports remote-flow MigrationError. Sol, Astra, Opus and Fable are investigating; no merged report or production success receipt exists. Cloudflare is preferred; Freestyle is the fallback. Secrets remain switched off.

**Next step:** Merge the four reports, compare the Cloudflare Sandbox SDK with the existing provider, and have Opus implement the agreed repair. Prove terminal commands, agent tools in the same branch box, no sleep during work, idle sleep and restored work after wake against production, with a GIF. Coordinate the separate remote-host repair; do not assume its fix alone publishes an image.

**Open questions for Will:** None. The provider preference and investigation/implementation direction are explicit; engineering validation remains with the builders.

Evidence: session 6253ecf2, script-filtered user text and lead replies in the last approximately two hours through 09:23:49 PDT; automated notifications, compacted summaries and tool results excluded. Rulings (including ARCH-14), Will’s queue answers, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules were reconciled. Product results are lead-reported; this tracker verifies the site build only. Existing feature execution ownership is retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 16:35 PDT

**What:** Keep one durable restartable machine per branch, with durable tools and persisted working copy.

**Why:** Branch work must survive tabs closing and machines sleeping.

**Current state:** At 16:25 the lead reported machines stay awake while work runs, sleep after 15 idle minutes and save/restore the working copy across restarts. Real-model and closed-tab tool tests passed. Secrets remain disabled pending browser proof; broader sandbox work stays in progress.

**Next step:** Retain restart/lifetime evidence and finish egress proof and remaining sandbox acceptance checks.

**Open questions for Will:** None.

Evidence: lead text replies extracted by script from the session’s latest two hours through 23:34:16 UTC; current rulings and queue answers take precedence over older designs. Reported product-test receipts only; this tracker ran no product tests.

## Prior tracker record (retained)


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
- **06:39 to 06:42 on 2026-10-20: the first sandbox has a driver.** Will put "ability to open terminal in an iframe" in his priorities and asked for branch sharing. Panel B's walking skeleton must reach a real shell in a real Cloudflare sandbox: a branch `SandboxObject`, a digest-pinned image, a PTY seam in `@smthrs/sandbox` and a terminal gateway Worker ([branch terminal](branch-terminal.md)). Sol estimates `standard-1` at about $0.047 to $0.074 an awake hour. Status stays `todo` until 0013 merges.
- 13:19:52 on 2026-10-20: the lead's list: "Branch sandboxes, secrets via an egress proxy, agent connected to sandboxes and the forge: not started".
- 13:21:12: the lead: "Branch sharing, branch sandboxes, and connecting the agent to sandboxes: these build on the branch and terminal slice that's still running." So they wait for the [branch terminal](branch-terminal.md) builder. Of the group, only [secrets through an egress proxy](secrets-proxy.md) started (13:22:52), at a seam outside the container and terminal code.
- 13:42:00 on 2026-10-20: the branch workspace slice finished with a real container per branch under `alchemy dev` ([branch terminal](branch-terminal.md)).
- **13:43:30: the lead started the agent-in-the-sandbox builder**, whose brief includes "the sandbox stays awake while something runs" ([connecting it all](connect-agents-sandboxes-forge.md)). Secrets through the egress proxy stay with [secrets proxy](secrets-proxy.md). **Status moved from todo to in-progress.**
- 14:30 on 2026-10-20, on disk, the builder: the machine wakes on the first call or terminal, saves the working copy (commit and binary patch, in the branch object's storage) after every `run` and `write`, when a terminal closes and before sleep, and puts it back on the next generation's first wake; `sandbox/Keep` asks every 5 minutes and puts a generation to sleep after 15 idle minutes, never while a person's process runs ([sandbox tools](../features/sandbox-tools.md#sleep-and-wake)).
- 14:26 on 2026-10-20: the shared dev stack got `0024_sandbox_calls` and an `alchemy dev` restart, so the sandbox tools e2e can run ([connecting it all](connect-agents-sandboxes-forge.md)). 14:30: the same builder wires the [secrets egress](secrets-proxy.md) into `SandboxObject`.

## Next

From 14:30 on 2026-10-20: the sandbox tools e2e, including sleep after 15 idle minutes and wake with the working copy restored. Sandbox limits stay deferred until we ship ([sandbox budgets](sandbox-budgets.md)).

Until 14:30 on 2026-10-20 the next step was, from 13:43 on 2026-10-20: the builder's report on keeping a sandbox awake while a step runs. Sandbox limits stay deferred until we ship ([sandbox budgets](sandbox-budgets.md)).

Until 13:46 on 2026-10-20 the next step was, from 13:21 on 2026-10-20: after the [branch terminal](branch-terminal.md) builder finishes its first slice (a real Cloudflare container per branch), extend that container into the branch sandbox of 0005, with secrets only through the [egress proxy](secrets-proxy.md).

Until 13:21 on 2026-10-20 the next step was: a one-day spike after features 1 to 3. Switch to Freestyle if restoring a 2 GB workspace takes over 30 s, more than 10% of a 20-repo set fails, or the shutdown checkpoint can't finish in time.

## Questions for Will

- Is a 15-minute recovery window acceptable instead of a persistent disk? If not, Freestyle wins. (Answered 22:41: Cloudflare, with our own durable keep-awake timer.)
- Budgets: 20 awake sandboxes per deployment, 2 per person, a $100 a month alert, snapshots kept 30 days? Asked 22:43 as question 8 of 14, each as an admin setting changeable without a deploy. Recommended: yes. (Answered 22:45: deferred until we ship; a TODO, [sandbox budgets](sandbox-budgets.md).)
- None open.
- May the agent's loop run on its own host with only its tools in the sandbox? (Answered 22:42: yes; the sandbox exposes only itself and its tools.)
