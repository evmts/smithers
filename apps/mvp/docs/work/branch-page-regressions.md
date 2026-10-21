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
