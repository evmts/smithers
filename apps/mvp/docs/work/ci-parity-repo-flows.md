---
title: CI parity: run a repository's own flows
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, ../decisions/0017-everything-is-a-plugin.md, ../decisions/0014-flows-authoring-debugging-and-home-view.md, everything-is-a-plugin.md, personal-code-flow-sandbox.md, flow-authoring.md]
---

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
