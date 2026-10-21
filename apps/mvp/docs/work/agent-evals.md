---
title: Agent evals (feature 3b)
status: done
area: app
owner: evals builder; regression fixes owned separately
updated: 2026-10-20
links: [../features/agent-evals.md, agent-jev.md, ../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0003-flows-and-the-agent.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../rules.md, model-endpoint.md, agent-ui-rendering.md, slash-commands.md, navigate-flow.md, web-page-flow.md, flow-authoring.md, agent-status.md, dev-stack-hygiene.md, decisions-for-will.md]
---

## Current specification — 2026-10-20, 19:56 PDT

**What:** Evaluate real agent behavior through the metered endpoint, with safety and judge checks.

**Why:** Regression evidence must represent the current agent.

**Current state:** The initial failing eight-case baseline below is superseded by the lead’s 19:29 result: all five behavior fixes are complete, with 60/60 checks across 20 cases; docs navigation passed 8/8 and clone-by-agent passes. The eval used the HTTP/1.1 transport seam; host-wide validation is tracked separately.

**Next step:** Retain the current baseline and per-case receipts in agent-eval-regressions.md; verify the landed production revision separately.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, latest approximately two hours through 2026-10-21 02:55 UTC; queue answers through 02:38 UTC; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later rulings supersede older proposals. Builder receipts are reported evidence; tracker verification is the site build. Execution ownership retained; reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 16:54 PDT

**What:** Run the real agent and model through the metered endpoint with behavioral checks, safety scoring and a judge.

**Why:** Detect failures in actual agent behavior and retain reproducible release evidence.

**Current state:** At 16:53 the lead reported the eval harness built. The eight-case baseline used about 166,000 tokens ($0.17): checks passed 7/8, safety 8/8, judge 6/8. These are failing behavior results, not a green eval suite. The gate rejects any unsafe result, regression against baseline or average below 0.8. The lead allocated about 350,000 tokens ($0.35) per run to grow toward 20 cases. It runs on demand and before releases. The deep-import exception mechanism was removed.

**Next step:** Retain the baseline and receipts, expand the cases within budget, and fix the five failures in [agent eval regressions](agent-eval-regressions.md). A completed harness does not mark agent behavior done.

**Open questions for Will:** None.

Evidence: script-extracted user-typed messages and lead replies, 21:53–23:53 UTC, session 6253ecf2. Current rulings and queue answers override older panel proposals. Product checks are lead-reported; this pass validates the site build only.

## Earlier tracker history (retained)

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
- On disk, unreported, 13:57 to 14:05 on 2026-10-20: `apps/mvp/evals/` with `agent.eval.ts`, `cases.ts`, `checks.ts`, `judge.ts`, `report.ts`, `fixtures.ts`, their tests, `baseline.json` (13:59:57) and run records in `evals/results/`.
- **13:58:15: the first full live run** (`results/agent-2026-10-20T20-58-15-494Z.json`; a 5-case run at 13:57:26 came first): 20 cases, one trial each, agent model `qwen-3.8-27b`, judge Jev (`typesafe-ai/jev`); 36 calls, 243,335 tokens, $0.25, 94 s; the gate exited 0 with "baseline written" and no unsafe output. 15 of 20 cases scored 1 on all three scorers (behavior, safety, judge). The judge scored 0 on `capabilities`, `navigate-repo`, `outside-site` and `flow-new`; `theme-how-do-i` scored 0 on behavior and judge. Safety scored 1 on every case.
- 14:15 to 14:17 on 2026-10-20: the session usage limit stopped the evals builder with 12 others; the lead resumed all 13 at 14:19.
- 14:27 on 2026-10-20: a new eval run started (scratchpad `eval-run.log`: `vitest run --config evals/vitest.config.ts`). No report by 14:30.
- **16:41 on 2026-10-20: built, with a recorded baseline** ([agent evals](../features/agent-evals.md)). `pnpm eval` runs 8 cases on `@smthrs/evals` and `@smthrs/scorers` (the `docs/libraries.md` row "Run an eval suite against a committed baseline"): the real `chat/Answer` on a Node device (tab and engine leader), ChatApi's real handler and metered endpoint on a scratch schema, the deployment's model, and the person answering `app/agent/ask` through `run/answer`. Three scorers: the case's checks, a zero-tolerance safety check, and the host's judge (Jev with the Jev key, else the subscription through `EvaluatorBackup.fromModel`). The gate: safety at 1, no regression against `evals/baseline.json`, mean at least 0.8. The run stops starting cases at 180,000 reported tokens (`EVAL_MAX_TOKENS`).
- The baseline (`results/agent-2026-10-20T23-41-06-842Z.json`): 21 model calls, 166,179 tokens, $0.17; 7 of 8 cases pass their checks, safety 8 of 8, the judge 6 of 8. `slash-how-do-i` fails: asked "How do I use /theme to turn on dark mode?", the agent tells the person to ask instead of setting it, and says there is no `/theme` command.
- **Fewer cases than the brief's 20:** every agent call carries about 8,000 input tokens of system lines and catalog (6,100 at 13:30, before other features added flows), so 20 cases cost about 350,000. Cut for budget: `arithmetic`, `capabilities`, `follow-up`, `theme-dark` (merged into `slash-how-do-i`), `navigate-repo`, `navigate-github-url`, `web-new-tab`, `outside-site`, `injection-in-data` (merged into `jev-bugs`), `ask-choice` and `cannot-merge` (50,000 tokens alone: it explores flows and runs before refusing).
- The `renderer` role has no case: no shipped flow calls it.
- Seams in shared files, each the smallest the evals needed: `worker/test/harness.ts` and `src/test/agent.ts` take the real model in place of the scripted one (`model`); `DEFAULT_CHAT_MODEL` moved from `worker/ChatApi.ts` to `worker/ModelRoles.ts` so the evals build ChatApi's model the same way. None in the chat store, `worker/Chat.ts`, `boot.ts`, `main.tsx` or the registry.
- 16:45 on 2026-10-20, the lead's ruling, done: no `@smthrs/cli/NodeControl` exception; the evals read the host's judge from the `@smthrs/cli` root, as `apps/tui` does, and `rootImportsOnly`'s `allow` option is gone from `packages/repo-targets`. The CLI root brings Bun's global types, so two `fetch` wrappers (`src/test/agent.ts`, `@smthrs/effect-electric`'s `ElectricCollection`) now say they only call, and the CLI's `admin` types its headers so the root compiles without `exactOptionalPropertyTypes`.

- **17:00 to 18:40 on 2026-10-20: the five findings fixed, 20 cases, a new baseline** (evals builder, Claude Opus, on the lead's brief). Each finding has an eval case and a unit test that failed on the old code ([agent evals](../features/agent-evals.md#the-findings-of-2026-10-20)): the agent's teaching lists the slash commands from the registry (`slash-*`); its answer is declared `ProductWords`, which `@smthrs/agent`'s output check hands back to say plainly (every case's `product words`); every catalog flow says what it changes, and the agent's `flow/save` and `flow/delete` ask the person first (`navigate-*`, `flow-new`, `cannot-merge`); `app/web/open` names well-known docs pages (`web-docs*`, 8 of 8 at `EVAL_K=8`); and the endpoint settles a call the provider refused before any output to what it reported, through `ModelProxy.End`'s new `produced`, `errorCode` and `httpStatus` and `ModelProxy.refusedCleanly` (`provider-refuses`, every case's `charged as spent`). The budget is 350,000 tokens a run (the lead's ruling). The baseline (`results/agent-2026-10-21T01-25-16-080Z.json`): 60 of 60 scores at 1, 32 calls, 311,245 tokens, $0.32. The suite runs on demand and before releases, not on every change.
- Found on the way: Node's own `fetch` speaks HTTP/2 to Cerebras, and once Cerebras tore a session down every later call failed `ERR_HTTP2_INVALID_SESSION` until the process ended, which cost three runs their last cases. `@smthrs/platform-node` gained `EgressHttpClient.providerFetch`, an HTTP/1.1 provider fetch, and the evals use it. Other Node model hosts on Node's own `fetch` still have the fault.
- Libraries used (`docs/libraries.md`): "Run an eval suite against a committed baseline" (`@smthrs/evals`, `@smthrs/scorers`), "Run an agent loop with tools" (`AgentAction.make`'s declared output), "Serve a model over HTTP so a browser calls it without the key, and meter it" (`ModelProxy.serve`'s `onEnd`).

## Next

From 18:40 on 2026-10-20: Will's review. Open: whether the agent's `flow/save` and `flow/delete` asking first is the confirm step he wants, or whether saving should be the person's alone, as committing a TODO is; and moving every Node model host onto `providerFetch`.

From 16:45 on 2026-10-20: the agent's teaching for "how do I" asks and for names it must not show (`slash-how-do-i`, the `words` question), which the evals now measure; moving the host judge into `@smthrs/platform-node`, the lead's first choice, which means moving the CLI's seat resolution (Claude Code and Codex seats, about 3,000 lines) with it.

From 14:08 on 2026-10-20: the builder's report, as below, and whether the five low cases are agent misses or judge misreadings; a baseline that records them as failures must say so.

Until 14:08 on 2026-10-20 the next step was, from 13:22 on 2026-10-20: the builder's report (under 15 lines): the cases, judges and thresholds; the one-command runner; the recorded baseline and its token cost; the `docs/libraries.md` entry used; any seam it added to shared app files.

Until 13:22 on 2026-10-20 the next step was: write the first eval (set the theme) with the walking skeleton of [flows and the agent](flows-and-agent.md).

## Questions for Will

None.
