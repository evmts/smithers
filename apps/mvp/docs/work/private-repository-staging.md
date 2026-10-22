---
title: Private-repository staging for access-revocation tests
status: todo
area: infra
owner: unassigned; Codex tracker records deferred work
updated: 2026-10-21 14:35 PDT
links: [issue-credential-security.md, production-e2e.md, private-hosted-infrastructure.md, ../rulings.md]
---

**What:** Provide a staging deployment syncing a private test repository for real access-denial and revocation journeys.

**Why:** Production currently syncs only a public repository, where access is never refused; that cannot prove cached issue hiding after loss of access.

**Current state:** At 14:33 the lead records this as later infrastructure work. No staging deployment or private-repository test receipt exists. The current security builder instead proves the unhappy path locally through an injected faulty Effect service returning 403, with real happy-path infrastructure.

**Next step:** Assign when prioritized, keep deployment-specific values in the private infrastructure repository, and prove access before and after revocation through the browser and sync boundaries. Do not treat local injected-fault proof as private staging completion.

**Open questions for Will:** None now; no immediate setup or permission requested.

Evidence: script-filtered user-typed text and lead replies, approximately 12:34–14:34 PDT on 2026-10-21, session 6253ecf2. Automated notifications, tool records and generated summaries excluded. Current rulings and queue answers prevail over historical briefs/designs and planning docs. Product receipts are lead-reported; this pass verifies the maintainer-site build only. Existing engineering ownership retained.
