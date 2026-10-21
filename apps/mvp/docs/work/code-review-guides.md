---
title: Code review guides and package architecture context
status: in-progress
area: process
owner: code-guide writers and queue curator assigned by lead
updated: 2026-10-21 04:04 PDT
links: [queue-recorded-revision-source.md, code-reviews.md, will-decision-queue.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 04:04 PDT

**What:** Keep code guides tied to the reviewed source.

**Why:** Avoid stale source while preserving completed guides.

**Current state:** At 03:57 PDT the lead reports 21 slices from the eight rewritten engine/flow files cut from main and ready for guides after Will answers question 945. Overall, 5,325 of 5,401 slices now carry source commits; 76 already-guided legacy slices keep checkout text. Guide writing remains paused. Recorded-commit server reads still await the paired Codex job; metadata alone does not close that work.

**Next step:** Preserve existing guides and all slices. Complete recorded-commit serving, then resume the held guide batch after the existing review-format answer.

**Open questions for Will:** Answer existing review-format question 945; no new question.

Evidence: script-filtered user-typed text and lead replies in session 6253ecf2, 02:03–04:03 PDT; automated notifications, teammate messages and tools excluded. No new user-typed direction appears in this window. Current rulings and queue answers through 01:19 PDT take precedence over shared briefs, panel designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this tracker runs only the site build. Execution ownership retained; documentation reconciled by Codex.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 03:34 PDT

**What:** Keep code guides tied to the exact reviewed source revision.

**Why:** A guide for landed code must not display stale working-copy text.

**Current state:** At 03:28 PDT the lead reports eight engine/flow rewrites landed at cf6bd457. At 03:31 it says the queue server still serves their old source from the shared checkout. New slices are held until recorded-revision serving is fixed; guide writing also remains paused on unanswered queue question 945. No queue answer authorizes skipping routine slices.

**Next step:** Retain all slices and existing guides. Fix recorded-revision source reads, then regenerate guides when Will answers the existing review-format question.

**Open questions for Will:** Existing review-format question 945 remains unanswered; no new question.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, 01:33–03:33 PDT; synthetic notifications, teammate messages and tool content excluded. Rulings and queue answers through 01:19 PDT supersede historical briefs, panel designs, decisions, proposals, TODOs and rules. Product validation and landing are lead-reported; Codex curates this documentation and runs only the site build. Execution ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 01:44 PDT

**What:** Keep code guides accurate while Will decides the review format.

**Why:** Will previously required review of every file; the newer routing proposal is still a question.

**Current state:** At 01:37 the curator corrected the routing recommendation from 70% to 55% confidence after recovering Will’s earlier every-file instruction. The question is queued at priority 945. The next 80 guides remain held; no answer authorizes skipping routine slices.

**Next step:** Preserve completed guides and hold the next batch. Re-guide the simplified engine files after their landing.

**Open questions for Will:** Choose flagged-only review, a one-screen reviewed summary for every slice with full code available, or the existing full-slice approach.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, 23:43–01:43 PDT; rulings, queue answers through 01:19 PDT, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence; this tracker runs only the site build. Existing execution ownership and status retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 01:24 PDT

**What:** Keep code guides matched to readable, current revisions.

**Why:** Review time should focus on decisions and material risk.

**Current state:** At 01:22 the lead reports only two code items left, 40 approvals in about 40 seconds, and the next batch of 80 guides held pending a policy decision. Simplified engine files still return to Will as requested.

**Next step:** Hold the next batch, preserve completed guides and re-guide the engine rewrite after landing.

**Open questions for Will:** Whether to use Astra then Fable review for every slice, showing Will only flagged, security, data and public API slices.

Evidence: script-filtered human messages and lead text replies from session 6253ecf2, approximately 23:24–01:24 PDT; current rulings and queue answers through 01:19 PDT; shared briefs/designs, decisions, proposals, TODOs and rules. Product results are reported receipts. Execution owners retained; Codex curates tracker documentation only. Later rulings supersede earlier history.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 00:53 PDT

**What:** Keep code guides accurate to the reviewed revision and hold unreadable slices.

**Why:** Will reviews quality and decisions after tests establish behavior.

**Current state:** Four writers were assigned 80 further slices at 00:22. The 00:28 lead update raises the simplify-first count to 87, superseding the earlier 69. Decision 0022 is queued once; workflows-as-code synthesis still awaits completion. Will’s 00:15 queue answer rejects asking him whether a feature works.

**Next step:** Finish guides, hold stale or unreadable slices, and re-guide simplified revisions. Ask Will about quality or intent with evidence already attached.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies, session 6253ecf2, 22:53–00:53 PDT; rulings and queue answers through 00:17:42 PDT; shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Automated notifications and tool blocks excluded. Product receipts are lead-reported; this tracker validates the site build only. Execution ownership and prior history retained.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 00:24 PDT

**What:** Keep revision-specific guides and architecture context readable.

**Why:** Will reviews quality after evidence and readability gates pass.

**Current state:** At 00:22 four writers cover the next 80 slices: 48 flow, 20 engine and 12 app. The lead reports 34 approvals from the first 80 and a total of 69 slices held for simplification, superseding the earlier 27-slice count.

**Next step:** Finish current guides, hold unreadable or stale slices and re-guide each simplified revision. Track the broader cleanup in code-readability-burn-down.md.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, latest two hours through 00:23 PDT; queue answers through 00:17 PDT; rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence, not new tracker-run tests. Execution owners retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:55 PDT

**What:** Maintain accurate architecture guides alongside reviewable code slices.

**Why:** Will asked for context and diagrams, then requested familiar navigation controls.

**Current state:** At 23:50 the lead reports the first guided ModelStep slice approved. At 23:47 a Claude builder was adding parser-based comment hiding, body folding and outline navigation; these controls have their own linked workstream, queue-code-view-controls.md. No completed controls receipt.

**Next step:** Keep each guide tied to its exact revision; retain architecture context while the new controls improve navigation. Continue coverage of the remaining slices.

**Open questions for Will:** None.

Evidence: last two session hours of user-typed text and lead replies extracted with a JSONL script (notifications and tool content excluded), through 23:54 PDT; queue answers through 23:51; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product receipts are lead-reported; tracker validation is the maintainer-site build. Prior history and execution ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 22:35 PDT

**What:** Keep guides tied to the exact code slice and revision under review.

**Why:** Stale guides do not let Will assess current code.

**Current state:** At 22:34 the queue falls from 61 to 59 items; the lead says two slices probably changed after their guides were written. This is an inference, not a verified cause. The guide writer will refresh them on its next pass.

**Next step:** Identify the two withdrawn slice revisions and regenerate their guides before returning them; retain original review comments and prior guides as history.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead text replies from session 6253ecf2, approximately 20:35–22:35 PDT; automated notifications and tool blocks excluded. Current rulings and queue answers (latest 19:38 PDT) prevail over historical briefs and proposals. Execution ownership retained; Codex tracker curator reconciles documentation only. Product receipts are lead-reported; tracker verification is the maintainer-site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 21:43 PDT

**What:** Keep code review guides and architecture diagrams matched to each current code slice.

**Why:** Will needs why, how and architectural context to review code confidently.

**Current state:** At 21:40 PDT the lead reports four guided slices changed and five guides refer to regrouped slices. A Codex writer was relaunched for these nine. The earlier eight-guide rewrite is retained history, not evidence these new revisions have guides.

**Next step:** Rewrite the nine guides against current slice identities and revisions, then return their reviews to the queue. Keep stale guides held.

**Open questions for Will:** None.

Evidence: lead text replies and human-typed messages extracted by script from session 6253ecf2 for 19:43–21:43 PDT; synthetic notifications and compaction summaries excluded. Rulings and queue answers through 19:38 PDT take precedence over older briefs, designs, decisions, proposals, TODOs and rules. Product results are reported receipts; this tracker validates the site build. Execution ownership is retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 20:02 PDT

**What:** Keep revision-specific guides, architecture diagrams and package context attached to code reviews.

**Why:** Will needs enough context to assess each code group.

**Current state:** At 19:58 the lead reports all eight stale guides rewritten and the queue back to 48 items; this supersedes the earlier estimate of twelve pending rewrites. That batch is complete, but coverage of every remaining code group is not established.

**Next step:** Keep guides matched to exact revisions, hold any newly stale or unguided items, and finish remaining code coverage with package overviews first.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and assistant text replies in session 6253ecf2, 18:02–20:02 PDT; queue answers through 19:38 PDT; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Timeline validation also uses its builder report. Latest Will text and queue answers prevail. Product receipts are reported evidence; this tracker verifies the site build. Execution owner retained; reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:56 PDT

**What:** Attach revision-specific review guides with architecture diagrams and package context.

**Why:** Will repeatedly requested enough context to review code confidently.

**Current state:** At 19:52 PDT the lead started a writer to refresh 12 guides invalidated by code changes or regrouping. Earlier guided groups remain history; the queue stays at 36 items until replacements arrive.

**Next step:** Attach each replacement to its exact revision; keep stale and unguided items held and preserve Will’s original feedback.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, latest approximately two hours through 2026-10-21 02:55 UTC; queue answers through 02:38 UTC; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later rulings supersede older proposals. Builder receipts are reported evidence; tracker verification is the site build. Execution ownership retained; reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 18:44 PDT

**What:** Attach plain-language context, architecture, key lines and review questions to each exact code revision, with package overviews first.

**Why:** Will repeatedly returned unguided code because he could not assess it.

**Current state:** At 18:34 guides started arriving for ModelStep, FlowRuntime, FlowEngine and RevokeGitHubToken. At 18:40 the lead reports 39 guided code items available; unguided items remain held. This is progress, not completion of guides for every file.

**Next step:** Finish remaining assigned top-40 guides, verify revision linkage and package overview ordering, then cover the remaining code. Preserve returned reviews and their original comments.

**Open questions for Will:** None.

Evidence: user-typed text and lead replies extracted by script from session 6253ecf2 for 23:45–01:44 UTC (16:45–18:44 PDT); queue answers through 18:30 PDT; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest words and queue answers supersede older plans. Product receipts are reported by the lead; this tracker verifies only the maintainer-site build.

## Earlier tracker history (retained)


**What:** Attach a plain-language guide to every code review: what it does, why it exists, how it works, an architecture diagram, key lines and review questions. Each package gets an overview before its first code item.

**Why:** Will returned multiple code groups for insufficient context at 18:27–18:29.

**Current state:** The lead paused unguided code items at 18:29. At 18:32 four Codex writers were working on ten guides each for the top 40. No completed guide batch is reported.

**Next step:** Attach each finished guide to its exact code revision and return it immediately; keep unguided items out, preserve all review history, then cover the remaining code.

**Open questions for Will:** None.

Evidence: script-filtered last two hours of session 6253ecf2 through 18:32 PDT; queue answers through 18:30 PDT; current rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Queue answers supersede older open questions. Product receipts are reported evidence; this tracker validates only the site build.
