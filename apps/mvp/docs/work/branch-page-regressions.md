---
title: Branch page production regressions
status: in-progress
area: web
owner: Codex
updated: 2026-10-21
links: [../features/branch-workspace.md, ../features/flows.md]
---

Fix the missing connection status, unset initial theme, and offline branch chrome.
Each fix gets its own commit and a local regression run against both old and fixed code.
Production e2e, deployment, pushing, and moving main are outside this work.

Library catalog: reuse `@smthrs/ui` for the connection pill and branch controls,
`@smthrs/effect-tanstack-db` for state, and TanStack Router for route entry.

Connection (`c2a28622cea0`): the header lacked the pill, which also read only the
home queue. The regression fails with the three original files and passes with
the fix (1 test): offline status, home and branch queues, and reconnection.

Theme: the bootstrap only painted a stored preference. The new first-paint cases
fail on the original index.html for both system modes. Startup now resolves a
mode before any route opens, without saving a system default as a preference.
First paint and the existing theme store/flow suites: 11 passed. The first-paint
matrix covers both system modes, valid/invalid/missing preferences, and blocked storage.
