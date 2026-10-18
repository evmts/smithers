---
title: Secrets through an egress proxy (feature 6)
status: todo
area: infra
owner: Panel S (Opus lead, Sol)
updated: 2026-10-19
links: [../decisions/0005-sandboxes-secrets-and-the-forge.md, ../../../../AGENTS.md, sandboxes.md, design-questions.md]
---

## What

No secret value enters a sandbox. The sandbox holds placeholders. One `Egress` Worker entrypoint intercepts all its HTTP and HTTPS traffic, checks each request against the sandbox's grant, injects credentials into headers only, and scrubs echoed values from responses. Values are sealed in Postgres under a key only the Worker holds.

## Why

Will: "Also done on side we must support secrets iron proxy style". Root `AGENTS.md`: a secret's value never appears in a card, log, trace or diagnostic.

## State

- Designed in decision 0005 (proposed). Nothing is built.
- 0005 also found the in-sandbox token from 0008 isn't needed.
- 22:45 on 2026-10-19: **all three of 0005's questions are settled** (Q1 Cloudflare at 22:41, Q2 the sandbox as a tool provider at 22:42, Q3 budgets deferred until we ship at 22:45), none about secrets. This item moves from designing to todo with [sandboxes](sandboxes.md). 0005's file status still reads "proposed". Nothing is built.
- 23:02 on 2026-10-19: the lead's board: features 5 to 7 (sandboxes, secrets, and Qwen in sandboxes) are not started; they "wait for disk space and the agent". The Mac had about 10 GB free at 23:01, and the agent's first slice depends on B1 and the [model endpoint](model-endpoint.md).

## Next

Prove it in the sandbox spike: a sentinel secret never appears inside the container, in logs or in traces.

## Questions for Will

None.
