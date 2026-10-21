---
title: Jev for the agent (app/jev/classify, app/jev/evaluate)
status: todo
area: app
owner: unassigned; left: re-record the eval baseline (Next). Until 00:20 on 2026-10-21: Jev walkthrough rework agent, handed to the round 4 lander (started about 20:00 on 2026-10-20, from Will's 19:52 review). Until then: Jev agent; reported done 07:49:53 on 2026-10-20 (9 of 9 unit tests at 100% coverage, e2e with one judge call and its GIF, `ModelStep.model` added to `@smthrs/agent` with a changeset); nothing committed, so it lands in round 2 of the landing. Until 07:49: Jev agent (started 06:42:25 on 2026-10-20); by 07:12 unit tests, a passing e2e with its GIF and `docs/features/jev.md`; unreported. Until 07:01: Jev agent, started 06:42:25 on 2026-10-20 by the lead; writing `src/features/jev/**` and its registry entries since about 06:53; unreported
updated: 2026-10-21 00:24 PDT
links: [model-endpoint.md, model-step.md, flows-and-agent.md, slash-commands.md, issue-triage.md, agent-evals.md, import-rules-and-jev-lint.md, observability.md, e2e-suite-and-gifs.md, land-to-main.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../features/agent.md, ../features/model-endpoint.md, ../features/jev.md, repo-view-branches-raw-clone.md, docs-check-flow-outcome.md, library-catalog.md]
---

## Tracker reconciliation — 2026-10-21 00:24 PDT

**What:** Let the agent choose Jev implicitly and show its judge step.

**Why:** Jev behavior needs real-model evidence and a reproducible eval baseline.

**Current state:** At 00:14 the lead reports 4/4 e2e runs and 7/7 eval trials choosing Jev without prompting, with a chaptered recording and fixes for raw verdict objects and an overly strict brevity judge. At 00:18 it confirms Will already approved the merged check. The full eval baseline remains unre-recorded because three ask cases stall.

**Next step:** Resolve the ask-case stalls and re-record the complete eval baseline after deployment; retain implicit-selection and verdict-format regressions.

**Open questions for Will:** None; do not ask Will to establish whether it works.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, latest two hours through 00:23 PDT; queue answers through 00:17 PDT; rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence, not new tracker-run tests. Execution owners retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 22:44 PDT

**What:** Let the agent select Jev naturally and show its judge step in debug flow information.

**Why:** Will requested implicit Jev selection and inspectable execution.

**Current state:** At 22:42 PDT the lead confirms an unfinished Codex edit bypassed the injected model and forced real networking. Its regression failed before the fix and passes after; Jev tests pass 10/10 and web-page tests 17/17. The landing round never contained the bad edit. The fix is handed to the lander; final Jev recording remains unproven.

**Next step:** Land the fix, retain the regression and complete the real-model walkthrough after the test pause. Track two lint errors and another bypass location after deployment.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies, approximately 20:44–22:44 PDT, session 6253ecf2; notifications and tool blocks excluded. Current rulings and queue answers (latest 19:38 PDT) prevail over historical briefs and designs. Product receipts are lead-reported; this tracker verifies the maintainer-site build. Execution owners and statuses retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 22:35 PDT

**What:** Let the agent choose Jev without an explicit request, then expose its actual judge step through debug info and the flow view.

**Why:** Will’s queue answer requires natural tool selection and inspectable execution.

**Current state:** At 22:24 the lead reports implicit Jev selection in two real-browser runs and a visible judge step. Final test/recording is unproven; most current Jev model tests time out. A new investigation checks whether the transport change bypasses injected model services and whether round 4 contains it. This is a suspected cause, not a confirmed diagnosis.

**Next step:** Fix model-service selection with a retained regression, check the landing revision, then finish the real-model recording after the pause.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead text replies from session 6253ecf2, approximately 20:35–22:35 PDT; automated notifications and tool blocks excluded. Current rulings and queue answers (latest 19:38 PDT) prevail over historical briefs and proposals. Execution ownership retained; Codex tracker curator reconciles documentation only. Product receipts are lead-reported; tracker verification is the maintainer-site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:44 PDT

**What:** Show the agent choosing Jev naturally, with debug info opening its run graph.

**Why:** Will’s 19:37 queue answer asks for implicit Jev use and visible flow evidence.

**Current state:** The lead assigned a natural classification question that never names Jev, an eval regression, and answer debug info opening the existing run graph with the Jev step highlighted. The original Jev implementation remains completed history; this follow-up has no completed receipt.

**Next step:** Prove natural tool selection against the real model, retain the eval, and record keyboard-accessible debug navigation to the actual step input/output.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, approximately 17:44–19:44 PDT; queue answers through 19:38 PDT; rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest Will text and queue answers prevail. Product receipts are lead-reported; tracker validation is the site build. Existing execution ownership is preserved.

## Earlier tracker history (retained)


## What

Give the Smithers agent Jev, Smithers' judge (`Classifier` and `Evaluator` in `@smthrs/model`), as two flows it can call. There is no slash command, on purpose: the results are data for the agent, and "a slash command run would have nowhere to show them", so people ask Smithers instead. (Corrected 07:53 on 2026-10-20 from the agent's report; until then this line said "A person can run them from the slash menu too.")

```
agent: "which of these issues are bugs?"
  └─ app/jev/classify { question, items, labels? } ─▶ { verdicts: [{ verdict, confidence }, …] }   one per item
  └─ app/jev/evaluate { text, criteria }           ─▶ { verdicts: [...] }                          one per criterion
         │ one sealed ModelStep per call
         ▼
     POST /api/model/judge   (role "judge", set with admin/SetModel; metered; never a provider directly)
```

Best-guess spec, from the lead's brief (06:42:25) and the code on disk at 06:55:
- **`app/jev/classify`:** one question over up to 50 items of up to 2,000 characters each. The verdict is `yes`, `no`, or one of 2 to 10 labels the caller gives.
- **`app/jev/evaluate`:** up to 20 criteria applied to one text of up to 16,000 characters. Each verdict is `yes`, `no` or `unsure`.
- **Unsure:** a verdict stands only at confidence 0.8 for yes or no and 0.7 for a label; below that it is `unsure`.
- **Placement:** client flows in the browser engine (0011); each judgment is one durable `ModelStep` through the server's metered endpoint, so a resumed run never pays twice.
- **Agent catalog:** both are `modelInvocable`. The description tells the agent to use Jev for every decision over a list instead of deciding itself.
- **Telemetry:** the `jev.judge` span, `smithers_jev_judgments` by outcome and `smithers_jev_verdicts`, with counts and verdict codes only, never an item, question, label or text.
- **Proof the brief asks for:** unit tests at 100% with a scripted model behind the endpoint, one real-browser e2e (ask the agent to classify three short items and see per-item verdicts), typecheck, `importRules`, `pnpm docs:sync`, `pnpm docs:check`, and `docs/features/jev.md` plus `agent.md`.

Not to be confused with [agent evals](agent-evals.md), which judge the agent; here the agent uses the judge. [Issue triage](issue-triage.md) calls the same `Classifier` on the same `judge` role.

## Why

Will, 06:41:24 on 2026-10-20: "The agent in smithers should have access to jev".

The library catalog's row "Decide inside a flow: classify, filter, rank, yes or no over items" points at `Classifier.make` with the host's `Evaluator`. The model endpoint already has a `judge` role ([model endpoint](model-endpoint.md)).

## State

- 06:41:24 on 2026-10-20: Will's request. 06:42:25: the lead started the Jev agent.
- **06:53 to 06:55:** on disk, `src/features/jev/contract.ts`, `flows.ts`, `metrics.ts` and `steps.ts`. Both flows are declared, registered in `src/flows/registry.ts` and `declarations.ts`, and wired to the `judge` seat in `src/flows/registrations.ts`.
- No tests, e2e or `docs/features/jev.md` yet, and no report.
- 06:42:50: the lander's brief keeps `src/features/jev/**` out of its first landing ([land to main](land-to-main.md)).
- 07:01:32 on 2026-10-20: `src/features/jev/jev.test.ts`. At 07:07:38 the engine and hosts agent named app type errors in "other agents' files (`jev`, `repo`)".
- 07:10:47: `e2e/jev.spec.ts`, one case, "jev: asking which items … answer gives each a verdict", passed at 07:11:18 (scratchpad `jev-results`). GIF `jev-jev.gif` at 07:11:37.
- **07:12:04: `docs/features/jev.md`.** `app/jev/classify` takes a `question`, 1 to 50 `items` and optionally 2 to 10 `labels`, and answers one verdict per item: `yes`, `no`, a label or `unsure`. `app/jev/evaluate` takes one `text` and a rubric of 1 to 20 `criteria`. Each verdict carries a `confidence`; under 0.8 for yes or no, or 0.7 for a label, it reads `unsure`. Each judgment is one sealed `ModelStep` through `POST /api/model/judge`. Neither has a slash command: "a person's run would have nowhere to show its verdicts".
- No report by 07:20.
- **07:49:53 on 2026-10-20: the agent reported done.** Nothing is committed.
  - **It works in a real browser:** the agent gave a verdict for each of three items, "1: yes, 2: no, 3: yes". Each flow returns one verdict per item or criterion (`yes`, `no`, a label or `unsure`, with a confidence). Every judge call is one durable model call through `/api/model/judge`.
  - **An SDK addition:** to make the call durable it added `ModelStep.model` to `@smthrs/agent`, which turns a model and its route into a `Model` whose every call is one sealed `ModelStep.run`; `Evaluator.layerFromSeat` now judges with sealed, replayable calls. Tests, docs, the changeset `.changeset/model-step-as-model.md` and a row in `docs/libraries.md` ([ModelStep](model-step.md), [library catalog](library-catalog.md)).
  - **No slash command, on purpose:** "the flows return verdicts as data, and a slash command run would have nowhere to show them, so people ask Smithers instead. The tracker note in `docs/work/agent-jev.md` still says there is one." Corrected above.
  - **Renamed** the flows from `jev/…` to `app/jev/…`, so they pass the registry's namespace test.
  - **Proof:** 9 of 9 unit tests at 100% coverage, with a scripted model behind the real endpoint; the e2e passes with one judge call (`~/Desktop/smithers-mvp/gifs/jev-jev.gif`); `docs:sync`, `smthrs docs //packages/smithers/agent:docs` and the `docs-sync` check pass. `pnpm docs:check` failed twice with "The body of flow docs-sync could not be loaded"; the same check passed when run directly ([docs check outcome](docs-check-flow-outcome.md)). Docs: `agent.md`, `flows.md`, `observability.md` and the new `docs/features/jev.md`.
  - **Reds it names as other agents':** `importRules` (2 violations) and typecheck errors in other agents' in-progress repo files; `registry.test.ts` and `telemetry.test.ts` fail only on the `repo/*`, `agent/ask`, `run/*` and `smithers_agent_status_reports` entries other agents are adding.
- **07:49:57 on 2026-10-20, the lead to Will:** "The agent now has Jev, through two flows: classify, which gives a yes, no or label for each item, and evaluate, which scores text against a rubric." And: "There's no slash command, because its results are data for the agent. Just ask Smithers to classify or judge something."
- **Status moved from in-progress to done** on the 07:49 report. The tracker's two checks hold: the e2e makes one judge call, and the report names no type error in `src/features/jev/`.

- **About 20:00 on 2026-10-20: the walkthrough rework**, from Will's 19:52 review of the Jev recording: "I would prefer a test where we don't explicitly ask for jev but it uses jev and we should be able to see it used jev via clicking on debug info and seeing the flow view".
  - `app/jev/classify`'s description now says when to use it: whenever the person asks to sort, group, label, triage, filter or pick from a list, even without naming Jev, with the person's categories as labels. Its examples don't include the test's ask.
  - Each answer has a `Debug info` icon among its hover controls (FE-13) that opens `/app/runs/<answer id>`, the run graph the flows UI slice 1 built ([flows run graph](flows-run-graph-slice1.md)); no second graph.
  - New eval case `jev-sort`: nine issue titles to sort into bug, feature and question, Jev never named.
  - `e2e/jev.spec.ts` rewritten: the natural ask, the answer, debug info on hover, the flow view's `app/jev/classify/judge` step highlighted, its output (nine verdicts), and its Open link to the call's run with its input.
  - **20:31 and 21:15: the agent chose Jev unasked in a real browser** both times: one `/api/model/judge` call, nine verdicts, all correct (bug, feature, question three times). The 21:15 run of the draft spec passed in 1.4 min, flow view and inspector included. The run graph shows the call's step as `app/jev/classify/judge`; an action records no input, so the input is on the call's own run page.
  - **Blocked 21:40 to 21:45 by the shared checkout:** the dev app renders a blank page after the service worker's reload (no page error), and every Node agent test (`agent.test.ts`, `jev.test.ts`) hangs: `chat/Respond`'s first sealed step fails every attempt before reaching ChatApi. Both are other agents' in-progress edits (run credentials, the engine worker, boot); the journal records no cause for a failed attempt.

- **21:55 to 22:01:** two more e2e attempts failed before asking: the dev server went down, then came back with GitHub App sign-in, so the composer was hidden (signed out). Local-developer sign-in was back at 22:05, when the lead's test pause began.
- **22:25: `src/features/jev/jev.test.ts` in the shared tree:** 2 of 10 pass; every test that makes a model call times out (30 s, and 240 s for the agent's), the six that only judge included, whose code this rework didn't touch. `evals/cases.test.ts` passes 26 of 26 (19:56).

- **23:26 to 00:15 on 2026-10-21, after the pause:** `src/features/jev/jev.test.ts` 10 of 10 (the fetch fix landed), `evals/cases.test.ts` 26 of 26, `evals/judge.test.ts` 7 of 7, `e2e/frames.test.ts` 26 of 26. `e2e/jev.spec.ts` passed four times (23:26 to 23:50); the last run's video and GIF pass the frame check: `~/Desktop/smithers-mvp/videos/jev/jev.mp4` (7 chapters) and `gifs/jev-jev.gif`.
  - The recording first skipped the flow view: the page was on screen for a fraction of a second. The test now moves the highlight to the Jev step with Down, inspects it with Enter, and scrolls its nine verdicts, so the highlighted step shows. Captions named `/app/runs/…` "the home conversation"; `e2e/frames.ts` `placeOfPath` now names it "a run", with its test.
  - **Evals:** `jev-sort` called Jev in every trial, 7 of 7. One full run's trial pasted each verdict whole ("— [object Object]"): the description now gives the shape, `{ verdicts: [{ verdict, confidence }] }`, and `jev-sort` checks `readValues`; 3 of 3 since. The judge's `brief` question failed a nine-line sorted list in 1 of 3; it now counts a list as brief when the person gave a list.
  - **The baseline isn't re-recorded:** the `ask-*` cases stall `unanswered` in the shared tree, with or without this change (source-swapped at 00:08), so a full run can't reach 100% ([agent evals](../features/agent-evals.md#baseline)).

## Next

Re-record `evals/baseline.json` with a full `EVAL_BASELINE=update pnpm eval` once the `ask-*` cases answer again, then update the baseline section of `docs/features/agent-evals.md`.

Until 00:15 on 2026-10-21 the next step was: after the test pause: `e2e/jev.spec.ts` with `pnpm e2e:gifs` (replaces `jev-jev.gif`), `src/features/jev/jev.test.ts` once a Node model call answers again, then `EVAL_ONLY=jev-sort EVAL_K=3 pnpm eval` and a full `EVAL_BASELINE=update pnpm eval` so the baseline holds `jev-sort` at 100%.

Until 20:00 on 2026-10-20 the next step was: Done. It lands in round 2 of [land to main](land-to-main.md), with the `@smthrs/agent` changeset. [Issue triage](issue-triage.md) calls the same `Classifier` on the same `judge` role.

Until 07:49 on 2026-10-20 the next step was, from 07:12 on 2026-10-20: the agent's report. The tracker checks that the e2e makes one live call at most, and that the app typechecks clean in `src/features/jev/`.

Until 07:12 on 2026-10-20 the next step was: The agent writes the tests, the e2e with its GIF and the feature doc, then reports. The tracker checks the e2e uses one live call at most.

## Questions for Will

None.
