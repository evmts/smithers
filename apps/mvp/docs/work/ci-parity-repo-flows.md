---
title: CI parity: run a repository's own flows
status: in-progress
area: sdk
owner: Codex GPT-6.1 Sol (ci-spine)
updated: 2026-10-23 PDT
links: [../proposals/ci-cd-parity.md, ../features/ci.md, ../decisions/0017-everything-is-a-plugin.md, ../decisions/0014-flows-authoring-debugging-and-home-view.md, everything-is-a-plugin.md, personal-code-flow-sandbox.md, flow-authoring.md]
---

## Built, 2026-10-22 (the CI spine's slice 3)

- `repo/Run { run, repo, flow, sha, ref, event, secrets }` on `FlowExecution` (`worker/ci/RepoFlow.ts`): `repo/Plan` reads `.smithers/flows/<flow>/flow.ts` at the commit as the App and plans it in a QuickJS realm (`worker/ci/Realm.ts`); its `repo/Jobs` child runs every planned job as a `ci/job` and reports `smithers/<flow>` on the commit ([CI on Smithers](../features/ci.md#repository-flows)).
- The realm: sucrase strips types, QuickJS (the agent's build, `worker/AgentSandbox.ts` `variant`) evaluates against `Flow.make`, `Node.all`, `CiJob.make` and an inert `Schema`, with memory, stack and step bounds; proven in local workerd.
- **Triggers are not a `Flow.make` literal.** Ruling FLOW-10 approves flows-as-code-api.md §5.7: "a flow file never says when it runs"; triggers are bindings in the repository's plugin manifest. So `Flow.make` gains no `triggers` option and discovery reads no flow's source: a trigger names a flow, and the flow is found at its directory ([triggers](ci-parity-triggers.md)).

**Not built:** activation as a recorded snapshot (`plugin/refresh`) and "Merged · not active" (triggers are read from the default branch's head when an event arrives); starting a repository flow by hand; imports between a repository's flow files; combinators beyond `Node.all`. Known cost: QuickJS's native string builders (`"x".repeat(1 << 20)`) run without polling the step budget, so a hostile flow can spend seconds of the Durable Object's CPU before the memory bound stops it; Cloudflare's CPU limit bounds it.

## What

Discover `.smithers/flows/<name>/flow.ts` at a commit, activate it when a person merges it, read its `triggers` literal without running it, and evaluate its body in the QuickJS realm on `FlowExecution`.

## Why

Will asked for CI as "flows typescript configs running on smithers cloud" (FLOW-8). Repository flows aren't built: no discovery, activation or host for repository code ([flows](../features/flows.md) line 202). Decision 0017 slice 5 owns the realm flow host and `plugin/refresh`.

## Repositories

Smithers, Tevm, Effect: every ported workflow.

## Smallest slice

`Flow.make` gains a `triggers` literal, lowered into annotations like `capabilities` and `effects`, so `ModuleFlow` reads it from source. `plugin/refresh` records the default branch's flows and triggers in one snapshot; a flow that fails its checks stays `Merged · not active`. A person starts one repository flow by hand; the realm builds its graph, the Durable Object runs it, and its only machine action is `ci/job`. This amends 0017 §5 for a repository's own flows (proposal, Design 1).

## Disposition

Build now, 3 of 18. Matrix row 10. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
