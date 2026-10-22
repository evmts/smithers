---
title: Repair issue credential authority and cached-access boundaries
status: in-progress
area: app
owner: Opus issue-credential security builder assigned by lead
updated: 2026-10-21 14:35 PDT
links: [issues.md, agent-run-credentials.md, device-ownership-and-queued-authority.md, code-reviews.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 14:35 PDT

**What:** Preserve current credential and repository-access boundaries.

**Why:** Cached rows and notifications must not bypass revoked access.

**Current state:** At 14:30 four fixes are reviewed by Astra and Fable, pass on Latitude and are queued: no saved-credential renewal by agents, no device credentials in queued writes, refusal hides cached issues, notifications recheck access. At 14:33 the lead corrects the E2E plan: production syncs only a public repository and cannot demonstrate denial.

**Next step:** Land and deploy fixes; prove refusal on the builder’s own stack with an injected faulty Effect service returning 403. Keep real private-repository staging as a later infrastructure workstream. No refusal browser receipt yet.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 12:34–14:34 PDT on 2026-10-21, session 6253ecf2. Automated notifications, tool records and generated summaries excluded. Current rulings and queue answers prevail over historical briefs/designs and planning docs. Product receipts are lead-reported; this pass verifies the maintainer-site build only. Existing engineering ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 12:28 PDT

**What:** Repair credential, cached-access and notification authorization.

**Why:** Saved credentials and watched repositories must not bypass current access.

**Current state:** The three original credential/cache findings remain assigned. At 12:04 the lead also assigns notifications delivered without rechecking repository access and re-published release tags failing to refresh notifications. No completed fix receipt is reported. The builder resumed at 12:27.

**Next step:** Finish authority-safe durable writes and cache denial handling; add access-revocation and repeated-release notification regressions, then land before human review.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 10:28–12:28 PDT, session 6253ecf2; rulings and queue answers govern over historical briefs, designs, decisions, proposals, TODOs and rules. Product results are lead-reported. Existing engineering ownership is retained; Codex curates tracker documentation and validates the site build.

## Earlier tracker history (retained)


**What:** Repair the three confirmed issue-credential security findings.

**Why:** Saved authority and device caches must not bypass current authorization or expose renewable credentials.

**Current state:** At 11:53 the lead assigns a new Opus builder: renewal uses saved authority before bearer-only writes, queued writes persist renewable credentials in plaintext on the device, and denied access leaves an issue visible in the local cache. No repair or completed security validation is reported.

**Next step:** Fix the credential lifecycle and cached-data boundary through durable SDK services, retain old-code-failing regressions for all three findings, then land before sending the slices to Will. Known-insecure behavior must remain off under the trust-boundary ruling.

**Open questions for Will:** None; the engineering owner resolves the design and validation.

History: Added by Codex tracker from script-filtered lead replies through 11:54 PDT in session 6253ecf2. Current rulings and queue answers govern. Implementation ownership is recorded above; Codex owns documentation curation. Product results are reported evidence, not tests run by this tracker.
