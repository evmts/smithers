---
title: Finish session recovery and visitor adoption
status: in-progress
area: auth
owner: Codex GPT-6.1 Sol (trackc-fix)
updated: 2026-10-22
links: [local-first-correctness.md, ../decisions/0023-device-ownership-and-queued-authority.md]
---

Restore C1 and C2 from the session builder, repair their test layers and Effect boundaries, and validate each commit independently for the lander.
Libraries: the catalog entries `@smthrs/flow`, `@smthrs/platform-browser`, and `@smthrs/effect-tanstack-db` supply durable refresh, activation and owner-scoped delivery.
