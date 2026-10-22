---
title: Shared branch prompt and file co-editing
status: done
area: app
owner: four-model co-editing repair panel; Opus synthesis and build assigned by lead
updated: 2026-10-21 23:24 PDT
links: [../features/coedit.md, branch-sharing.md, branch-terminal.md, branch-workspace-clarity.md, ../decisions/0013-branch-workspace.md, ../rulings.md]
---

## Saves reach Saved for both: 2026-10-21 16:30 PDT

**What:** Two people (or one person's two devices) edit a branch's file at once, and one Save says `Saved` on both.

**Why it failed:** The Mac mini sweep at main 10ec5f4d saw "Save never reaches Saved (240 s, twice)". The panel's traces (mini Postgres, engine journal, dev log) show attempt 1 spent about 312 s inside the container start, which no record explained; attempt 2 saved in 12 s, but Maya clicked Save 1.6 s before Ben's last keystroke reached her, so her text differed from what was written and the button honestly read Save. And Ben's tab could never read Saved: `saved` was the saving tab's own field.

**Current state:**
- `@smthrs/sync` gains `SharedText.mark` and `SharedText.marks` (dec3bbdaf6). A Save marks `<length>:<SHA-256>` of what it wrote in the text's own document; every tab reads Saved from it ([Saved](../features/coedit.md#saved)).
- The button reads Saving…, Saved, or Retry save after a failure.
- Wake records: `cloudflare.sandbox.wake` has `durationMs`; `sandbox.wake` logs each step's time on success.
- `e2e/coedit.spec.ts` has a two-device file test with no dev-only need, so it runs on a deployment; both tests wait for exact convergence before Save and check Saved on both screens.
- Merged plan and disagreements: the panel's MERGED.md (scratchpad, 2026-10-21).
- Production before the fix (16:56 PDT, against the build deployed then): the two-device test made the file in the terminal, both devices opened it through `sandbox/read`, typed at once with each other's carets, converged, and A's Save reached Saved through `sandbox/write`; it failed at "B says Saved too", as the old build does.
- Known gaps, in [coedit.md](../features/coedit.md#saved): overlapping Saves can leave the wrong mark; a reload during a Save leaves no mark.

- Production after the fix (deployed main 41ebbdd64aad at 20:38 PDT): coedit.spec's two-device test passed in 5.0 min (file made in the terminal, both devices edit with carets, A saves and both say Saved, B edits and saves and both say Saved, the working copy holds every edit); the two-person and answer-box tests skip as declared (devPeople, scriptedAgent). Recording: `~/Desktop/smithers-mvp/prod/gifs/coedit-co-editing-one-person-s-two-devices-edit-a-file-at-once-and-.gif`, checked by `e2e:gifs`.

**Next step:** Run coedit.spec locally on the Mac mini (all three tests). Close the two known gaps (tests marked broken in `coedit.test.ts`). Find the answer-box flake's cause from records.

**Open questions for Will:** A second GitHub test account, so the two-person test runs in production (today it is local only).


## Tracker reconciliation — 2026-10-21 23:24 PDT
**What:** Persist shared edits and show Saved on both devices.
**Why:** Editors need truthful persistence acknowledgements.
**Current state:** At 23:17 the lead confirms the two-device test passes on smithers.sh against the 23:05 deploy, with both devices showing Saved and every edit kept. All co-edit commits are on main. This closes the proven save slice; outstanding save-state races are tracked separately in coedit-save-recovery.md.
**Next step:** Retain the production receipt; rerun the full mini suite after database isolation, fix the answer-box flake and prove the two-person journey.
**Open questions for Will:** Second GitHub test account username when available; its creation is already approved.
Evidence: script-filtered user text and lead replies, 21:24–23:24 PDT in session 6253ecf2; the supplied continuation file was not found, including a filename search. Continuation-era replies survive in the original file. Rulings and queue answers govern; reboot-wiped briefs are not missing work. Codex owns tracker reconciliation only; implementation owners above are retained. Product tests are reported receipts.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 20:47 PDT
**What:** Persist branch edits and show Saved on both devices.
**Why:** Both editors need truthful persistence acknowledgement.
**Current state:** The lead reports at 20:46 that the co-edit Saved fix works in production, proven by a two-device production test at 20:38. This supersedes the earlier queued-only status. Broader caret/compaction follow-ups in history are not newly proven.
**Next step:** Retain the production two-device receipt and route remaining separately scoped enhancements to their owners.
**Open questions for Will:** None.
Evidence: script-filtered human text and lead replies, 18:46–20:46 PDT, session 6253ecf2; current rulings and queue answers prevail. Runner results are recovered report receipts. Codex curates this update; existing implementation ownership is retained.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 20:34 PDT
**What:** Persist shared branch edits and acknowledge Saved on every editor.
**Why:** Both editors need a truthful persistence acknowledgement.
**Current state:** At 20:32 the lead says the second editor still does not see Saved in production. The fixes are built and queued for landing/deployment; no new production two-device pass is reported.
**Next step:** Land and deploy, then prove both editors see Saved only after persistence and that edits survive reload.
**Open questions for Will:** None.
Evidence: lead text replies script-filtered from session 6253ecf2, approximately 18:34–20:34 PDT, and recovered briefs where named. Automated notifications and tool content are excluded. Current rulings and queue answers prevail over older plans. Existing implementation ownership is retained; Codex curates the tracker. Product results are reported evidence, not tests rerun by this refresh.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 16:43 PDT
**What:** Persist shared branch edits and acknowledge saves on every editor.
**Why:** Save must reach Saved only after persistence.
**Current state:** At 16:42 the lead reports both Save fixes implemented and locally tested; every editor sees Saved and wake duration is logged. They queue after the sandbox start limit. No landing or production E2E receipt yet.
**Next step:** Land fixes, deploy and run the planned two-device production E2E.
**Open questions for Will:** None.
Evidence: user-typed messages and lead text replies script-filtered from session 6253ecf2, 14:43–16:43 PDT; synthetic notifications, tools and compaction summaries excluded. Rulings and queue answers govern over historical briefs, panels, decisions, proposals, TODOs and rules. Implementation ownership retained; Codex curates this note. Product results are lead-reported.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 15:54 PDT
**What:** Persist shared branch edits and show Saved after persistence.
**Why:** Multiplayer edits must survive reload.
**Current state:** At 15:49 the lead launches the merger; at 15:52 a builder is merging panel reports and fixing saves that never reach Saved. Earlier launch intent is now confirmed active work.
**Next step:** Collect implementation and two-person save/recovery proofs locally and in production.
**Open questions for Will:** None newly identified; unresolved questions in the retained history remain open.
Evidence: script-filtered lead text replies in session 6253ecf2, latest approximately two hours through 15:53 PDT. Automated notifications, tool content and compaction summaries excluded. Rulings and queue answers prevail over historical briefs. Implementation ownership retained; Codex maintains these notes. Product receipts are lead-reported; this refresh verifies the site build.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 15:40 PDT
**What:** Persist shared edits and acknowledge Saved only after storage.
**Why:** Two-person edits must survive reload and show truthful persistence.
**Current state:** At 15:20 the lead says the coedit merger is next to launch after routing reports and freeing disk. This is launch intent, not confirmation that implementation started. The production save failure remains unresolved; retain designing status.
**Next step:** Confirm merger launch and build receipts, then prove two-person saves and recovery locally and live.
**Open questions for Will:** None newly identified; existing questions remain in the retained history.
Evidence: script-filtered user-typed text and lead replies in session 6253ecf2, approximately 13:40–15:40 PDT on 2026-10-21. Automated notifications, relayed agent text, tool records and compaction summaries excluded. Current rulings and queue answers govern over briefs and planning documents. Engineering ownership is retained; Codex curates this tracker update. Product outcomes above are lead-reported.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 14:05 PDT
**What:** Persist shared branch edits and reach Saved truthfully.
**Why:** Multiplayer editing must preserve work and acknowledge actual persistence.
**Current state:** At 14:01 PDT the four-model co-editing panel starts on saves never reaching Saved. At 14:03 two confirmed review findings are held for its builder. Earlier mini passes do not establish current production behavior.
**Next step:** Finish panel diagnosis and build; prove two-person saving, reload and private-draft isolation locally and live.
**Open questions for Will:** None.
Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2 for approximately 12:04–14:04 PDT on 2026-10-21; synthetic notifications and tool records excluded. Rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this tracker validates the maintainer-site build only. Engineering owners remain responsible; Codex owns this documentation reconciliation.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 12:54 PDT
**What:** Keep shared branch edits durable and show Saved only after persistence.
**Why:** The requested multiplayer editor must preserve edits and report completion honestly.
**Current state:** At 12:48 PDT the local E2E sweep reports a real co-editing failure: saves never reach Saved. Earlier mini passes and landing receipts remain historical evidence; they do not establish the current feature works. At 12:53 the lead includes this failure in the next panel-then-build batch after the sweep.
**Next step:** Retain the failing save journey, finish the sweep and assign the panel/build repair; rerun two-person saving and private-draft isolation locally and live.
**Open questions for Will:** None; repair assignment is the lead’s next step.
Evidence: script-filtered human text and lead replies for the latest approximately two hours of session 6253ecf2 through 12:54 PDT; automated notifications, relayed agents and tool blocks excluded. Current rulings and queue answers govern over older briefs, panels, decisions, proposals, TODOs and rules. Product receipts are lead-reported; Codex curates tracker documentation and runs the site build. Existing execution owners are retained.
## Earlier tracker history (retained)
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
