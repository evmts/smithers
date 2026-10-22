---
title: Isolate production test conversations
status: in-progress
area: app
owner: production E2E builder assigned by lead
updated: 2026-10-21 12:46 PDT
links: [production-e2e.md, personal-chat-draft-isolation.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 12:46 PDT

**What:** Keep production asking tests in the test account’s own conversation.

**Why:** Automated questions must stay out of Will’s home conversation.

**Current state:** At 12:39 the lead reports production chat questions passing in the test account’s own conversation, alongside branch conversation and views. A broader harness defect sends every device test to the branch page; it must restrict that behavior to tests declaring ownConversation. This is live isolation evidence, not a completed full-suite receipt.

**Next step:** Retain the passing private-conversation receipts and fix device routing without reintroducing shared-home writes; finish the full production suite.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, approximately 10:44–12:44 PDT on 2026-10-21, session 6253ecf2; synthetic notifications, relayed agents and tool blocks excluded. Rulings and queue answers govern over shared briefs/designs and historical decisions, proposals, TODOs and rules. Product receipts are lead-reported; Codex curates documentation and validates the site build. Existing execution ownership is retained.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 10:44 PDT

**What:** Keep production asking tests in the test account’s own branch conversation.

**Why:** Automated tests must not write into Will’s home conversation.

**Current state:** At 10:38 the lead reports three tagged test questions had entered the home conversation before a block was added. Production asking tests can no longer post there; they target the test account’s branch conversation and remain blocked until its clone works. The first full run skipped asking tests. No complete live isolation receipt yet.

**Next step:** Prove account-scoped conversation isolation after clone recovery, then restore asking tests without posting to the shared home.

**Open questions for Will:** None. Existing access, Neon, Telegram and review-routing decisions are settled.

Evidence: script-filtered user-typed messages and lead text replies in session 6253ecf2 through 10:43 PDT; current rulings and queue answers through 10:31 PDT. Product results are lead-reported; this tracker validates the site build only. Implementation ownership is unchanged; Codex curates these notes. Later evidence supersedes retained history.

## Earlier tracker history (retained)


**What:** Run production asking tests in the test account’s private conversation.

**Why:** Test questions must not enter Will’s home conversation.

**Current state:** At 10:32 PDT the lead reports live chat tests posted tagged questions into the shared home conversation. The builder is moving them to a private conversation; the full production run skips asking tests until this lands. The initial live run had 10 passes and 8 skips, not a full-suite pass.

**Next step:** Land account-scoped conversation selection, prove isolation through the real production boundary, and restore asking tests with retained receipts.

**Open questions for Will:** None.

Evidence: lead’s text reply at 10:32 PDT, extracted by script from session 6253ecf2; TEST-6 and current rulings apply. Codex tracker curates this note; the production E2E builder owns implementation. No product test run by this tracker.
