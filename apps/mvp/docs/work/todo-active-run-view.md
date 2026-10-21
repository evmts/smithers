---
title: Show and steer the active run from a TODO
status: in-progress
area: app
owner: todo-steer builder (Claude Opus, session 6253ecf2) from 10:00 on 2026-10-21
updated: 2026-10-21 11:55 PDT
links: [todos-and-stack.md, todos-draft-commit-drop.md, flow-debugging.md, ../rulings.md, ../decisions/0026-watching-a-todo-run.md]
---

## Steering — 2026-10-21, 11:55 PDT

**What:** A Member steers a TODO's working agent from its run's page (TODO-3's second half).

**Current state:** Watching is built (decision 0026). Steering is built and proven in tests: the todo agent drains its run's own `NotificationQueue` (`Notifications.layerForExecution`, new in `@smthrs/harness`, keyed by agent session), `POST /api/remote-runs/<run>/steers` admits a Member's message, `run/steer` queues it through the device's outbox (an agent's steer goes with its run credential), and the run page lists messages (Sending, Sent, Delivered once the agent acted after it, Not delivered, Not sent) with a composer while the agent works. Receipts: `worker/flows/Todo.test.ts` (the real todo flow and agent on Postgres read a mid-turn message at the next turn; its line lands in the merged README; fails with the old empty source), `worker/RemoteRuns.test.ts`, `src/features/runs/remote.test.ts` (tab → engine → outbox → ChatApi → queue), `steer.test.ts`, `api.test.ts`, `@smthrs/agent` `AgentActionSteering.test.ts`, `@smthrs/harness` `Notifications.test.ts`. A Codex Astra review's findings are fixed or answered (session-keyed drains, Delivered needs an act, run credentials, kept refusals, an encoded-size bound, the draft restore).

**Next step:** the live e2e (`e2e/todo-steer.spec.ts`) locally with the GitHub App and the real model, then against production once these commits deploy.

**Open questions for Will:** None.


## Tracker reconciliation — 2026-10-21 09:24 PDT

**What:** Show the active TODO run and let the person watch and steer it.

**Why:** TODO-3 requires interaction with real implementation, not just a status display.

**Current state:** The 09:15 lead lists a running-TODO view ready in a workspace; the later 09:22 update explicitly says steering a running TODO is not built. Production TODO execution is also broken by the remote host. The complete requirement is not done.

**Next step:** Retain the finished view and its landing receipt, then have the expanded panel identify the steering gap and Opus implement it through public flow/plugin interfaces. Prove watch/steer interaction against a real running TODO after hosted execution is fixed, including reduced motion.

**Open questions for Will:** None. The provider preference and investigation/implementation direction are explicit; engineering validation remains with the builders.

Evidence: session 6253ecf2, script-filtered user text and lead replies in the last approximately two hours through 09:23:49 PDT; automated notifications, compacted summaries and tool results excluded. Rulings (including ARCH-14), Will’s queue answers, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules were reconciled. Product results are lead-reported; this tracker verifies the site build only. Existing feature execution ownership is retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 09:17 PDT

**What:** Link a Working TODO to its active flow, show slow-blinking activity and support watching and steering.

**Why:** TODO-3 requires visible progress and interaction while implementation runs.

**Current state:** At 09:15 PDT the lead lists the running-TODO view as finished workspace work with a lander. No pushed revision is reported. The lead’s summary does not independently prove every required watch/steer interaction or production TODO enablement.

**Next step:** Record the landed implementation and real-run recording; verify the active link, step states, reduced motion, watching and steering against TODO-3. Track any absent steering capability explicitly before calling the whole requirement done.

**Open questions for Will:** None new; engineering validation and landing do not need another decision.

Evidence: script-filtered session 6253ecf2 human text and lead replies through 09:15 PDT, including Will’s human-origin queued request at 09:10:54. Rulings and queue answers take precedence over the shared briefs/designs, decisions, proposals, TODOs and rules reviewed for this pass. Product validation is lead-reported; this tracker runs the site build only. Execution ownership retained; documentation curator: Codex.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 03:04 PDT

**Current state:** At 02:56 PDT the lead started the Opus coding-factory job, explicitly including the running-TODO view. Execution still requires QuickJS/Cloudflare and scratch-repository proof; no run-view implementation receipt exists.

**Next step:** Build the visible active-run link and watching/steering through public plugin primitives, then validate against proven TODO execution.

**Open questions for Will:** None new; existing unresolved questions remain in the retained history.

Evidence: lead text replies through 03:03 PDT, extracted by script from the latest approximately two session hours; automated notifications and tool blocks excluded. Current rulings and queue answers take precedence over briefs and designs. Execution ownership retained; documentation reconciled by Codex tracker curator. Product receipts are reported, not independently rerun here.

## Earlier tracker history (retained)


**What:** Link a running TODO to its active flow, show a slow-blinking activity indicator, and expose watching and steering.

**Why:** Will’s 23:33 queue answer expects a TODO to cause visible implementation through merge readiness.

**Current state:** TODO-3 records the requirement. The 23:33 lead says implementation follows proving the TODO-to-PR flow on Cloudflare; that flow remains switched off tonight. No active-run UI receipt.

**Next step:** Prove the prerequisite execution first, then build through public plugin/UI interfaces. Cover status transitions, link accuracy, watching/steering and reduced-motion treatment.

**Open questions for Will:** None; existing rulings authorize this scope.

Evidence: Will’s queue answers and lead text replies, 23:27–23:33 PDT, session 6253ecf2. Added by Codex tracker curator; no implementation or test receipt claimed.
