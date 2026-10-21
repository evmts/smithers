---
title: Branch page production regressions
status: done
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

Offline chrome: TanStack Router renders public destination chrome while tracking or live data
waits. Access controls and live content stay behind verified route entry;
previous branch rows cannot name the pending view or expose its terminal.
`branch.open` records a correlated tracking stage.

Library catalog: existing `@smthrs/ui` controls and
`@smthrs/effect-tanstack-db` state; existing TanStack Router for route entry.
No SDK or dependency changes.

Rebased onto `ec8a686c`. Main's `2fb38e9ddee3` correctly refuses tracking when
the forge cannot resolve its default branch. The offline fixture declared
`main` but published no `main` ref, producing an invalid HEAD advertisement
and a 503. Publish both `main` and `work`; keep every assertion unchanged.
The product's fail-closed behavior is correct.

Latitude reproduced both failed-versus-ready assertions with the invalid fixture.
With the corrected fixture and main's original router, header and actions,
both tests fail on missing chrome. Restoring the pending view passes all 41
tests in the branch screen and branch feature suites. ImportRules passes.
Full app typecheck passes on Latitude: frontend, worker, infra and evals.
No push, deployment or main movement.
