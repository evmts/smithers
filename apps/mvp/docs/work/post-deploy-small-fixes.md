---
title: Post-deploy small fixes
status: blocked
area: app
owner: sol-small-fixes
updated: 2026-10-21
links: [../features/flows.md, ../features/notifications.md]
---

Close the unit coverage gaps, expose notification counts to screen readers, scope repository navigation assertions, seed late-joining devices through the real API, and inject the flow registry as an Effect service. Validate each change through the real test boundaries. Library catalog entries: @smthrs/flow, @smthrs/platform-browser, @smthrs/effect-tanstack-db and @smthrs/ui.

Five ordered commits are prepared for the lander. The registry is injected into dispatch, credentials and the agent catalog using Effect 4's Context.Service tag and Layer. No SDK package or dependency changed.

Typecheck and docs checking passed. The model-free navigation journeys (2), API-seeded late joiner (1) and slash-command journeys (3) passed with chaptered recordings and GIF checks. The status journey twice failed before its bell assertion because its notification toast never arrived.

The full unit snapshot reported 2,305 passed, 29 failed and 8 skipped. Its coverage was 99.99% lines; the subsequent passing provider-defect test covers the final line, and the merged executed reports measure 100% lines. The unchanged statement, function and branch gates remain red. Later integration selections also hit PostgreSQL connection exhaustion (53300), so this work is not complete and must not be presented as a green full-suite receipt.
