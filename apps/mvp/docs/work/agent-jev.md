---
title: Jev for the agent (app/jev/classify, app/jev/evaluate)
status: done
area: app
owner: Jev agent; reported done 07:49:53 on 2026-10-20 (9 of 9 unit tests at 100% coverage, e2e with one judge call and its GIF, `ModelStep.model` added to `@smthrs/agent` with a changeset); nothing committed, so it lands in round 2 of the landing. Until 07:49: Jev agent (started 06:42:25 on 2026-10-20); by 07:12 unit tests, a passing e2e with its GIF and `docs/features/jev.md`; unreported. Until 07:01: Jev agent, started 06:42:25 on 2026-10-20 by the lead; writing `src/features/jev/**` and its registry entries since about 06:53; unreported
updated: 2026-10-20
links: [model-endpoint.md, model-step.md, flows-and-agent.md, slash-commands.md, issue-triage.md, agent-evals.md, import-rules-and-jev-lint.md, observability.md, e2e-suite-and-gifs.md, land-to-main.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../features/agent.md, ../features/model-endpoint.md, ../features/jev.md, repo-view-branches-raw-clone.md, docs-check-flow-outcome.md, library-catalog.md]
---

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

## Next

Done. It lands in round 2 of [land to main](land-to-main.md), with the `@smthrs/agent` changeset. [Issue triage](issue-triage.md) calls the same `Classifier` on the same `judge` role.

Until 07:49 on 2026-10-20 the next step was, from 07:12 on 2026-10-20: the agent's report. The tracker checks that the e2e makes one live call at most, and that the app typechecks clean in `src/features/jev/`.

Until 07:12 on 2026-10-20 the next step was: The agent writes the tests, the e2e with its GIF and the feature doc, then reports. The tracker checks the e2e uses one live call at most.

## Questions for Will

None.
