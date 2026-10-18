---
title: Will's answers to 14 design questions
status: done
area: design
owner: Will (decision); closed 22:56
updated: 2026-10-19
links: [decisions-for-will.md, mvp-scope-cut.md, sandbox-budgets.md, pr-review-and-merge.md, host-agnostic-flows.md, ../rules.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md, ../decisions/0007-roles-and-tags.md, ../decisions/0009-notifications-and-live-work.md, flows-and-agent.md, agent-ui-rendering.md, sandboxes.md, connect-agents-sandboxes-forge.md, roles-and-labels.md, notifications-and-live-work.md, ../decisions/0011-the-agent-runs-in-the-browser.md, durable-browser-engine.md, model-endpoint.md]
---

## What

Will's answers to the open questions in five proposed decisions. Each decision moves from "proposed" to "accepted" once its answers are in. Since 22:16 on 2026-10-19 Will answers them one at a time, after the lead explains each in plain words.

**All 14 closed** at 22:56: 11 answered or deferred by Will, 3 settled by the lead. (22:49: 10 answered, 4 open.) Now asking: 0007.3, question 11. Still open: 0007.3 and 0009.1 to 0009.3. (22:43: 7 answered, 7 open, asking 0005.3. 22:41: 6 answered, 8 open, asking 0005.2. 22:36: 5 answered, 9 open, asking 0005.1. 22:24: 1 answered, 13 open, asking 0003.2.)

| # | Question | Recommended | Will's answer |
|---|---|---|---|
| 0003.1 | The agent loop runs on Cloudflare; the browser only asks | yes | **Yes, with a condition** (22:22): Cloudflare code is decoupled from Cloudflare by dependency injection, so the native app runs the same code locally ([host-agnostic flows](host-agnostic-flows.md)). **Placement replaced at 22:31** by decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md): the agent runs in the browser |
| 0003.2 | Single-write browser flows use the in-memory engine until one has to wait; defer a durable browser engine | yes | **Answered differently** (22:25 to 22:29): "A syncronous change to storage is by default durable yea" and "The agent should run on frontend and the frontend itself should be durable". Decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md), accepted 22:31 ([durable browser engine](durable-browser-engine.md)) |
| 0004.1 | Generated views are layouts only: no timers, canvas or network | yes | **Yes** (22:32): "this makes sense go with your best judgement here I like yhow you are thinking" |
| 0004.2 | The renderer stays on Qwen until evals show it fails | yes | **Yes, the same model** (22:34): "make it super easy to configure by us as admins". Roles `agent`, `renderer`, `judge`; `admin/SetModel` ([model endpoint](model-endpoint.md)) |
| 0004.3 | Generated views sync across devices | yes | **Yes** (22:35): "Yes it syncs this is what enables multiplayer to work". Decision 0004 accepted |
| 0005.1 | Sandboxes recover from a checkpoint instead of keeping a disk | yes (Cloudflare over Freestyle) | **Cloudflare** (22:41): "So it's durable so sleeping shouldn't cause issues also couldn't we manually kick the container on the backend to stop it from sleeping or something?" Sleep is our own decision (`sandbox/Keep`), after 15 minutes with no activity and no running job; Cloudflare's 30-minute idle timeout is a backstop we keep re-arming ([sandboxes](sandboxes.md)) |
| 0005.2 | The agent loop runs on the host; its tools run in the sandbox | yes | **Yes** (22:42): "This is a great question! So we want the sandbox to only expose the sandbox and it's tool and the agent to be independent of that. We want as modular/durable an architecture as possible." Recorded in 0005: a sandbox is a tool provider exposing only the machine and its tools (exec, files, jobs, previews) as durable steps and knows nothing about agents; the agent runs on its own host, the browser under 0011, and binds them ([sandboxes](sandboxes.md), [connecting it all](connect-agents-sandboxes-forge.md)) |
| 0005.3 | Budgets: 20 sandboxes awake at once, 2 per person, $100/month alert, 30-day snapshots | yes | **Deferred until we ship** (22:45): "Add this as a TODO but we won't worry about this until we ship." Recorded in 0005; `todo.md` section "Sandbox budgets, before we ship" ([sandbox budgets](sandbox-budgets.md)). All three 0005 questions settled |
| 0007.1 | GitHub's five roles replace our three | yes | **Four roles** (22:46 to 22:48): "Let's do admin, maintainer, trusted contributor, untrusted contributor but maybe name them better than that. Keep it simple in future this will get more advanced including workflows to decide if someone is trusted or untrusted stuff like that"; then "role names are good": Admin, Maintainer, Member, Guest ([roles and labels](roles-and-labels.md)) |
| 0007.2 | Maintainers merge to main by default | yes | **Merging is a configurable flow** (22:49): "Merging into main is actually triggering a workflow and that workflow is configurable. By default maintainers and up obviously". A person merges, never an agent or a Guest ([PR review and merge](pr-review-and-merge.md)) |
| 0007.3 | Event-started flows may apply labels as Smithers, within limits an admin sets | yes | **Deferred** (22:56): "question 11 I think is thinking too far ahead whatever asked the question is doing too much we haven't gottent hat far yet". Decide when the first event-started labeling flow is built. All three 0007 questions settled |
| 0009.1 | A finished run stays in "Earlier" for 7 days | yes | **Settled by the lead** (22:56), simplest choice: a finished run disappears after `Done`; a failed run stays visible and retryable. No `Earlier` list. Will may override |
| 0009.2 | Someone else's run on a shared conversation doesn't send you a toast | yes | **Settled by the lead** (22:56): no toast; it shows in the shared conversation. Will may override. **Overridden by Will** (22:58): "Some toasts you should see for other people's runs if they are on same branch as you for sure this goes back to what I said about feeds being tied to user, branch repository etc. Main changing is tied to repository for example or a new release tied to repositry." Toasts follow scope: person, branch, repository (0009 §8; [notifications](notifications-and-live-work.md)) |
| 0009.3 | Built-in notification routing now; repository policy ships with sandboxes | yes | **Settled by the lead** (22:56): built-in routing only; repository rules wait for sandboxes. Will may override |

Until 22:16 this note asked for one reply accepting all 14; that table had no answer column.

## Why

Each panel ended with questions only Will can answer. The lead batched them so one reply settles all five records.

## State

- 21:21 on 2026-10-19: the lead asked Will to accept every recommendation or name the numbers to change. Asked again at 21:23 and 21:29.
- 21:31: Will asked whether the questions are in his maintainer app. The lead answered yes: this card, in the Blocked column of `#/work`.
- No answer to the questions yet. Decision 0006's three questions are separate ([repo clone and view](repo-clone-and-view.md)).
- Building continues on the recommended answers where a workstream needs one.

- 21:43: still unanswered. Every other open question for Will, including decision 0006's Code Storage organization, is on [decisions for Will](decisions-for-will.md).
- 21:54: still unanswered. Will's messages since 21:45 covered Code Storage only.
- About 22:00: Will asked how best to help; "accept all" is third of five asks on [decisions for Will](decisions-for-will.md), about two minutes. It unblocks features 1 and 3, sandboxes, roles and notifications. No answer at 22:04.
- 22:14: still unanswered. Will's messages from 22:05 to 22:13 covered the Code Storage organization and the Cloudflare token, both now answered. With those gone, "accept all" is second on [decisions for Will](decisions-for-will.md), after the restart question.

- 22:15: the lead's ranked asks put "accept all" second, after the restart question.
- 22:16: Will: "Can you do one at a time and explain it better". The lead switched to one question per message, each with a plain explanation and, where it helps, a diagram.
- 22:17: question 1 of 14 (0003.1), with a diagram of the two placements (loop on Cloudflare, or in the browser) and four reasons both panels chose Cloudflare.
- 22:22: **0003.1 answered.** Will: "sure let's do it on cloudflare but make sure our cloudflare code is decoupled from cloudflare via dependency injection because our native app version later will just run the cloudflare code locally". The lead wrote it into decision 0003 under Q1 with his words and added the rule `sdk.host-agnostic-flows` to `rules.md`, enforced by an `ImportRules` `forbid` in `apps/mvp/PACKAGE.ts`; a probe file confirmed the lint catches a Cloudflare import ([host-agnostic flows](host-agnostic-flows.md), [flows and the agent](flows-and-agent.md)).
- 22:22: question 2 of 14 (0003.2) asked, with a diagram: single-write browser flows on the in-memory engine now (recommended), or Sol's durable engine with its step record in browser storage first (several days). The lead named it the one place the "durable by default" rule waits, limited to browser flows that finish in one write; the first browser flow that must wait triggers the durable browser engine. No answer at 22:24.
- Decision 0003 stays "proposed" until Q2 is answered.
- 22:25: **0003.2 answered differently from both options.** Will: "A syncronous change to storage is by default durable yea. In fact this kinda explains why we maybe should reconsider where the agent runs. The agent should run on frontend and the frontend itself should be durable." The lead agreed on three conditions and named the costs.
- 22:29: Will: Smithers must work in the browser through `platform-browser`; model calls stay proxied through the server; the app is a PWA; "Long work isn't what decides if it's remote or not. We prefer things to be local first actaully". He left the multi-tab design to the lead.
- 22:31: decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) accepted, replacing 0003.1's placement and answering 0003.2. 0003 points to it; its status line still reads "proposed". The lead then asked question 3 (0004.1).
- 22:32: **0004.1 answered yes.** 22:32: question 4 (0004.2) asked.
- 22:34: **0004.2 answered:** "Yea you got it same model but make it super easy to configure by us as admins". Recorded in 0004 as named roles plus the admin-only `admin/SetModel` ([model endpoint](model-endpoint.md)). Question 5 (0004.3) asked.
- 22:35: **0004.3 answered:** "Yes it syncs this is what enables multiplayer to work". **Decision 0004 is accepted.**
- 22:35: question 6 (0005.1) asked: is losing running processes when a sandbox sleeps acceptable, given files are always safe, so we can use Cloudflare sandboxes? About $14 per branch-month on Cloudflare; Freestyle costs about twice that and keeps memory and disk. Sandboxes are remote under 0011 because they need a machine. No answer at 22:36.
- The lead's brief to this tracker counted 3 answered and 11 open at about 22:33; Will answered 0004.2 and 0004.3 within the next two minutes.
- 22:38: Will: "Are you suggesting we use freestyle instead of cloudflare?" The lead: no, Cloudflare; Freestyle only if a sandbox must keep processes through sleep. Will: "Why would it sleep if running process is happenintg?" The lead: it doesn't while Smithers uses it; our code renews the idle timer during any job, so processes are lost only to leftovers after idle or a Cloudflare restart with up to 15 minutes' warning, and the interrupted job resumes as a durable flow.
- 22:41: **0005.1 answered: Cloudflare.** Will: "So it's durable so sleeping shouldn't cause issues also couldn't we manually kick the container on the backend to stop it from sleeping or something?" Recorded in 0005: sleep is our decision (`sandbox/Keep`), after 15 minutes with no activity and no running job; Cloudflare's 30-minute inactivity timeout is a backstop we keep re-arming.
- 22:41: question 7 (0005.2) asked: the agent's loop stays in the browser, where 0011 put it, and only tools that need a computer (bash, tests, builds, file edits) run in the branch's sandbox, so every model call stays a durable step through the endpoint and the model key never enters the box. Third-party CLI agents run inside as jobs later. No answer at 22:41.

- 22:42: **0005.2 answered yes.** Will: "This is a great question! So we want the sandbox to only expose the sandbox and it's tool and the agent to be independent of that. We want as modular/durable an architecture as possible." Recorded in 0005 under Q2 with his words: a sandbox exposes only the machine and its tools (exec, files, jobs, previews) as durable flow steps and knows nothing about agents. The agent loop runs on its own host, the browser per [0011](../decisions/0011-the-agent-runs-in-the-browser.md), and binds a branch's sandbox tools like any others, so either side can change without the other. 0005 stays proposed until Q3.
- 22:42: the lead started a docs agent to bring 0003, 0009, `HOST-PLAN.md` and the proposals in line with 0011 ([durable answering](durable-answering.md)).
- 22:43: question 8 (0005.3) asked, with a table of limits: 20 awake sandboxes per deployment and 2 per person (at a limit a new one waits, shown as "Waiting for a sandbox"); a $100/month sandbox spend alert beside the model-spend alert; snapshots kept for branches touched in the last 30 days (older branches restart from main's snapshot plus their commits). Like the model roles, each limit is an admin setting changeable without a deploy. No answer at 22:46.
- 22:45: **0005.3 deferred until we ship.** Will: "Add this as a TODO but we won't worry about this until we ship." Recorded in 0005; `todo.md` gained "Sandbox budgets, before we ship" ([sandbox budgets](sandbox-budgets.md)). With Q1 to Q3 settled, the [sandboxes](sandboxes.md) and [connecting it all](connect-agents-sandboxes-forge.md) items move from designing to todo; 0005's file status still reads "proposed".
- 22:45: question 9 (0007.1) asked: GitHub's five roles in place of M-05's three.
- 22:46: Will asked for four roles instead: admin, maintainer, trusted contributor and untrusted contributor, better named, with trust decided by workflows later. 22:47: the lead proposed Admin, Maintainer, Member and Guest. A Guest's code runs, sandbox use and secret access wait for a Member's or Maintainer's approval.
- 22:48: **0007.1 answered: "role names are good".** Recorded in 0007 under Q1. The rest of 0007 still describes five roles and needs revising ([roles and labels](roles-and-labels.md)).
- 22:48: question 10 (0007.2) asked: Maintainer-only merge into main by default, with an admin setting to allow Members.
- 22:49: **0007.2 answered: merging runs the repository's configurable merge flow**; by default Maintainers and Admins merge. Recorded in 0007 under Q2.
- 22:49: question 11 (0007.3) asked: may event-started flows apply ordinary labels as Smithers, with guarded labels like `todo` reserved for people? No answer at 22:53.
- 22:56: **0007.3 deferred.** Will: "question 11 I think is thinking too far ahead whatever asked the question is doing too much we haven't gottent hat far yet." The lead agreed and saved the lesson: design panels ask only about what we're building now.
- 22:56: the lead settled 0009.1 to 0009.3 itself with the simplest option for each, recorded in 0009 §8, and told Will he may override any of them ([notifications](notifications-and-live-work.md)). **All 14 design questions are closed.**
- Records: 0004 and 0011 are accepted. 0003, 0005, 0007 and 0009 have every question settled but their files still read "proposed". 0007's body still describes five roles ([roles and labels](roles-and-labels.md)).
- 22:56: the lead moved to the next ask: approve the MVP list ([MVP scope cut](mvp-scope-cut.md)).
- 22:58: **Will overrode 0009.2.** A run on a branch you're on toasts for you even when someone else started it; toasts follow person, branch and repository scope. Recorded in 0009 §8. 0009.1 and 0009.3 stand as the lead settled them.
- 23:00: Will closed the follow-up MVP question as reference only ([MVP scope cut](mvp-scope-cut.md)).

## Next

Closed. Left over: mark 0003, 0005, 0007 and 0009 accepted, and revise 0007's body to four roles (in progress since 23:00; [roles and labels](roles-and-labels.md)).

Until 22:56: on each answer, write it into its record with Will's words, mark the record accepted once all its questions are answered, update the linked notes, then ask the next question. Order at 22:49: 0007.3 now, then 0009.1 to 0009.3. (At 22:43 the order started at 0005.3.) (At 22:41 the order started at 0005.2; at 22:36, at 0005.1; at 22:24, at 0003.2.)

## Questions for Will

- None open. Will may override the lead's three 0009 choices. (22:58: he overrode 0009.2.)
- Question 11 of 14 (0007.3): may event-started flows, such as triage on a new issue, apply ordinary labels as Smithers, with guarded labels like `todo` reserved for people? Recommended: yes. Then 0009.1 to 0009.3. (Deferred 22:56; 0009.1 to 0009.3 settled by the lead.)
- Question 10 of 14 (0007.2): only Maintainers merge into main by default, with an admin setting to allow Members? Recommended: yes. (Answered 22:49: merging runs the repository's configurable merge flow; by default Maintainers and Admins.)
- Question 9 of 14 (0007.1): should GitHub's five roles replace M-05's three? Recommended: yes. (Answered 22:48: four roles, Admin, Maintainer, Member and Guest.)
- Question 8 of 14 (0005.3): should the sandbox limits be admin settings changeable without a deploy: 20 awake per deployment, 2 per person, a $100/month sandbox spend alert, snapshots kept for branches touched in the last 30 days? Recommended: yes. (Answered 22:45: deferred until we ship.)
- Question 7 of 14 (0005.2): should the agent's loop stay in the browser, with only its tools running in the sandbox? Recommended: yes. (Answered 22:42: yes; the sandbox exposes only the machine and its tools, and the agent is independent of it.)
- Question 6 of 14 (0005.1): is losing running processes when a sandbox sleeps acceptable, with files always safe, so sandboxes use Cloudflare? Recommended: yes. (Answered 22:41: Cloudflare, with our own durable keep-awake timer.)
- Question 2 of 14 (0003.2): should single-write browser flows use the in-memory engine until one has to wait? Recommended: yes. (Answered 22:25 to 22:29; decision 0011. Questions 3 to 5 answered by 22:35.)
- Accept all 14 recommendations? Reply with the numbers you want changed. (Replaced at 22:16 by one question at a time; 0003.1 answered 22:22.)
