---
title: Preserve production configuration on every deploy
status: in-progress
area: infra
owner: Lead and deployment builders; Codex tracker curates note
updated: 2026-10-21 21:44 PDT
links: [smithers-sh-cutover.md, private-hosted-infrastructure.md, h2-model-transport.md, production-e2e.md, github-source-of-truth.md]
---

**What:** Use the canonical private deployment environment for every production deploy and verify recovery from the incomplete deployment.

**Why:** A one-off wrapper omitted production configuration; deployment transport also failed during the hostname cutover.

**Current state:** At 21:40 the lead reports production lacked the configured daily model budget, webhook secret and Telegram alerts from 21:05–21:26. The hostname deploy restored them. The lead deleted the one-off wrapper and restricted shared deploy rules to the standard wrapper. That wrapper now applies HTTP/1.1 automatically after the cutover's HTTP/2 failure. These are reported mitigations; no independent post-change deploy or webhook catch-up receipt is present.

**Next step:** Verify subsequent deployment preserves configuration without printing values, and confirm GitHub reconciliation catches up on deliveries potentially refused during the window. Retain the transport regression in the owning SDK workstream; deployment-specific implementation stays private.

**Open questions for Will:** None.

Evidence: script-filtered lead text at 21:38–21:40 PDT on 2026-10-21. Existing SDK transport decision 0019 explains the related Node transport failure. No secret values or private paths recorded.
