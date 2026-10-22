---
title: Preserve historical cache-policy scope decoding
status: in-progress
area: sdk
owner: Codex Sol repair job assigned by lead; Codex tracker owns note
updated: 2026-10-21 16:04 PDT
links: [agent-review-finding-repairs.md, ci-parity-cache.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 16:04 PDT

**What:** Keep historical workflow and global cache scopes readable.

**Why:** Persisted history must survive SDK upgrades.

**Current state:** At 14:41 the lead reports planner topology and historical cache-policy compatibility fixes queued for landing. This supersedes the earlier assignment-only state. The later durable-effects landing does not identify this separate fix, so its landing remains unconfirmed.

**Next step:** Collect this specific repair’s regression, review and landing receipts; verify both old scope values remain decodable.

**Open questions for Will:** None newly identified; unresolved questions in the retained history remain open.

Evidence: script-filtered user text and lead assistant replies from session 6253ecf2, approximately 14:03–16:03 PDT on 2026-10-21. Tool records, relayed agent messages, automation prompts and compaction summaries excluded. Rulings and queue answers prevail over shared briefs, panel designs and older planning docs. Product checks are lead-reported; this refresh verifies the maintainer-site build. Engineering ownership retained; documentation reconciliation by Codex.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 14:17 PDT

**What:** Decode historical cache-policy scope values without losing saved history.

**Why:** Existing persisted history must remain readable.

**Current state:** At 14:08 the lead confirms plan/src/CachePolicy.ts rejects historical workflow and global scope values. A Codex Sol fix is assigned; no completion or landed revision is reported.

**Next step:** Restore backward decoding with recorded-history regressions for both scopes, preserve current writes, and collect review/landing receipts.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies in session 6253ecf2, approximately 12:16–14:16 PDT on 2026-10-21; automated notifications, relayed agent reports and tool blocks excluded. Rulings and queue answers prevail over historical briefs/designs and docs. Product receipts are lead-reported; tracker verification is the maintainer-site build. Implementation ownership is retained; Codex curates documentation.
