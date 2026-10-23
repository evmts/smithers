---
title: Timeline retries and ChatApi startup test budgets
status: in-progress
area: testing
owner: Codex test-budgets
updated: 2026-10-23
links: [../../src/features/timeline/engine.test.ts, ../../worker/ChatApi.startup.test.ts]
---

Preserve six real durable model attempts and safe failure conversion with a
short retry policy injected through SummarySeat. Move the 200 ms startup
performance budget to the benchmark suite; retain deterministic lazy module
loading checks in the unit suite. Uses the library catalog durable model step
and Node flow host entries (@smthrs/agent, @smthrs/flow, @smthrs/platform-node).
