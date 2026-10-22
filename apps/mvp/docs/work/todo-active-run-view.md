---
title: Show and steer the active run from a TODO
status: in-progress
area: app
owner: Claude feature builder after TODO execution is proven
updated: 2026-10-21 16:25 PDT
links: [todos-and-stack.md, todos-draft-commit-drop.md, flow-debugging.md, ../rulings.md]
---

## Steering — 2026-10-21, 11:55 PDT

**What:** A Member steers a TODO's working agent from its run's page (TODO-3's second half).

**Current state:** Watching is built (decision 0026). Steering is built and proven in tests: the todo agent drains its run's own `NotificationQueue` (`Notifications.layerForExecution`, new in `@smthrs/harness`, keyed by agent session), `POST /api/remote-runs/<run>/steers` admits a Member's message, `run/steer` queues it through the device's outbox (an agent's steer goes with its run credential), and the run page lists messages (Sending, Sent, Delivered once the agent acted after it, Not delivered, Not sent) with a composer while the agent works. Receipts: `worker/flows/Todo.test.ts` (the real todo flow and agent on Postgres read a mid-turn message at the next turn; its line lands in the merged README; fails with the old empty source), `worker/RemoteRuns.test.ts`, `src/features/runs/remote.test.ts` (tab → engine → outbox → ChatApi → queue), `steer.test.ts`, `api.test.ts`, `@smthrs/agent` `AgentActionSteering.test.ts`, `@smthrs/harness` `Notifications.test.ts`. A Codex Astra review's findings are fixed or answered (session-keyed drains, Delivered needs an act, run credentials, kept refusals, an encoded-size bound, the draft restore).

**Next step:** the live e2e (`e2e/todo-steer.spec.ts`) locally with the GitHub App and the real model, then against production once these commits deploy.

**Open questions for Will:** None.


## Tracker reconciliation — 2026-10-21 16:25 PDT
**What:** Watch and steer a running TODO through to its pull request.
**Why:** Keep implementation and validation claims tied to evidence.
**Current state:** At 16:09 the full local E2E commits a TODO, watches it, steers it and verifies the steered line in its PR. Six commits queue to land; GIF: ~/Desktop/smithers-mvp/gifs/todo-steer-todo-steer.gif. Production proof awaits deploy. Long-step run-page lag has its own SDK workstream.
**Next step:** Land six commits and run production E2E after deploy.
Evidence: script-filtered human messages and lead text replies, 14:25–16:24 PDT, session 6253ecf2; tool blocks, notifications and compaction summaries excluded. Rulings and queue answers govern over historical designs. Existing implementation owner retained; Codex maintains this note. Product receipts are lead-reported.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 15:40 PDT
**What:** Watch a TODO run and steer it with newer instructions.
**Why:** A Delivered message must take precedence over conflicting earlier TODO text.
**Current state:** At 15:25 the lead is forwarding the TODO-steering commits to the lander. No new push, deployed run or passing conflicting-instruction eval is reported. The earlier delivery success and omitted requested PR line remain the relevant behavior evidence.
**Next step:** Retain the original conflicting-instruction real-model eval, collect landing after durable effects and prove the requested PR change in production.
**Open questions for Will:** None newly identified; existing questions remain in the retained history.
Evidence: script-filtered user-typed text and lead replies in session 6253ecf2, approximately 13:40–15:40 PDT on 2026-10-21. Automated notifications, relayed agent text, tool records and compaction summaries excluded. Current rulings and queue answers govern over briefs and planning documents. Engineering ownership is retained; Codex curates this tracker update. Product outcomes above are lead-reported.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 14:05 PDT
**What:** Watch a TODO run and steer it with newer instructions.
**Why:** A delivered message must affect the agent even when it contradicts the original TODO.
**Current state:** At 13:56 PDT the builder-copy real E2E commits a TODO, watches its run and delivers a steering message after step one. The PR omits the requested line because the original TODO says Change nothing else. The lead rejects weakening the test and requests newer-instruction precedence plus a real-model eval of that original clash. Steering commits are queued; no production completion is reported.
**Next step:** Implement precedence, retain the conflicting-instruction eval, land after durable effects and prove the requested PR change locally and live.
Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2 for approximately 12:04–14:04 PDT on 2026-10-21; synthetic notifications and tool records excluded. Rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this tracker validates the maintainer-site build only. Engineering owners remain responsible; Codex owns this documentation reconciliation.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 12:46 PDT
**What:** Watch and steer a running TODO through the shared durable flow.
**Why:** TODO-3 requires visible active work and effective steering.
**Current state:** At 12:29 the lead reports steering built and Astra-reviewed in three commits: SDK per-run messages read between steps, send route/client flow/Steer section, and e2e spec. Six review findings are fixed; local tests, including interrupted-run resume, pass. Generated docs and the builder’s live e2e remain queued. At 12:38 the lead orders steering after the durable-effects stack. No steering landing or live production pass is reported.
**Next step:** Finish docs and live e2e checks, obtain commit receipts, then land after durable effects and prove production steering. Retain the earlier run-watch and no-polling regressions.
Evidence: script-filtered user-typed text and lead replies, approximately 10:44–12:44 PDT on 2026-10-21, session 6253ecf2; synthetic notifications, relayed agents and tool blocks excluded. Rulings and queue answers govern over shared briefs/designs and historical decisions, proposals, TODOs and rules. Product receipts are lead-reported; Codex curates documentation and validates the site build. Existing execution ownership is retained.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 11:24 PDT
**What:** Watch and steer a running TODO through its durable flow.
**Why:** TODO-3 requires effective steering and reads driven by relevant run changes.
**Current state:** At 11:04 the live-watch fix passes both load runs. Its regression was shown to fail with polling inserted, then polling was removed. Before committing, the builder checks seven unrelated timed-out files individually on the loaded MacBook. No commit or production steering completion is reported.
**Next step:** Finish the remaining checks and docs check, land the fix, then prove real-model and production steering after the remote-host repair.
Evidence: script-filtered human messages and lead text replies, 09:26–11:24 PDT, session 6253ecf2; current rulings and queue answers supersede historical briefs, designs, decisions, proposals, TODOs and rules. Engineering receipts are lead-reported; this refresh validates the site build only. Existing implementation ownership is retained; Codex curates documentation.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 10:54 PDT
**What:** Watch and steer a running TODO through its real flow.
**Why:** TODO-3 requires effective steering without unnecessary remote rereads.
**Current state:** At 10:48 PDT the run-page regression remains uncommitted pending two load reruns and docs:check. Every reread must follow a relevant sync-service update; deliberately introducing polling made the regression fail, then that loop was removed. Local steering previously passed; review/test runs and production steering proof remain outstanding.
**Next step:** Finish the load checks and docs check, land the fix, then prove real-model and production steering after host recovery.
**Open questions for Will:** None. Access, Neon, Telegram and review routing are settled.
Evidence: script-filtered human messages and lead text replies from session 6253ecf2, latest two hours through 10:53 PDT; rulings and queue answers take precedence over historical briefs and docs. Product receipts are lead-reported. Codex curates documentation; engineering ownership is retained.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 10:34 PDT
**What:** Watch a running TODO and steer its next agent step.
**Why:** TODO-3 requires live execution and effective steering.
**Current state:** At 10:31 the lead reports steering works end to end in local tests; real-model E2E and a GIF are running on separate ports. At 10:30 a regression fix stops the run page rereading Cloudflare whenever unrelated tab-engine activity changes. That fix is uncommitted pending load reruns and docs:check. Production Member access is ready.
**Next step:** Finish the real-model/load checks, land the regression and prove production steering after host recovery.
**Open questions for Will:** None newly identified; retain unrelated unresolved questions in the live queue.
Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, latest approximately two hours through 10:33 PDT; current rulings and queue answers through 10:31 PDT, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence; this tracker runs only the site build. Execution ownership is retained; Codex curates documentation.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 10:15 PDT
**What:** Link the running TODO to its live flow and deliver steering messages to the working agent.
**Why:** TODO-3 requires watching and steering actual execution.
**Current state:** The steering panel is complete and implementation is running. The existing SDK durable steering queue must replace the TODO agent path that ignores messages. The active view and blinking indicator appear in the factory workerd recording; no production steering receipt exists. Will sent both Write invitations; the shared production session awaits acceptance and renewed sign-in.
**Next step:** Prove steering changes the next agent step, including duplicates, reload and authorization; reuse the production harness and retain its live receipt.
**Open questions for Will:** None. No additional fixture setup or access decision is needed from Will.
Evidence: user-typed messages and lead text replies extracted by script from session 6253ecf2, approximately 08:14–10:14 PDT on 2026-10-21; tool records, automated notifications, local-command output and continuation summaries excluded. Current rulings (ARCH-4, TEST-6, AUTH-4, ARCH-14, PROC-20) and queue answers take precedence over shared briefs, panel designs, decisions, proposals, TODOs and rules. Execution owners are retained; Codex curates tracker documentation only. Product validation is lead-reported; this refresh runs only the site build.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 10:04 PDT
**What:** Watch and steer a running TODO through its durable run.
**Why:** TODO-3 requires messages to reach the working agent.
**Current state:** At 09:54 PDT the steering panel is finished and the builder is implementing, confidence 80%. The SDK already has a durable steering queue; the TODO agent is wired to an older path that ignores messages. The visible run and blinking indicator are included in the factory workerd recording; neither production steering nor a completed steering repair has a receipt.
**Next step:** Wire the existing durable steering path and prove a message affects the next agent step, including duplicates, reload and authorization. Reuse production-e2e.md sign-in and record the production journey.
**Open questions for Will:** Existing test-account Write request covers both repositories; no additional fixture setup is requested.
Evidence: script-filtered user-typed text and lead text replies in session 6253ecf2, latest approximately two hours through 10:03 PDT; automated notifications, compaction summaries and tools excluded. Current rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this tracker validates only the site build. Execution ownership retained; Codex curates documentation.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 09:45 PDT
**What:** Link a TODO to its active run and let the person steer the working agent.
**Why:** TODO-3 requires watching and steering actual implementation.
**Current state:** At 09:42 PDT the lead reports the four-model steering panel finished; at 09:43 it confirms implementation is underway. Earlier workspace completion concerned the active-run view, not steering. No completed steering regression, landing attribution, or live execution receipt is reported. Production still depends on remote-host recovery and Member test access.
**Next step:** Finish the Opus implementation through the existing durable public flows. Prove a message sent while the TODO is running reaches its next agent step, including reload, duplicate input and authorization; then retain real production receipts and recording.
**Open questions for Will:** Existing request only: grant codeplanesmithers write access to smithersai/smithers for Member-only production TODO and steering tests (lead confidence 75%).
Evidence: script-extracted human text and lead text replies from session 6253ecf2, approximately 07:43–09:43 PDT on 2026-10-21; compacted summaries, local-command output, automated notifications and tool blocks excluded. Rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product results are reported evidence; this tracker runs only the maintainer-site build. Existing execution owners are retained; Codex curates documentation.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 09:34 PDT
**What:** Show the active TODO run and let the person steer it.
**Why:** A visible run must support interaction with the actual working agent.
**Current state:** At 09:26 PDT a dedicated four-model panel is reported running for TODO steering, with Opus to merge and implement. The view was previously reported finished in a workspace; steering remains unbuilt and production execution remains blocked by remote flows. No end-to-end steering receipt exists.
**Next step:** Preserve and land the view independently. Implement durable steering through public flows so the next agent step consumes the message, then prove it against a real running TODO after the hosted runtime repair.
**Open questions for Will:** None new. Provider preference and implementation direction are settled; builders resolve engineering choices.
Evidence: session 6253ecf2, script-filtered user-typed text and lead text replies in the latest approximately two hours through 09:33 PDT; synthetic notifications, tool results and compacted summaries excluded. Rulings and queue answers take precedence over shared briefs/designs, decisions, proposals, TODOs and rules. Product results are lead-reported; this refresh validates only the site build. Execution owners remain unchanged; Codex maintains this tracker entry.
## Earlier tracker history (retained)
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
