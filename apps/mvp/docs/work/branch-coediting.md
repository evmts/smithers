---
title: Shared branch prompt and file co-editing
status: in-progress
area: app
owner: co-editing builder (Opus, lead session 6253ecf2)
updated: 2026-10-21 02:06 PDT
links: [../features/coedit.md, branch-sharing.md, branch-terminal.md, branch-workspace-clarity.md, ../decisions/0013-branch-workspace.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 02:06 PDT

**What:** Shared branch prompt and file co-editing.

**Why:** The requested multiplayer editing must retain private personal drafts.

**Current state:** The lead reports co-editing landed in c6940ac5 at 01:49 PDT. The latest builder record reports coedit.spec.ts passing on the mini with sharing restricted to shared branches. Production deployment is still running in the latest lead update. Markdown carets and update compaction remain follow-ups; the landing alone does not prove those complete.

**Next step:** Smoke-test two-person editing and private drafts on production, then finish Markdown carets and update compaction.

**Open questions for Will:** None.

Evidence: session 6253ecf2 user-typed text and lead replies extracted by script for the latest two hours through 2026-10-21 09:03:39 UTC; current rulings, queue answers, shared briefs/designs and retained builder receipts. Product tests are reported evidence; tracker validation is the site build. Execution owner retained.

## Earlier tracker history (retained)


## Which prompts are shared — 2026-10-20, 23:50 PDT

**What:** The composer's draft is the person's own, kept on the device per conversation (`chat-drafts`), everywhere except a branch its owner shared. Only there is it the branch's prompt, typed together ([coedit.md#the-prompt](../features/coedit.md#the-prompt)).

**Why:** The builder's last change shared every conversation's prompt, the home conversation and a person's unshared branch included: every Member saw every other Member's home draft, and a device's second tab mirrored the first tab's draft (the "two tabs" re-record failure).

**Current state:** `POST /api/branches` answers `shared`; chat's `place` row holds it; the owner's tab follows the permission list live. `Can view` gets the read-only composer, `Owner` and `Can edit` type and send (decision 0013 decision 8). Unit regressions in `src/features/coedit/coedit.test.ts` ("whose prompt is shared"); `e2e/coedit.spec.ts` passes on the mini.

**Next step:** The lander lands it with round 4.

**Open questions for Will:** None.

## Tracker reconciliation — 2026-10-20, 22:24 PDT

**What:** Share branch prompt, file and needs-you answer text with named live cursors.

**Why:** Will requested two people visibly editing the same prompt and file.

**Current state:** At 22:22 the lead reports Yjs unit tests pass and the answer-box recording passes; prompt steps pass but shared-file editing still fails. Sharing the home prompt with every Member may exceed branch scope. At 22:24 a fresh agent takes over after the prior agent exhausts context.

**Next step:** Confirm which conversations share drafts; restrict sharing to shared branches, investigate the second-tab draft leak and rerun shared-file and branch-sharing journeys after the test pause. Retain Astra then Fable review.

**Open questions for Will:** None; private personal drafts and branch-scoped sharing follow existing intent.

Evidence: script-extracted human text and lead replies, approximately 20:24–22:24 PDT; synthetic notifications excluded. Latest Will text, rulings and queue answers supersede older briefs and proposals. Execution ownership retained; Codex tracker curator updates documentation only. Product checks above are reported receipts; this pass validates the maintainer-site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 22:05 PDT

**What:** Share prompt, file and needs-you answer text with live named carets.

**Why:** Will asked for collaborative editing across people and devices.

**Current state:** At 22:04 the lead reports the first two-person prompt/file recording failed, while two devices answering a needs-you run passed. Neither goes to the queue until the burn-down handoff and fix dispatch are complete. Branch sharing also awaits its own passing recording.

**Next step:** Fix and retain the failed two-person regression, finish the current slice, and hand passing evidence or an explicit disabled scope to the lander.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies in session 6253ecf2, approximately 20:04–22:04 PDT; synthetic notifications, compaction summaries and tool blocks excluded. Rulings and queue answers through 19:38 prevail over historical briefs, decisions and proposals. Execution ownership retained; Codex curates this note. Product checks are reported evidence; tracker validation is the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 21:26 PDT

**What:** Every input two people see at once is one text they edit together, with named, coloured carets: a conversation's prompt (branch and home), a file of a branch's working copy, and the answer box of a run that needs its person.

**Why:** Will at 17:41 (prompt and file, with cursors; review the code) and at 18:06/18:10 (the answer box on the agent status recording).

**Current state:** Built and handed to the round 4 lander ([coedit.md](../features/coedit.md)). `@smthrs/sync`'s `SharedText` (Yjs in Effect) is the CRDT; updates live in Postgres `text_updates` (migration 0026), written by `POST /api/texts/<id>` (viewers refused before storing), synced by an Electric shape per text and sent through the device's outbox; carets ride one presence room per text. `@smthrs/ui` draws carets over the composer and answer box; `@smthrs/repo-view` adds `CodeEditor` and `LiveMarkdownEditor`. Unit and route tests pass on the Mac mini (sync 651/651 at 100% coverage; coedit 31 tests). On the mini, `e2e/coedit.spec.ts`'s answer-box test passed with its GIF; the two-person test passed its prompt steps and failed at the file step on a Code Storage clone the mini lacks, now opened by address.

**Next step (todo, after the test pause):** rerun `pnpm e2e coedit.spec.ts branch-sharing.spec.ts && pnpm e2e:gifs`; Astra then Fable review. Not built: carets in the Markdown editor (it merges typing, draws no carets) and compaction of a text's updates.

**Open questions for Will:** None.

## Earlier tracker history (retained)

## What

Co-edit a branch composer draft and working-copy files with named, coloured cursors. Concurrent edits converge; sending is one person's act under their identity. Save uses the existing durable sandbox write flow.

## Why

Will's 17:41 queue answer asks to see both people editing the same prompt and file, and calls out code review.

## Current state

At 17:41:46 PDT the lead started implementation. Sharing, presence and terminal access previously passed; no co-editing test or implementation completion receipt exists.

## Next step

Choose the library from the catalog first; any missing CRDT capability belongs behind the SDK's Effect services. Enforce edit grants and revocation on every server update. Prove concurrent convergence with property tests and a real two-person browser journey with cursors, view-only refusal, reconnect and revocation. Return a chaptered recording and review the code alongside security.

## Open questions for Will

None. Prompt/file co-editing is explicitly requested; broader Pair restoration remains outside this work.

## History

2026-10-20 17:44 PDT: added from Will's queue ruling at 00:41:23 UTC and the lead's script-extracted 00:41:46 UTC reply. No product tests were run by this tracker.
