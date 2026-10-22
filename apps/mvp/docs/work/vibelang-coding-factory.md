---
title: VibeLang coding factory
status: in-progress
area: process
owner: Opus post-deploy coding-factory builder assigned by lead
updated: 2026-10-21 11:40 PDT
links: [vibelang-release-docs.md, vibelang-0-0-2-publish.md, maintainer-app-plugins.md]
---

## Factory run — 2026-10-21, 09:50 PDT

**What:** Run the coding factory end to end on the Cloudflare stack: a TODO to a mergeable pull request.

**Current state:** Works end to end under `alchemy dev` on workerd, recorded live (`e2e/factory.spec.ts`, video `factory/factory.mp4`, GIF `factory-factory.gif`, 9 chapters). A person asks Smithers for a TODO and commits it; the Working TODO blinks and links to its run (ruling TODO-3), watched live from Cloudflare; the agent's cells run in QuickJS's separate-`.wasm` build (`worker/AgentSandbox.ts`) and write the change on the branch's machine; the pull request opens with its review check passed and `Merging into main deploys it.` beside Squash and merge (ruling GH-9). `TODO_RUNS` is on unless set to `false`. Steering the running agent is not built.

**Blocked on the planned repository:** the test account `codeplanesmithers` has `read` on `roninjin10/smithers-github-tests`, which is Smithers' Guest; committing a TODO needs Member (write). The live runs use the test account's own scratch repository, `codeplanesmithers/smithers-j2-scratch-20261005`, where it is Admin and the App is installed.

**Next step:** land the stack, deploy, and run the same spec against production on the VibeLang repository.

## Tracker reconciliation — 2026-10-21 11:40 PDT
**What:** Run an ask through a TODO implementation to an open production pull request.
**Why:** The hosted VibeLang factory is the short-term north star.
**Current state:** At 11:39 the lead reports the factory QuickJS repair, TODO runs enabled by default and production host/sandbox fixes landed as 931fed70, now deploying. Will approved the outside-production recording at 10:30; that remains distinct from a production factory pass.
**Next step:** Finish deployment and run the real hosted TODO-to-PR-and-Drop test. Retain live receipts; the broader issue/stack/check loop stays in hosted-smithers-dogfood.md.
**Open questions for Will:** None.
Evidence: lead text replies through 11:39 PDT in session 6253ecf2, extracted by script from the latest two hours; rulings and queue answers take precedence over shared briefs, designs and older docs. Product results are reported evidence; this refresh validates the site build only. Existing implementation ownership is retained; Codex curates this note.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 11:15 PDT
**What:** Run an ask through TODO implementation to an open production pull request.
**Why:** The VibeLang factory remains the short-term north star; PROC-22 adds a real Smithers dogfood change.
**Current state:** Will approved the outside-production factory recording at 10:30. The factory stack is queued for landing, including QuickJS on workerd. At 11:08 the lead identifies that repair as necessary for every production remote flow; production-bundle verification is pending. At 11:11 a separate dogfooding builder starts the full issue-to-stacked-PR/checks loop. Neither recording approval nor workerd passes establish production factory success.
**Next step:** Land and deploy the factory with the remote and sandbox repairs, pass the real production TODO-to-PR test, and retain the hosted receipts. Track the broader Smithers-on-Smithers loop in hosted-smithers-dogfood.md.
**Open questions for Will:** None newly identified; settled decisions remain settled.
Evidence: script-filtered user text and lead replies from session 6253ecf2, approximately 09:14–11:14 PDT on 2026-10-21; current rulings (including PROC-21–23), queue answers, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Engineering receipts are reported evidence; this refresh validates only the maintainer-site build. Existing implementation owners are retained; Codex curates these notes.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 11:04 PDT
**What:** Run an ask through TODO implementation to an open production pull request.
**Why:** The VibeLang factory on production Smithers is the north star.
**Current state:** The earlier workerd passes and Will’s approved recording remain valid outside-production evidence. At 10:56 the remote-flow builder adds a real production TODO-to-open-PR test followed by Drop; it must prove the GitHub checkout repair. At 11:00 the factory stack is next in the lander’s checks, followed by host and sandbox fixes. Production success is not yet reported.
**Next step:** Land the stack, complete host and image deployment, then run the real production factory test and steering journey; retain the PR and cleanup receipts.
**Open questions for Will:** None newly identified. Repository access, Neon and review routing are settled; Telegram setup is discretionary and must not be resurfaced.
Evidence: script-filtered human text and lead replies in session 6253ecf2, approximately 09:03–11:03 PDT; current rulings and queue answers take precedence over briefs, panel designs and older documentation. Product receipts are lead-reported; Codex curates documentation and validates only the maintainer-site build. Existing engineering ownership is retained.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 10:34 PDT
**What:** Take an ask through a TODO and agent implementation to a reviewable pull request.
**Why:** The factory running on production Smithers is the north star.
**Current state:** Repeated workerd E2E passes outside production remain the engineering receipt. Will approved the factory walkthrough at 10:30:25 in the queue. Both repository invitations are accepted and the shared Member session is available. Production still waits on migration, checkout, resumable-step and image changes.
**Next step:** Land the factory and host repairs, then retain a real production factory and steering run. Human walkthrough approval does not establish production success.
**Open questions for Will:** None newly identified; retain unrelated unresolved questions in the live queue.
Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, latest approximately two hours through 10:33 PDT; current rulings and queue answers through 10:31 PDT, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence; this tracker runs only the site build. Execution ownership is retained; Codex curates documentation.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 10:15 PDT
**What:** Take an ask through a committed TODO and agent implementation to a reviewable pull request on hosted Smithers.
**Why:** The production VibeLang factory is the north star.
**Current state:** The lead reports repeated real workerd factory passes outside production and five commits handed to the lander. Production is still unproven. TODO runs are on by default; the remote-flows builder is repairing GitHub-versus-Code-Storage branch checkout and adding Node to the image. The 40-minute agent step versus 15-minute alarm limit remains a risk. Will has sent both test-account Write invitations.
**Next step:** Finish host, checkout, toolchain and long-step repairs; verify invitation acceptance and the refreshed Member session, then prove the production factory and steering.
**Open questions for Will:** None for test-account access: Will sent both invitations. The separately curated factory walkthrough remains a review item, not an engineering permission blocker.
Evidence: user-typed messages and lead text replies extracted by script from session 6253ecf2, approximately 08:14–10:14 PDT on 2026-10-21; tool records, automated notifications, local-command output and continuation summaries excluded. Current rulings (ARCH-4, TEST-6, AUTH-4, ARCH-14, PROC-20) and queue answers take precedence over shared briefs, panel designs, decisions, proposals, TODOs and rules. Execution owners are retained; Codex curates tracker documentation only. Product validation is lead-reported; this refresh runs only the site build.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 10:04 PDT
**What:** Take an ask through TODO implementation to a reviewable pull request in production.
**Why:** The hosted VibeLang factory is the short-term north star.
**Current state:** Repeated factory E2E passes on workerd outside production and five commits handed to the lander remain the latest proof. At 10:02 PDT the lead says TODO runs are now on by default. Production checkout repair sends TODO sandboxes through GitHub because the Code Storage mirror lacks their new branches; Node is being added for repository checks. No production factory pass is reported.
**Next step:** Land validated factory pieces and host/checkout/toolchain fixes, resolve long agent-step limits, then prove the full production journey and steering with the shared E2E harness.
**Open questions for Will:** Existing test-account Write request covers both repositories; see production-e2e.md.
Evidence: script-filtered user-typed text and lead text replies in session 6253ecf2, latest approximately two hours through 10:03 PDT; automated notifications, compaction summaries and tools excluded. Current rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this tracker validates only the site build. Execution ownership retained; Codex curates documentation.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 09:54 PDT
**What:** Take an ask through a committed TODO, visible run, code change and reviewable pull request.
**Why:** The production VibeLang coding factory is the north star.
**Current state:** At 09:51 PDT the lead reports repeated end-to-end passes on Cloudflare workerd outside production, with a factory recording and five commits handed to the lander. Hosted operation still fails pending the migration repair and enabling TODO runs; steering remains under construction. The recording used an account-owned scratch repository.
**Next step:** Land the five validated commits, repair the remote host, enable TODO execution safely and prove the same path in production.
**Open questions for Will:** Existing access request: Write for codeplanesmithers on smithersai/smithers and roninjin10/smithers-github-tests; see production-e2e.md.
Evidence: script-filtered user-typed messages and lead text replies, 07:53–09:53 PDT, session 6253ecf2; automated requests, summaries and agent-message wrappers excluded. Rulings and queue answers take precedence over briefs and older docs. Product checks are lead-reported; this refresh validates only the site build. Execution owners retained; Codex curates documentation.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 09:24 PDT
**What:** Run the VibeLang coding factory end to end on production Smithers.
**Why:** SCOPE-13 remains the north star; Will now prioritizes derisking all major failures.
**Current state:** At 09:22 PDT the lead reports production TODO runs and the coding factory broken by remote-flow migration failure. The factory builder is active and the run-view slice is ready in a workspace, but no working production TODO-to-PR proof exists.
**Next step:** Coordinate the host and sandbox repairs, then prove a real scratch-repository TODO run to a reviewable PR on production. Complete steering and docs-pane dependencies with their owners. People retain approval/merge authority; panel the reported failures and have Opus implement the repairs.
**Open questions for Will:** None. The provider preference and investigation/implementation direction are explicit; engineering validation remains with the builders.
Evidence: session 6253ecf2, script-filtered user text and lead replies in the last approximately two hours through 09:23:49 PDT; automated notifications, compacted summaries and tool results excluded. Rulings (including ARCH-14), Will’s queue answers, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules were reconciled. Product results are lead-reported; this tracker verifies the site build only. Existing feature execution ownership is retained.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 09:17 PDT
**What:** Run the VibeLang coding factory on production Smithers.
**Why:** SCOPE-13 makes this the near-term north star, with people retaining approval and merge authority.
**Current state:** At 09:15 PDT the lead says the production coding factory is still being built and tested slices should land independently. The running-TODO view is reported ready in a workspace, but that does not prove the whole factory works or authorize treating TODO execution as enabled.
**Next step:** Land validated slices; obtain the real Cloudflare and scratch-repository end-to-end receipts, confirm safe TODO enablement, and coordinate docs panes, PR pages and the main-promotion deployment warning.
**Open questions for Will:** None new; engineering validation and landing do not need another decision.
Evidence: script-filtered session 6253ecf2 human text and lead replies through 09:15 PDT, including Will’s human-origin queued request at 09:10:54. Rulings and queue answers take precedence over the shared briefs/designs, decisions, proposals, TODOs and rules reviewed for this pass. Product validation is lead-reported; this tracker runs the site build only. Execution ownership retained; documentation curator: Codex.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 03:54 PDT
**What:** Prove the VibeLang coding factory working in production.
**Why:** SCOPE-13 makes docs, code interaction and polished audience views the short-term north star.
**Current state:** The 02:56 PDT lead update assigns the post-deploy Opus factory builder. Round 4 is live. QuickJS proof on Cloudflare, restored PR pages, the running-TODO view and the promoting-main-deploys warning remain in its scope. No completed scratch-repository end-to-end proof or TODO enablement receipt is reported.
**Next step:** Complete the real Cloudflare and scratch-repository journey, then enable only the proven TODO path. Coordinate docs/search and audience views; agents never approve or merge.
**Open questions for Will:** None new.
Evidence: lead text replies extracted by script from session 6253ecf2, 01:53–03:53 PDT; no user-typed messages in this window. Automated notifications and tools excluded. Current rulings and queue answers through 01:19 PDT take precedence over historical briefs, panels, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this pass only rebuilds the maintainer site. Execution ownership retained; Codex curates the notes.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 03:04 PDT
**Current state:** At 02:56 PDT the lead started the post-deploy Opus factory job. Round 4 is live; the job must prove QuickJS on Cloudflare, restore PR pages, add the running-TODO view and the promoting-main-deploys warning. TODO runs remain gated on the scratch-repository end-to-end proof.
**Next step:** Prove the Cloudflare runtime and scratch-repository journey, then enable only the proven TODO path; agents never approve or merge.
**Open questions for Will:** None new; existing unresolved questions remain in the retained history.
Evidence: lead text replies through 03:03 PDT, extracted by script from the latest approximately two session hours; automated notifications and tool blocks excluded. Current rulings and queue answers take precedence over briefs and designs. Execution ownership retained; documentation reconciled by Codex tracker curator. Product receipts are reported, not independently rerun here.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-21 01:44 PDT
**What:** Deliver the production VibeLang issue-to-POC-to-TODO-to-person-merged-PR factory.
**Why:** SCOPE-13 prioritizes a working factory with docs, code interaction and polished audience views.
**Current state:** The GitHub App installation is confirmed at 01:38 for the whole smithersai organization. This removes the installation prerequisite, but does not establish production import or execution. TODO_RUNS stays disabled until real Cloudflare/QuickJS proof; no completed factory end-to-end receipt appears through 01:43.
**Next step:** After deploy, prove the sandbox and live factory journey, restore the PR pages, then enable the proven path. Coordinate docs/search and docs panes, code intelligence and highest-authorized-role home views.
**Open questions for Will:** None currently; settle implementation gaps from real production evidence.
Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, 23:43–01:43 PDT; rulings, queue answers through 01:19 PDT, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence; this tracker runs only the site build. Existing execution ownership and status retained; documentation reconciled by Codex tracker curator.
## Earlier tracker history (retained)
## Tracker reconciliation — 2026-10-20, 22:44 PDT

**What:** Deliver the simpler issue-to-POC-to-TODO-to-person-merged-PR lifecycle.

**Why:** Will requested reproduction, discussion acceptance, maintainer commitment and a playable generated POC.

**Current state:** At 22:38 PDT a fresh coding-factory builder takes over saved edits after the previous builder exhausted context. Last tests are unfinished. TODO-to-pull-request execution must remain switched off behind a flag until Cloudflare runtime proof exists; sandbox bundling must also preserve dev-server startup. No completed end-to-end factory receipt is reported.

**Next step:** Finish retained tests, prove the sandbox on Cloudflare, check clean dev startup and hand the files to the lander. Keep the unproven execution path disabled.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies, approximately 20:44–22:44 PDT, session 6253ecf2; notifications and tool blocks excluded. Current rulings and queue answers (latest 19:38 PDT) prevail over historical briefs and designs. Product receipts are lead-reported; this tracker verifies the maintainer-site build. Execution owners and statuses retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:56 PDT

**What:** Simplify the factory to reproduction, discussion acceptance, maintainer commitment, playable POC, TODO and person-merged PR.

**Why:** Will explicitly requested the simpler factory in chat and the home-mock review.

**Current state:** Decision 0018 now specifies the lifecycle and 0016 records the TODO seam. The lifecycle builder reports reproduction-gating and commitment slices present with targeted tests, while sandbox verification, auto-POC and real-browser proof remain open. No end-to-end factory completion is established.

**Next step:** Align the home mock and contributor material with these decisions, then prove the live issue-to-POC-to-TODO-to-PR journey without automatic Commit or merge.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, latest approximately two hours through 2026-10-21 02:55 UTC; queue answers through 02:38 UTC; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later rulings supersede older proposals. Builder receipts are reported evidence; tracker verification is the site build. Execution ownership retained; reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:34 PDT

**What:** Simplify the factory to reproduction, discussion acceptance, maintainer commitment, playable POC, TODO and a person-merged PR.

**Why:** Will explicitly requested a simpler factory in his 19:33 home-mock review and chat.

**Current state:** At 19:34 the lead confirms both a simplified factory addendum and issue-lifecycle work are assigned. Decision 0016 now records a simplified path and the seam: TODOs keep an issue number; POCs are references rather than TODO bases; PR bodies close issues through Fixes #n. No passing factory end-to-end receipt is reported.

**Next step:** Revise the VibeLang home mock and contributor flow to the same simple chain. Coordinate the lifecycle builder with TODO-to-PR execution, preserving human Commit and merge. See issue-lifecycle-and-poc.md for acceptance and preview work.

**Open questions for Will:** None.

Evidence: script-extracted user-typed messages and lead text replies from session 6253ecf2, 2026-10-21 00:34–02:34 UTC (17:34–19:34 PDT); queue answers through 02:33:47 UTC; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest Will text and queue answers prevail. Product receipts are reported, not rerun by this tracker. Existing execution owners are retained.

## Earlier tracker history (retained)

**What:** Prepare a high-quality VibeLang coding factory alongside its contributor and maintainer experience.

**Why:** Will explicitly requested a coding factory at 19:02; documentation alone does not fulfill that request.

**Current state:** The release documentation brief is assigned and drafts are written. No distinct coding-factory implementation, reviewed design or passing end-to-end receipt is reported.

**Next step:** Have the lead reconcile existing VibeLang automation with the requested contributor/maintainer experience and record a concrete spec and owner. Use catalog libraries and durable public flows; avoid inventing release policy.

**Open questions for Will:** No new question yet; inspect existing automation with the VibeLang session before asking Will about unresolved product choices.

Evidence: latest approximately two hours of user-typed messages and lead text replies extracted by script from session 6253ecf2, through 2026-10-21 02:14:18 UTC; queue answers through 01:57:13 UTC; rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Later Will answers supersede older proposals. Product validation is reported evidence; this pass verifies the site build only. Reconciled by Codex; execution owners retained.
