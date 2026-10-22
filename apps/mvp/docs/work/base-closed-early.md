---
title: Stop TODO descendants when their base closes
status: done
area: app
owner: codex-base-closed-early
updated: 2026-10-22
links: [../decisions/0016-todos-and-the-stack.md]
---

Production dogfood #4432: cancel descendants through the durable engine before publishing, hold queued successors, and retry on an open base. Builds on a97b3e7f. Library catalog: @smthrs/flow for durable actions and cancellation; @smthrs/integrations for GitHub writes. No polling loop.


Implemented standalone durable `todo/InvalidateBase` with persisted descendant discovery, engine cancellation and fenced settlement, then independent PR cleanup. Admission records the base before Begin and blocks projected closes synchronously. Migration 0045 preserves historical ancestry and queued Retry's new-base intent. Existing Drop plans are unchanged.

Regressions cover drop and webhook during implementation, queued and delayed admission, historical close delivery, transitive ancestry after Retry, immediate and lane-delayed Retry, same-report lane release, published-descendant 403/503 cleanup, and held work behind a failed predecessor.

Validation: Latitude 241/241 tests across ten suites, full app typecheck and importRules passed. Coverage disabled for the selected-suite run; no full-coverage claim. Astra and Fable re-reviews found no blocking findings after fixes. Docs sync/check left to the lander as instructed. No push.
