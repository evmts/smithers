---
title: CI parity: run a repository flow by hand with inputs
status: todo
area: sdk
owner: none
updated: 2026-10-20 22:50 PDT
links: [../proposals/ci-cd-parity.md, ../features/flows.md, flow-authoring.md]
---

## What

Run a repository flow from its page or `/flow.run`, with a form drawn from its payload schema.

## Why

29 live workflows take `workflow_dispatch` inputs: strings, booleans, choices and defaults. A person's flow takes one string today ([flows](../features/flows.md) line 192).

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

`flow/run { repo, name, ref, input }`, admitted by the route for a Member and up (or the trigger's own minimum). The form is `FlowFormView` (`@smthrs/views`) over the payload's JSON Schema, with defaults and choices kept. The run starts at the head of the chosen branch.

## Disposition

Build now, 9 of 18. Matrix row 8. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).
