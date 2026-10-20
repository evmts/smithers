---
title: Agent evals (feature 3b)
status: in-progress
area: app
owner: evals builder (Claude Opus), started by the lead at 13:22:43 on 2026-10-20; unreported by 13:24. Until 13:22: unassigned (designed in 0004, accepted 22:35 on 2026-10-19)
updated: 2026-10-20
links: [agent-jev.md, ../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../rules.md, model-endpoint.md, agent-ui-rendering.md, slash-commands.md, navigate-flow.md, web-page-flow.md, flow-authoring.md, agent-status.md, dev-stack-hygiene.md, decisions-for-will.md]
---

## What

Evals that check the agent does the right thing when asked: set the theme, ask through a form, render the repo view, refuse unsafe output, and more. They run on the SDK's eval and scorer packages, live against the model locally and as recorded-model replay in CI, with a committed baseline. Unsafe output has zero tolerance.

From 13:22 on 2026-10-20, the first suite (best guess from the builder's brief): about 20 small cases against the real agent flow and the real model roles (`agent`, `renderer`, `judge`) through the metered endpoint. They score what the app ships today: answering, slash commands, `app/navigate`, `app/web/open`, flow creation (`flow/new`), agent status asks (`app/agent/ask`) and the views it renders. One command runs it (`pnpm eval` or similar), writes the results as an artifact, and a baseline run is recorded in the docs. A full run stays well under 200,000 tokens, and the report states its cost.

## Why

Will: "We want to start building evals that test that the agent does the right thing when asked questions as well".

## State

- Designed in decision 0004 (proposed). Nothing is built.
- Planned under `apps/mvp/evals/`, after the agent's first slice.
- 22:34 to 22:35 on 2026-10-19: decision 0004 is accepted. Evals decide when the `renderer` role changes model; each role (`agent`, `renderer`, `judge`) is an admin setting on the [model endpoint](model-endpoint.md).

- 23:01: V1+V2 started the views SDK ([agent UI](agent-ui-rendering.md)). Evals are 0004's V4, which waits on the browser agent and the [model endpoint](model-endpoint.md).
- 06:41:24 on 2026-10-20: Will asked that the agent have Jev. That is the agent using the judge, a different job from these evals of the agent; it has its own note, [agent Jev](agent-jev.md).
- 13:19:52 on 2026-10-20: the lead's list of work after the current agents finish puts agent evals under "Your feature list, not started yet".
- 13:21:12: asked whether any of it can start in parallel, the lead named agent evals first among four that can start now: "its own `evals/` code; it only calls the model endpoint".
- **13:21:41: Will: "start the ones that can start now we are trying to ship faster".**
- **13:22:43: the lead started the evals builder** (Claude Opus) on the rules in scratchpad `final/BUILD-COMMON.md`. Its brief adds Will's standing rules: the agent acts and never instructs ("you can…" steps fail); evals are real-tier with no mocked models; a keyless judge runs on the subscription through `EvaluatorBackup.fromModel`. Prior art: the repository's `evals/` (agent, authoring, recommend, review-seeded-bugs) and the Jev evaluator in `docs/libraries.md`. It may touch the chat store, `worker/Chat.ts`, `boot.ts`, `main.tsx` or the registry only for a seam, and must say so. The local dev budget is 10,000,000 tokens a day ([dev stack hygiene](dev-stack-hygiene.md)).
- 13:23:33, the lead to Will: "about 20 cases against the real agent and models, with a one-command runner".
- **Status moved from todo to in-progress.**

## Next

From 13:22 on 2026-10-20: the builder's report (under 15 lines): the cases, judges and thresholds; the one-command runner; the recorded baseline and its token cost; the `docs/libraries.md` entry used; any seam it added to shared app files.

Until 13:22 on 2026-10-20 the next step was: write the first eval (set the theme) with the walking skeleton of [flows and the agent](flows-and-agent.md).

## Questions for Will

None.
