---
title: Hold dependent TODOs and wake published runs
status: in-progress
area: app
owner: codex-todo-rebase22
updated: 2026-10-22
links: [dogfood-loop.md, todos-and-stack.md, ../decisions/0016-todos-and-the-stack.md]
---

Fix admission after a failed predecessor and replace merge polling with durable webhook waits.
Library catalog: @smthrs/flow for durable waits; @smthrs/integrations for GitHub.

Admission: `fill` stops at the first failed predecessor. A person dropping it releases the queue. Real Postgres regression failed before the fix; Latitude stack writer and pure suites pass (48 tests).

Extended admission coverage: unmerged close fails queued successors `base_closed`; missing base branches refuse main fallback. The Latitude TODO, stack and webhook suites pass 160 tests. Rebased retry recovery now uses the real stack Retry operation.
