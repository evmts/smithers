---
title: Agent evals (feature 3b)
status: todo
area: app
owner: unassigned (designed in 0004, accepted 22:35 on 2026-10-19)
updated: 2026-10-19
links: [../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0003-flows-and-the-agent.md, ../rules.md, model-endpoint.md, agent-ui-rendering.md]
---

## What

Evals that check the agent does the right thing when asked: set the theme, ask through a form, render the repo view, refuse unsafe output, and more. They run on the SDK's eval and scorer packages, live against the model locally and as recorded-model replay in CI, with a committed baseline. Unsafe output has zero tolerance.

## Why

Will: "We want to start building evals that test that the agent does the right thing when asked questions as well".

## State

- Designed in decision 0004 (proposed). Nothing is built.
- Planned under `apps/mvp/evals/`, after the agent's first slice.
- 22:34 to 22:35 on 2026-10-19: decision 0004 is accepted. Evals decide when the `renderer` role changes model; each role (`agent`, `renderer`, `judge`) is an admin setting on the [model endpoint](model-endpoint.md).

- 23:01: V1+V2 started the views SDK ([agent UI](agent-ui-rendering.md)). Evals are 0004's V4, which waits on the browser agent and the [model endpoint](model-endpoint.md).

## Next

Write the first eval (set the theme) with the walking skeleton of [flows and the agent](flows-and-agent.md).

## Questions for Will

None.
