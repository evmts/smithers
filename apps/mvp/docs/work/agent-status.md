---
title: Agent status (working, needs you, waiting, failed, done)
status: done
area: design
owner: agent-status builder, reported phase 1 done at 12:57 on 2026-10-20 (the lead); queued for the lander's app round, uncommitted at 13:06. Until 12:57: agent-status builder; the GIF remade at 12:43:36 on 2026-10-20 and `e2e/status.spec.ts` changed at 12:44:35; unreported by 12:45. Until 12:24: agent-status builder; browser test started 12:16 on 2026-10-20, rerunning at 12:23 before it makes its GIF (the lead); `docs/design/agent-status/status-needs-you.gif` (12:21:16) and 20 screenshots (12:22) on disk; unreported by 12:23. Until 12:23: agent-status builder, waiting from about 12:07 on 2026-10-20 for the shared heavy-test lock before running `e2e/status.spec.ts`; no result by 12:14. Until 12:07: agent-status builder, not stopped by either weekly limit (the lead, 11:42:48 on 2026-10-20); phase 1 (decision 0015, the feature doc, `e2e/status.spec.ts`, `src/features/status/`) on disk at 11:50:47; unreported by 11:55. Until 11:42: agent-status builder, resumed by the lead at 10:42 on 2026-10-20 from where it stopped (the Claude usage limit stopped it from about 08:15 to 10:40); unreported by 10:44. Until 10:42: agent-status builder, building phase 1 of 0015 from about 07:00 on 2026-10-20: `@smthrs/ui` status components, the `runs` table, `src/features/status/` and three flows; unreported. Until 07:00: agent-status designer and builder, started 06:43:04 on 2026-10-20 by the lead; decision 0015 (06:58:01) and the mock (06:59:36) written, now building the first slice; unreported. Until 06:58: designing first (decision 0015 and HTML mocks), then the first slice; unreported
updated: 2026-10-20
links: [cerebras-rate-limits.md, dev-stack-hygiene.md, ../decisions/0015-agent-status.md, ../design/agent-status/agent-status.html, notifications-and-live-work.md, flow-debugging.md, chat-message-controls.md, durable-answering.md, local-first.md, agent-ui-rendering.md, observability.md, e2e-suite-and-gifs.md, ../decisions/0009-notifications-and-live-work.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../features/agent.md, ../features/chat.md, ../rules.md, fable-review-2-fixes.md, roles-and-labels.md, model-step.md, code-reviews.md, land-to-main.md, cerebras-rate-limits.md]
---

## What

The agent tells you what it's doing and whether it needs you, in the app, on every tab and device.

```
header      ● Smithers · working          ● Smithers · needs you (1)        tab title: (1) Smithers
conversation  ┌ needs you ───────────────────────────┐
              │ Which branch should I use?           │
              │ [main] [feature/x]       [Answer]    │   answering resumes the durable run
              └──────────────────────────────────────┘
toast       needs you · Answer                        browser notification, with consent
```

**Decided in 0015 (06:58, proposed):**
- **Five states, one word each:** `working`, `waiting`, `needs_you`, `failed`, `done`, shown as Working, Waiting, Needs you, Failed, and nothing for done. They are 0009 §4's states (0009's `live` shows as Working). Needs you is gold; waiting is quiet.
- **The run reports its own status as a durable step,** `run/report`, into 0009's `runs` row. `chat/Answer` reports working, waiting (behind an earlier answer) and done or failed. A report that can't land never fails the run.
- **Needs you is a flow the agent calls:** `agent/ask { kind, prompt, options? }`, model-invocable, whose body is a `HumanTask` (`ask`, `select` or `confirm`), so the question survives a closed tab. `kind` is `question` or `approval` (Approve or Deny).
- **Answering is a flow:** `run/answer` records it on the server; the device holding the run delivers it (`run/deliver`), so an answer from a phone resumes the run in the laptop's browser. The first accepted answer wins.
- **One record, many views:** the `runs` row is the truth; the conversation card, the header pill, the tab title and the toast store nothing. Electric syncs it. You see your own runs; branch and repository scopes come with 0009's watches.
- **New `@smthrs/ui` pieces:** `AgentStatusPill` (with a needs-you count) and `agentStatusTitle(base, count)` for the tab title, on 0009's `ToastStack`.
- **Phases:** 1, this slice: the states, `run/report`, `agent/ask`, `run/answer`, `run/deliver`, the `runs` table and shape, the card, the pill, the title and the needs-you toast, synced. 2: browser notifications by consent, a failed toast, waiting on rate limits and remote flows. 3: Steer, Inspect into 0014, and any member answering on a shared branch.
- **Mock:** `apps/mvp/docs/design/agent-status/agent-status.html`, with 24 screenshots: working, waiting, needs you, approval, answered and failed, each light and dark at desktop and phone width.

The brief, from the lead (06:43:04):
- **States:** working, needs you (a question or an approval), waiting on something external, failed and done.
- **Where they show:** the conversation, the tab title, the header, the run row, and other tabs and devices through sync.
- **How "needs you" reaches a person:** in the conversation, a toast with Answer, and a browser notification with consent. Answering or steering resumes the agent's durable run.
- **One system, not two:** it maps onto decision 0009 (scoped toasts, "Needs you", failures that persist, the 300 ms rule, run rows through the outbox). Deep run inspection is [flow debugging](flow-debugging.md) (0014); this is the person-facing layer.
- **Copy:** a pill, a count or a picture, not a sentence (MINIMAL TEXT).

**Step 1, design:** `apps/mvp/docs/decisions/0015-agent-status.md` (status: proposed) and a self-contained HTML mock of the main states, light and dark, desktop and phone, with screenshots, in `apps/mvp/docs/design/agent-status/`.

**Step 2, first slice:**
- The agent reports a typed status as a durable step.
- The conversation and the header show it.
- A needs-you toast offers Answer, and answering resumes the run.
- It syncs to other tabs and devices.
- Reusable pieces go in `@smthrs/ui`; the app's code goes in `src/features/status/**`.

**Proof:** unit tests at 100%, and a real-browser e2e with a GIF: the agent asks a question; needs-you shows in the conversation, the header and a toast; the person answers; the agent continues. A scripted needs-you path through dependency injection is allowed, with one live case. Then typecheck, `importRules`, `pnpm docs:sync` and `pnpm docs:check`.

Prior art: the old app's Needs-you surfaces, cards, toasts, shell rail and `RunTraceCard` in `apps/app/src/mainview`; mvp.md §6.4 and §6.14 (Needs you, Answer and Steer); `@smthrs/ui`'s `StatusPill` and toasts; the harness's `HumanTask` and `EventSink` signals.

## Why

Will, 06:42:01 on 2026-10-20: "I think the old one and our smithers agent has ability to give status updates like whether the thing needs help or not we should have a designer figure out how to design that into app and get that into app".

## State

- 06:42:01 on 2026-10-20: Will's request. 06:43:04: the lead started the designer and builder.
- 06:51:37: `src/features/status/prototype.test.ts` is on disk, the folder's only file.
- By 06:55: no `0015-agent-status.md`, no `apps/mvp/docs/design/` folder and no mock. No report.
- **06:58:01: decision 0015 written (status: proposed).** 06:59:02 to 06:59:36: the mock and its 24 screenshots in `apps/mvp/docs/design/agent-status/`.
- 06:59:58: `src/features/status/prototype.test.ts` is gone; the folder is empty at 07:03. No report.
- 07:00:18 to 07:02:11 on 2026-10-20, on disk: `@smthrs/ui` `src/agent-status/` (`agentStatus.ts`, `AgentStatusPill.tsx`, `NeedsYouCard.tsx`, `ToastStack.tsx`, `agentStatusCss.ts`, `index.ts`) and `tests/agent-status.test.tsx`.
- **07:06:41: migration `0013_runs.ts`**, decision 0009's `runs` table as 0015 first needs it: one row per agent run, keyed by its execution id, with `status` (`working`, `waiting`, `needs_you`, `failed`, `done`), `waiting` (`turn`, `input`, `approval`), the latest question and its answer, and a `version` per question. `launched_by` is the asker: "only they may write or answer the row, and the shape syncs only their rows, without the column", the same rule as `messages.asked_by` ([Fable review 2 fixes](fable-review-2-fixes.md), P2-1).
- 07:06 to 07:16: `src/features/status/` (`contract.ts`, `schema.ts`, `api.ts`, `reporter.ts`, `flows.ts`), `worker/Runs.ts` and `Runs.test.ts`. The registry (07:14:12) adds `agent/ask` (the agent asks the person), `run/answer` ("Only the person answers what the agent asks them") and `run/deliver` ("The device that holds a run delivers an answer already recorded; nobody runs it by hand").
- Not yet: `docs/features/agent-status.md`, which the migration cites; an e2e, a GIF and a report.
- 07:59:09 to 08:02:18 on 2026-10-20, on disk: `src/features/status/flows.ts` declares `agent/ask`, `run/answer` and `run/deliver`; `queries.ts`; tests `status.test.ts`, `reporter.test.ts` and `api.test.ts`. Kept out of landing round 2 at 07:53:57 as still in flight ([land to main](land-to-main.md)).
- Not yet by 08:07: `docs/features/agent-status.md`, an e2e, a GIF or a report.
- 08:09:03 to 08:12:05 on 2026-10-20, on disk: `src/features/status/` `api.ts`, `flows.ts` and `store.ts` (08:09:03), tests `api.test.ts` (08:10:19) and `faults.test.ts` (08:11:23), and `worker/Runs.test.ts` (08:12:05).
- **About 08:15 on 2026-10-20: the Claude usage limit stopped the builder** ("Design + build agent status indicators", 15:14:20Z) with every other Claude agent, unreported. The limit reset at 10:40.
- **10:42: the lead resumed it** from where it stopped ("agent status"). Not yet by 10:44: `docs/features/agent-status.md`, an e2e, a GIF or a report.
- 11:42:48 on 2026-10-20, the lead: agent status wasn't reported stopped by either weekly limit, so it kept running.
- **11:50:47 on 2026-10-20, on disk, every file in the same second (each born and modified then; best guess copied in from another workspace in one step):**
  - decision 0015 rewritten: "Status: proposed (2026-10-20); phase 1 built";
  - the new `docs/features/agent-status.md`;
  - the new `e2e/status.spec.ts`: the scripted agent asks; the card, header, toast and title show it on two devices; the second device answers from the toast;
  - `src/features/status/`: 14 modules and tests, plus `components/` `HeaderStatus`, `NeedsYouToasts`, `AnswerStatus` and `StatusContext`;
  - `worker/Runs.ts` and its test, and `src/test/scriptedAgent.ts`;
  - the flow registry and declarations: they register `app/agent/ask`, `run/answer` and `run/deliver`, and still hold `app/navigate`, `branch/track` and `terminal/open`.
- 11:51:00: `src/features/status/contract.ts` changed again.
- Not yet by 11:55: a recorded run of `status.spec.ts`, a GIF or a report. Status stays `in-progress` until the e2e passes.
- 12:07 on 2026-10-20 (the lead to Will): the slice waits its turn for the shared test lock before its browser test. 12:14: a full test suite took the lock at 12:13 ([dev stack hygiene](dev-stack-hygiene.md)). No result yet.
- 12:16:10 (the lead): the browser test started. 12:21:16 on disk: `docs/design/agent-status/status-needs-you.gif`; 12:21:57: `NeedsYouToasts.tsx` and `src/screens/app/AppShell.tsx` changed; 12:22:28 to 12:22:39: decision 0015, `docs/features/agent-status.md`, the mock and 20 screenshots (`docs/design/agent-status/screenshots/`, six states, light and dark, desktop and phone) rewritten.
- 12:23:00 (the lead): agent status is rerunning its browser test, then makes its GIF. No result or report by 12:23. Status stays `in-progress` until the e2e passes.
- 12:24 to 12:45 on 2026-10-20, on disk, unreported: `docs/design/agent-status/status-needs-you.gif` remade at 12:43:36; decision 0015 (still "proposed; phase 1 built"), `docs/features/agent-status.md`, the mock, `NeedsYouToasts.tsx` and `src/screens/app/AppShell.tsx` changed at 12:44:25; `e2e/status.spec.ts` changed at 12:44:35. No passing run or report on record by 12:45. Status stays `in-progress`.
- **12:57:25 on 2026-10-20, the builder reported phase 1 done; the lead to Will:** "Agent status is built, and you can see the run's state on both devices. A run reports working, waiting, needs you, failed or done. When it needs you, it shows a card under the answer, a pill in the header, a toast with an Answer button, and a count in the tab title. You can answer from either device."
  - Design: `docs/design/agent-status/agent-status.html`. Recording: `docs/design/agent-status/status-needs-you.gif`.
  - Tests: the scripted two-browser e2e (`e2e/status.spec.ts`) passes. The live-model e2e passed once, then failed twice on Cerebras rate limits ([Cerebras rate limits](cerebras-rate-limits.md)).
  - Bug, open: reopening a tab while the agent waits on a question makes one extra model call. "A saved model step should replay without calling the model again, so it goes into the next review round" ([model step](model-step.md), [code reviews](code-reviews.md)).
  - "It's queued for the next commit to `main`." Round 2, pushed at 13:04:55 (`c9d1e0c5ed`), held SDK and docs paths only; `src/features/status/`, migration `0013_runs` and decision 0015 are still uncommitted at 13:06 ([land to main](land-to-main.md)).
- **Status moved from in-progress to done** on the 12:57 report: the scripted e2e passes and its GIF is recorded.
- **13:09 to 13:15 on 2026-10-20: the live-model failures may not have been Cerebras.** The local dev server had spent its daily model budget (1,022,891 of 1,000,000, about half killed runs' reservations), which also answers 429; the lead raised it to 10,000,000 at 13:13, and the [message controls](chat-message-controls.md) live-model e2e passed at 13:15:50 ([Cerebras rate limits](cerebras-rate-limits.md), [dev stack hygiene](dev-stack-hygiene.md)). This note's live-model e2e has no rerun on record by 13:17.

## Next

From 13:13 on 2026-10-20: as below, plus a rerun of the live-model e2e on the raised dev budget, to tell a budget 429 from a provider 429.

Until 13:13 on 2026-10-20 the next step was, from 12:57 on 2026-10-20: the lander commits phase 1 in its app round ([land to main](land-to-main.md)); the next review round takes the extra model call on a reopened tab. Phase 2 (browser notifications by consent, a failed toast, waiting on rate limits and remote flows) has no builder.

Until 12:57 on 2026-10-20 the next step was, from 07:16 on 2026-10-20: phase 1's e2e with its GIF, `docs/features/agent-status.md`, then the builder's report. Will can open the mock now.

Until 07:16 on 2026-10-20 the next step was, from 07:03 on 2026-10-20: the builder builds phase 1 of 0015, with its e2e and GIF. Will can open the mock now.

Until 07:03 the next step was: The designer writes 0015 and the mock, opens the mock, then builds the first slice. The tracker links the mock's path here when it exists.

## Questions for Will

0015 says none block this slice. Two defaults the designer settled, which Will may override:
- The needs-you toast shows even while the question's card is on screen, because Needs you must not be missed.
- Only the asker answers for now; others in the conversation see nothing new until shared branches exist ([branch sharing](branch-sharing.md)).

Until 07:03: None yet. Will reviews the mock when it opens.
