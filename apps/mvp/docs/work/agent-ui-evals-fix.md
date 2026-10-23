---
title: Repair live forms and views evals
status: in-progress
area: app
owner: Codex SOLC
updated: 2026-10-23
links: [../features/agent-evals.md, ../decisions/0004-agent-ui-codemode-and-rendering.md]
---

Investigate compose Postgres before grading agent behavior. Read failed trial
transcripts, fix the production teaching or contracts with the existing evals as
regressions, retain all checks and thresholds, and update complete baselines
through `EVAL_BASELINE=update`. Prove the five reported cases on three fresh runs,
the flows and memory evals, the full app suite at 100%, typecheck and importRules.

Library catalog: “Run an eval suite against a committed baseline” (`@smthrs/evals`,
`@smthrs/scorers`); “Run an agent loop with tools” (`@smthrs/agent`).
