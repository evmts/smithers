---
title: Decisions for Will
status: in-progress
area: process
owner: Will through curated queue; lead routes answered work
updated: 2026-10-21 20:55 PDT
links: [will-decision-queue.md, dev-stack-hygiene.md, review-round-4.md, issues.md, site-deployment-test.md, ../decisions/0012-git-end-to-end.md, ../decisions/0013-branch-workspace.md, ../decisions/0014-flows-authoring-debugging-and-home-view.md, ../decisions/0015-agent-status.md, repo-view-package-split.md, repo-follow-ups.md, app-wiring.md, sdk-test-reds.md, platform-cloudflare-edge-cache.md, integrations-durable-retries.md, design-questions.md, flows-and-agent.md, host-agnostic-flows.md, durable-answering.md, model-host-effect-boundary.md, repo-clone-and-view.md, infrastructure-as-code.md, code-storage-spend-caps.md, land-and-deploy-mvp.md, mvp-scope-cut.md, legacy-smithers-sh.md, move-effectscript-repos.md, vibelang-0-0-2-publish.md, electric-client-bug-report.md, sign-in.md, token-spend-alerts.md, deep-import-migration.md, import-rules-and-jev-lint.md, observability.md, cerebras-rate-limits.md, clone-token-scope-bug.md, effect-tanstack-db-and-effect-electric.md, local-first.md, ../decisions/0011-the-agent-runs-in-the-browser.md, model-endpoint.md, durable-browser-engine.md, pwa.md, agent-ui-rendering.md, sandboxes.md, sandbox-budgets.md, roles-and-labels.md, pr-review-and-merge.md, web-standard-globals-rule.md, code-reviews.md, flows-root-platform-neutral.md, b1-follow-ups.md, auth.md, slash-commands.md, plan-identity-across-deploys.md, navigate-flow.md, web-page-flow.md, plan-identity-minified-builds.md, agent-repo-navigation.md, maintainer-site.md, fable-review-2-fixes.md, self-host-install.md, old-app-feature-gaps.md, land-to-main.md, pull-request-list-and-tabs.md, issue-triage.md, conversations-and-history.md, branch-terminal.md, branch-sharing.md, flow-authoring.md, flow-debugging.md, repository-declared-home.md, agent-status.md, github-source-of-truth.md, no-github-actions.md, second-build-machine.md, agent-evals.md, secrets-proxy.md, notifications-and-live-work.md, todos-and-stack.md, smithers-playground.md, ../decisions/0016-todos-and-the-stack.md, chat-message-controls.md, docs-truth-pass.md, prompt-flows-are-code-flows.md, self-hosted-grafana.md, disk-space.md, ../rulings.md, everything-is-a-plugin.md]
---

## Tracker reconciliation — 2026-10-21 20:55 PDT

**What:** Track only unresolved decisions and access dependencies.

**Why:** Do not ask Will to repeat an answer already recorded in the source of truth.

**Current state:** Queue 940 is resolved by Will’s 20:50 vendor-neutral-seam ruling in PROC-23, replacing both earlier proposals. His 20:48 mini-account instruction is also recorded; the lead reports five builders running at 20:54. Plugin-interface design approval remains settled. GitHub push login has no success receipt.

**Next step:** Advance the seam implementation and keep only current access dependencies or genuinely unanswered questions in the queue.

**Open questions for Will:** Railway deployments: agents/tests or app hosting? The lead also asked whether the reported leak affected credentials beyond the revoked GitHub token; no answer is present. Do not repeat the settled 940 proposals.

Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, latest two hours through 20:55 PDT; synthetic notifications and tool blocks excluded. Current rulings and queue answers govern over historical decisions and proposals. Available recovered briefs were read; wiped scratch files are not missing work. Product results are lead-reported; Codex curates documentation and runs the maintainer-site build. Previous implementation ownership is retained below.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 10:34 PDT

**What:** Keep only unresolved decisions in the curated queue.

**Why:** Resolved asks must advance work.

**Current state:** The test-account Write grants and Neon Launch choice are settled in chat; both invitations are accepted. Code-review routing is settled by queue option 1 at 10:30:51 (PROC-21). Factory, slash-command and sign-in recordings were approved. Telegram is permanently removed from reminders. Historical pending rows below are superseded by these receipts.

**Next step:** Reconcile remaining live queue items and advance implementation on answered choices.

**Open questions for Will:** None newly identified; retain unrelated unresolved questions in the live queue.

Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, latest approximately two hours through 10:33 PDT; current rulings and queue answers through 10:31 PDT, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence; this tracker runs only the site build. Execution ownership is retained; Codex curates documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 10:15 PDT

**What:** Keep only unresolved product decisions and reviews in Will’s curated queue.

**Why:** Answered questions must advance work rather than repeatedly interrupt Will.

**Current state:** At 10:13 PDT Will sent both test-account Write invitations and selected Neon Launch; the lead removed both queue items. At 10:09 Will deferred Telegram setup at his discretion with no reminders. The 10:14 lead update reports six queue items remain, led by the coding-factory walkthrough (970) and code-review routing (945). Those counts are a reported snapshot, not newly verified queue state.

**Next step:** Route answered access and Neon work to builders; verify invitation acceptance through the test account. Continue curating the remaining reviews without re-queuing Telegram or asking whether features work.

**Open questions for Will:** Existing curated items include the factory walkthrough and code-review routing. No question remains about granting access, selecting Neon or configuring Telegram.

Evidence: user-typed messages and lead text replies extracted by script from session 6253ecf2, approximately 08:14–10:14 PDT on 2026-10-21; tool records, automated notifications, local-command output and continuation summaries excluded. Current rulings (ARCH-4, TEST-6, AUTH-4, ARCH-14, PROC-20) and queue answers take precedence over shared briefs, panel designs, decisions, proposals, TODOs and rules. Execution owners are retained; Codex curates tracker documentation only. Product validation is lead-reported; this refresh runs only the site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 09:45 PDT

**What:** Keep only actionable decisions and permissions visible to Will.

**Why:** Builders establish whether features work; Will supplies permissions agents cannot grant themselves.

**Current state:** At 09:43 PDT the lead asks for codeplanesmithers to receive write access on smithersai/smithers. The account is reported Guest there. Production Member tests for sandboxes, TODO runs and steering are blocked without that access. Earlier scratch-repository permission answers do not establish access on this repository. No subsequent answer or grant receipt appears in the reviewed window.

**Next step:** Keep this existing request visible with the production-E2E workstream; continue implementation and tests that do not require the grant. Verify the actual role before running Member acceptance.

**Open questions for Will:** None. Answered 10:13 on 2026-10-21 (option 1, granted), Will: "Both Write invitations are sent; codeplanesmithers still needs to accept them." The prod-e2e builder accepts both invitations as the test account (rulings.md, TEST-6 addendum). Answered 10:13 on 2026-10-21 (option 1, Launch), Will: "Neon shows Launch at $0.106 per compute-unit hour plus storage, and I've selected it for the organization containing production." (rulings.md, ARCH-4 addendum).

Evidence: script-extracted human text and lead text replies from session 6253ecf2, approximately 07:43–09:43 PDT on 2026-10-21; compacted summaries, local-command output, automated notifications and tool blocks excluded. Rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product results are reported evidence; this tracker runs only the maintainer-site build. Existing execution owners are retained; Codex curates documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 01:44 PDT

**What:** Track the remaining review-policy decision.

**Why:** Will’s earlier request to review every file remains in force until he changes it.

**Current state:** The 01:37–01:43 lead updates supersede the earlier 70% proposal: confidence is 55%, queue priority 945. Options include agent-first flagged-only review, a reviewed summary for every slice with full code one key away, and keeping full slices. No answer is present in the available queue receipts.

**Next step:** Keep approved designs and the completed App install out of pending decisions; route this question through the existing queue.

**Open questions for Will:** Which code-review presentation should replace or retain the current full-slice review?

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, 23:43–01:43 PDT; rulings, queue answers through 01:19 PDT, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence; this tracker runs only the site build. Existing execution ownership and status retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 01:33 PDT

**What:** Keep genuine open choices visible without blocking work already authorized.

**Why:** Recent rulings settle questions still listed in the older tracker specification.

**Current state:** FLOW-10 approves the workflows-as-code panel; PLUGIN-6 approves the review queue with heavy evaluation. The VibeLang App installation and four feature recordings are answered. Spend-alert channels are built, with email awaiting account setup; the Playground shelf was approved but remains paused. These supersede the earlier pending-question list. No final combined-round push or deployment receipt appears through 01:33 PDT.

**Next step:** Route approved work to its existing owners after deployment. Keep operational setup and engineering investigations in their own notes; do not ask Will to prove features work.

**Open questions for Will:** Should routine code review move to Astra then Fable, with only flagged/security/data/public-API slices shown to Will? The lead asks at 01:22, confidence 70%; no subsequent queue answer settles it.

Evidence: script-extracted user text and lead replies, 23:33–01:33 PDT; rulings and queue answers through 01:19 PDT; shared briefs and panel designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported. Existing execution owners and statuses retained; Codex tracker curator updates documentation only. Later rulings supersede retained history.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 18:26 PDT

**What:** Keep only genuine unresolved choices in the decision queue and dispatch answered rulings.

**Why:** Stale questions must not hold up authorized work.

**Current state:** Deploy, plugin placement/React/queue, private smithers-infra, views publication, public home fixture and conditional Grafana Cloud deletion are answered. The obsolete TODO write-from-reading question was removed at 18:19 because branch-machine tools exist.

**Next step:** Dispatch the answers to existing owners; track Code Storage rotation separately; remove stale pending-question claims without erasing history.

**Open questions for Will:** External spend-alert delivery; Code Storage budgets and Playground shelf remain in the latest reported queue. Ask only when the active work needs the answer.

Evidence: latest two session hours extracted by script as human text/lead replies; queue answers through 2026-10-21 01:24:15 UTC, current rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Latest rulings override historical proposals. Product results are reported receipts; this pass verifies the maintainer-site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:34 PDT

**What:** Track genuine unresolved decisions and dispatch answered ones.

**Why:** Answered questions must stop blocking work.

**Current state:** First deployment is approved at 17:32. Plugin approval, arbitrary React apps, QuickJS placement and queue-over-flows are answered; extra Fable review is active. Message controls are approved. New branch/home/TODO changes are implementation requests.

**Next step:** Remove answered deploy/plugin gates from active questions; route the new UI corrections. Retain only unresolved product choices.

**Open questions for Will:** Views publication, home-fixture retention, external spend-alert delivery and hosted IaC location remain unanswered in the evidence.

Evidence: queue answers through 2026-10-21 00:34:14 UTC; script-filtered human text and lead replies from the latest two transcript hours through 00:33:48 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs. Latest answers supersede older blockers. Product tests are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 14:55 PDT

**What:** Surface only decisions not already settled by current rulings.

**Why:** Stale docs had produced unnecessary questions.

**Current state:** Use rulings §18 and live queue over the historical table below. GitHub App setup, hosted-only, mythical deferral, sharing and prompt-as-code are settled. The curator reports a fresh queue at 14:54.

**Next step:** Review the merged plugin design when ready, and the genuine queued decisions. Older question tables below are history.

**Open questions for Will:** First production deploy; hosted IaC location; issues/claim versus maintainer tracker; external alert destination; self-hosted Grafana after research; personal-file contradictions. Exact effectscript-ts repository remains unresolved.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: Will (decision)


## What

Every open question for Will on the Work board, in one place, blocking ones first. Each row links to the note that holds the details; the answer goes back into that note and its decision record.

### Next for Will

As of 14:30 on 2026-10-20. Will worked the queue from 14:08:55 to 14:27:56 and answered every row of the 13:46 table except testing and code review (all under Answered): the GitHub App visit is done; Latitude servers are ours to use; Grafana is self-hosted instead of rotated; 0016 keeps the stack in Postgres and the `mythical` history comes out for now; the docs follow the MVP being built (M-31); prompt flows are a type of code flow (0014 Q1 reversed); the curator dropped the fleet cap. He accepted the Playground's choices 1 and 2 and sent two change requests on feature GIFs. The queue is the place to answer; this table lists only what remains.

| # | Ask | Your time | When | Unblocks | Note |
|---|---|---|---|---|---|
| 1 | **Work the queue** at `http://localhost:4747/queue`. Open at 14:30: 8 decisions, 4 questions, 5 designs, 16 GIF groups and 117 code slices. The decisions and questions: 0015's needs-you toast (760), 0016 Q1 and Q2 (720, 715; the lead settled both at 13:45), the spend-alert destination (640), an expired session keeps the device's copy (600), `navigate` stays on app paths (560), libraries may call `fetch` and `crypto.subtle` (540), the old stack's Tuesday launch (520), the effectscript repo move (480), VibeLang 0.0.2 (460), Code Storage budgets (420), and the Playground shelf (313). | as long as you like | now | each linked note | [Will's decision queue](will-decision-queue.md) |
| 2 | **Security, not blocking:** the Grafana Cloud password (`TF_VAR_grafana_password`) stays exposed until that stack is deleted or the password rotated. Delete the Grafana Cloud stack once the self-hosted one receives the app's telemetry? Recommended: yes. | 2 min | after the self-hosted stack reports | closes the exposure | [self-hosted Grafana](self-hosted-grafana.md) |
| 3 | Test the app at http://localhost:1337/app. New since 13:46: issues against live GitHub once the live test agent reports; the sandbox tools and branch sharing after their e2e runs on the restarted stack (14:26). | 5 to 10 min | when the reports land | catches client and agent problems | [app wiring](app-wiring.md), [issues](issues.md) |
| 4 | Review the code: the queue's code slices (117 at 14:30, from about 5,200 covering every file, flows first). | ongoing | in the queue | Will's sign-off; the first deploy still waits on his separate yes | [code reviews](code-reviews.md), [land and deploy](land-and-deploy-mvp.md) |

The 13:46 version, for history. Its intro:

From 14:04 on 2026-10-20 every open row below is also an item in [Will's decision queue](will-decision-queue.md) at `http://localhost:4747/queue`, where Will answers by key; this note stays the index. The curator's ranking at 14:03: row 1 (1000), row 7 (930), row 6 (880), the Playground's three design choices (870 to 866), row 2 (860), row 5 (850), row 4 (840), row 3 (830); then feature GIFs, designs and code review (row 9) in groups of files.

As of 13:46 on 2026-10-20. Will answered at 13:25:53 and 13:31:14, so the 13:28 table's rows 3 and 4 and most of row 5 are under Answered: what he posts through Smithers appears under his own GitHub account (0012 Q1); the code viewer moves to `@smthrs/repo-view` (B); hosted only for now; branch sharing is the lead's call by common practice (0013 Q1, decided 13:32:34). He didn't answer 0014 Q1 (row 3); the lead builds on yes. At 13:26:18 the lead folded the callback URL (old row 2) and the issues setup (old row 9) into one GitHub App visit, "the one blocker that holds the most work", adding Pull requests and Contents and more events (row 1). New: the M-31 line that hosted-only contradicts (row 4), and decision 0016's departure from the "One mythical stack" rule (row 5), which the lead flagged at 13:45:10. The lead settled 0016's two questions himself at 13:45:10 (under "Building proceeds").

| # | Ask | Your time | When | Unblocks | Note |
|---|---|---|---|---|---|
| 1 | **The GitHub App's settings, one visit.** (1) Add the callback URL `http://localhost:1337/api/auth/callback`. (2) Repository permissions, Read and write: **Issues**, **Pull requests** and **Contents**. (3) Subscribe to the events Issues, Issue comment, Label, Pull request, Pull request review, Push, Create and Delete. (4) Generate a new private key and save it at the path `GH_APP_PEM` names; the current file isn't on this Mac. (5) Install the App on the repository Smithers should wrap and on a scratch repository for tests, and tell the lead both names. Leave the webhook URL until a deploy gives the address. | about 5 min | now (asked 13:26:18; the callback since 01:00, the issues setup since 12:54:04) | real GitHub sign-in; the issue create and comment e2e and live tests; triage's label writes; later, pull requests | [issues](issues.md), [sign-in](sign-in.md), [pull requests](pull-request-list-and-tabs.md) |
| 2 | **Security, not blocking:** rotate the Grafana password, `TF_VAR_grafana_password` in `~/.zshrc`. The sign-in agent printed it into its transcript early on 2026-10-20; treat it as exposed. | 2 to 5 min | now (asked 01:00, 05:49, 06:43:26, 10:42:03 and 13:26:18) | closes the exposure | [sign-in](sign-in.md) |
| 3 | 0014 Q1: your own flows, usable in any repository, are prompt flows; code flows live only in repositories and run in a sandbox. Recommended: yes. | 10 s | asked 07:30:21, 10:42:03 and 13:26:18; unanswered at 13:31:14; built on yes | confirms the personal-flows design | [flow authoring](flow-authoring.md) |
| 4 | Hosted only conflicts with M-31: root `AGENTS.md` and mvp.md M-31 move Smithers' own development onto the install on your Mac mini. Change M-31 now (for example, dogfood on the hosted app), or keep it as the later target? Best guess: dogfood on hosted until the install returns. | 1 min | when convenient (the lead left the line for you, 13:32:34) | `AGENTS.md` matching your 13:31 ruling | [self-hosted install](self-host-install.md) |
| 5 | Decision 0016 keeps the stack's order in Postgres with no `mythical` ref, departing from root `AGENTS.md` "One mythical stack; append-only main". Every TODO still reaches `main` as one squash-merged PR a person merges. Accept, and update `AGENTS.md` to match? | 1 min | when convenient (flagged 13:45:10) | `AGENTS.md` matching what's built | [TODOs and the stack](todos-and-stack.md) |
| 6 | Cap the fleet at about 8 agents at a time to stretch the second account, finishing the review fixes and landing first? | 10 s | offered 11:42:48 | how long the account lasts | [dev stack hygiene](dev-stack-hygiene.md) |
| 7 | Name a Latitude server for a second build machine: its own clone, Postgres, Electric and dev server, pushing to `main` itself. Not one of the two hosts running production sandbox workers, and not nyc-01. | 10 s | asked 13:21:12 | the waiting features skip this Mac's one test lock and checkout | [second build machine](second-build-machine.md) |
| 8 | Test the app at http://localhost:1337/app, signed in as the local developer. New since 13:00: message controls (Copy or `/copy`, Edit or `/edit` on a queued question, times, a draft that survives a reload); Flows, New flow, Draft, Save, Run, then Stop and Retry on the run page; a branch's own conversation and terminal at `/octocat/Spoon-Knife/tree/test-branch` (Terminal, Open terminal, `git log`, reload). | 5 to 10 min | under way since 05:56; try-it steps 13:09:31 (flows) and 13:43:30 (branch) | catches client and agent problems | [app wiring](app-wiring.md), [message controls](chat-message-controls.md), [flow authoring](flow-authoring.md), [branch terminal](branch-terminal.md) |
| 9 | Review the code, starting with `packages/effect-tanstack-db` and `packages/effect-electric`. | 20 min for the packages | after the feature list (Will, 23:00); not before landing (06:39:37) | Will's sign-off; the first deploy still waits on his separate yes | [code reviews](code-reviews.md), [land and deploy](land-and-deploy-mvp.md) |

From 13:54 on 2026-10-20: the [Smithers Playground](smithers-playground.md) design is ready (`apps/playground/design/playground.html`). The lead relayed its three main choices, which the agent builds on unless Will objects: the code is the truth; a time-first flow inspector with Kill host; a shelf that joins the playgrounds. Each is a queue decision.

Until 13:54: Coming after this table: the [Smithers Playground](smithers-playground.md) design mock, when its agent opens it; not a question.

The 13:28 version, for history. Its intro:

As of 13:28 on 2026-10-20: row 5's 0012 Q1 is reworded and row 10 is new. At 13:21:27 Will answered item 1 of the lead's 13:19:52 list, "your GitHub actions show as you", as if it meant GitHub Actions: "Githubactions we don't support those at all". That is a ruling, now under Answered ([no GitHub Actions](no-github-actions.md)), but it doesn't answer 0012 Q1, which asks whether what you post through Smithers appears on GitHub under your own account. The lead asked it again in plain words at 13:23:33. Row 10: at 13:21:12 the lead asked Will to name a Latitude server for a second build machine, after Will offered them at 13:20:43. Will's 13:21:41 "start the ones that can start now" answered the lead's offer to start four items in parallel (under Answered). No answer to rows 1 to 10 otherwise by 13:28. Until 13:28 the intro read: As of 12:59 on 2026-10-20: row 9 is new. At 12:54:04 the lead asked Will to set up the GitHub App so the issues slice's create and comment e2e and its live GitHub tests can run; it is 0012 Q2's App change, limited to what issues need. At 12:36:24 the lead reminded Will that the sign-in callback URL still needs registering (row 2). No answer to rows 1 to 5, 8 or 9 is on record by 12:59. Until 12:59 the intro read: As of 11:46 on 2026-10-20: row 8 is new. At 11:42:48, after two weekly usage limits stopped the agents (the first account at about 11:30, the second at about 11:35; Will logged in to another account and applied a usage reset), the lead offered to cap the fleet at about 8 agents at a time. No answer to rows 1 to 5 or 8 is on record. Until 11:46 the intro read: As of 10:44 on 2026-10-20: no answer to rows 1 to 5 is on record. At 10:42:03, after the Claude usage limit stopped every agent from about 08:15 to 10:40, the lead asked again for all eight answers in rows 1 to 5. As of 07:53 on 2026-10-20. No answer to rows 1 to 5 is on record. Row 6 has more to try: from 07:44 to 07:49 the lead told Will that `navigate`, the web page flow and Jev are done, each with what to try ([navigate](navigate-flow.md), [web page flow](web-page-flow.md), [agent Jev](agent-jev.md)). The [site deployment test](site-deployment-test.md) is fixed in the working copy (07:51) and clears the one red on `main` when round 2 lands. The navigate question under "Proceeding on the recommendation" stays open; the web page flow covers outside pages.

| # | Ask | Your time | When | Unblocks | Note |
|---|---|---|---|---|---|
| 1 | **Security:** rotate the Grafana password, `TF_VAR_grafana_password` in `~/.zshrc`. The sign-in agent printed it into its transcript while reading `~/.zshrc`. The transcript stays on this Mac but went through the model, so treat the password as exposed. | 2 to 5 min | now (asked 01:00, 05:49, 06:43:26 and 10:42:03) | closes the exposure | [sign-in](sign-in.md) |
| 2 | In the Smithers GitHub App's settings (client ID `GH_CLIENT_ID` in `~/.zshrc`), add `http://localhost:1337/api/auth/callback` as a callback URL. Today GitHub answers `redirect_uri_mismatch`. The production URL follows the first deploy. | 1 to 2 min | now (asked 01:00, 05:49, 06:43:26 and 10:42:03; reminded 12:36:24) | real GitHub sign-in locally and its live test | [sign-in](sign-in.md) |
| 3 | Should the heavy code viewer move into its own package, `@smthrs/repo-view` (B), or stay a one-subpath exception (A)? Recommended: B, so the repository view needs no exception to your root-imports rule. | 10 s | now (asked 02:35, 02:36, 05:49, 06:43:26 and 10:42:03) | `importRules` green for the app | [repo-view package split](repo-view-package-split.md) |
| 4 | Build against hosted only for now, leaving the self-hosted Mac install for later? Recommended: yes, with every service kept behind a Layer. | 10 s | now (asked 06:15:58, 06:43:26 and 10:42:03) | whether every remote service needs a local Layer now; the M-31 dogfooding plan | [self-hosted install](self-host-install.md) |
| 5 | The panels' questions, each with a recommended answer. **0012 Q1, about who GitHub shows (not GitHub Actions):** when you post a comment or an issue through Smithers, should it appear on GitHub under your own account, rather than the Smithers App's? Recommended: yes; the agent and flows post as the App. (The lead's shorthand "your GitHub actions show as you", 10:42:03 and 13:19:52, read as GitHub Actions; asked again in plain words 13:23:33. Until 13:28 this read: should a person's issues, comments, reviews and merges show on GitHub as that person (their own token) or as `smithers[bot]` "for @maya"?) Blocks G0's first write. **0012 Q2:** may we change the Smithers GitHub App (Issues, Pull requests and Contents read and write; a webhook and secret; its ID and key as deploy secrets)? Each installation owner must accept. Recommended: yes. (Until 13:28 it also asked for Checks and statuses read; dropped by the no GitHub Actions ruling, 13:21:27.) **0013 Q1:** on a public repository, is the live branch (conversation, terminals, presence, live edits) visible only to Members and people it's shared with? Recommended: yes; the code stays public. **0014 Q1:** are your own flows prompt flows (a `SKILL.md` plus the flows it may call, synced to your devices), with code flows only in repositories and sandboxes? Recommended: yes; the first slice then needs no sandbox. **0015, override if you disagree:** the needs-you toast shows even while its card is on screen; only the asker answers for now. | a few min | now (decisions written 06:58 to 07:03; the lead asked 0013 Q1 at 07:20:40, 0014 Q1 at 07:30:21 and 0012 Q1 and Q2 at 07:40:55; the builds use yes until Will changes them, and 0012 Q2 needs Will to change the App's settings; all four asked again 10:42:03; 0012 Q1 asked again in plain words 13:23:33) | 0012's G0, 0013's shapes, 0014's first slice | [pull requests](pull-request-list-and-tabs.md), [issue triage](issue-triage.md), [conversations](conversations-and-history.md), [branch terminal](branch-terminal.md), [branch sharing](branch-sharing.md), [flow authoring](flow-authoring.md), [flow debugging](flow-debugging.md), [home view](repository-declared-home.md) |
| 6 | Test the app at http://localhost:1337/app, signed in as the local developer. New since 07:06: the slash menu (⌘K, `/theme dark`), "open octocat/Spoon-Knife" and `/navigate`, "Show me https://example.com" and `/web … tab`, and "classify these" for Jev. | 5 to 10 min | under way since 05:56 | catches client and agent problems | [app wiring](app-wiring.md) |
| 7 | Review the code, starting with `packages/effect-tanstack-db` and `packages/effect-electric`. | 20 min for the packages | after the feature list (Will, 23:00); no longer before landing (Will, 06:39:37) | Will's sign-off; the first deploy still waits on his separate yes | [code reviews](code-reviews.md), [land and deploy](land-and-deploy-mvp.md) |
| 8 | Cap the fleet at about 8 agents at a time to stretch the second account, finishing the review fixes and landing first? About 15 agents run now, plus their sub-agents. The lead: "If you'd rather stretch this account, I can cap it at about 8 at a time." | 10 s | now (offered 11:42:48) | how long the second account lasts | [dev stack hygiene](dev-stack-hygiene.md) |
| 9 | **Set up the GitHub App** for issues. In its settings on GitHub: (1) repository permission **Issues**: Read and write (Metadata: Read stays on); (2) subscribe to the **Issues** and **Issue comment** events; (3) generate a new **private key**: `GH_APP_PEM` in `~/.zshrc` points to `smithers-jjhub.pem`, which isn't on this Mac, so save the key at that path or change the variable; (4) install the App on the repository Smithers should wrap and on a scratch repository you own, and tell the lead both names. Leave the webhook URL until a deploy gives the address. | 5 to 10 min | now (asked 12:54:04) | the issues create and comment e2e and the live GitHub tests; triage's label writes | [issues](issues.md), [GitHub source of truth](github-source-of-truth.md), [issue triage](issue-triage.md) |
| 10 | Name a Latitude server for a second build machine: its own clone, Postgres, Electric and dev server, pushing to `main` itself, so its agents skip this Mac's one test lock and one checkout. Not one of the two hosts running production sandbox workers, and not nyc-01, the benchmark rig. | 10 s | now (asked 13:21:12) | the waiting features: PRs and branch resync, branch sharing and sandboxes, agent repo navigation | [second build machine](second-build-machine.md), [dev stack hygiene](dev-stack-hygiene.md) |

Until 07:53 on 2026-10-20 the intro read: As of 07:42 on 2026-10-20. Row 5 is fully relayed: the lead asked 0013 Q1 at 07:20:40, 0014 Q1 at 07:30:21, and 0012 Q1 and Q2 at 07:40:55. All three first slices build on the recommended yes until Will changes it, but 0012 Q2 needs Will to change the GitHub App's settings himself. Round 1 landed on `main` (`bba8df6fab`) by 07:30 with no deploy ([land to main](land-to-main.md)), so the deploy still waits on Will's yes. No answer to rows 1 to 5 is on record by 07:42.

Until 07:37 on 2026-10-20 the intro read: As of 07:04 on 2026-10-20. At 06:43:26 the lead asked rows 1 to 4 again, in this order, after Will's burst of requests from 06:39 to 06:42 (all instructions, recorded under Answered and in [old app feature gaps](old-app-feature-gaps.md)). Row 5 is new: the design panels' questions. All three merged between 06:58 and 07:03 (decisions 0012, 0013 and 0014, each proposed) with four questions between them, and decision 0015 (agent status) adds two defaults Will may override. The lead hasn't relayed them by 07:04. Row 7 changed: at 06:39:37 Will said work lands on `main` before his review, so his review no longer gates landing ([land to main](land-to-main.md)). No answer to rows 1 to 4 is on record by 06:55.

The 06:26 version, for history. Its intro:

As of 06:26 on 2026-10-20. Row 4 is new: at 06:15:58 the lead relayed the old-app audit's one question for Will: should the new app build against hosted only for now, leaving the self-hosted Mac install for later? Recommended: yes. It joins the three older asks, rows 1 to 3. Rows 5 and 6 were rows 4 and 5: Will's test of the app has been under way since 05:56, and his code review waits on the [Fable review 2 fixes](fable-review-2-fixes.md). No answer to rows 1 to 4 is on record by 06:26.

Until 06:26 the intro read: As of 06:05 on 2026-10-20. Row 4 is under way: at 05:56 Will opened the app and the repository page `/octocat/Spoon-Knife`. From 05:58 to 06:02 he made three requests, each now with an agent: a [navigate flow](navigate-flow.md) (it answers the lead's 05:57 offer of an `open repository` flow), a [web page flow](web-page-flow.md), and an audit of the old app's features (tracked in [maintainer site](maintainer-site.md)). The lead's one new question, outside URLs for `navigate`, proceeds on its recommendation (below). No answer to rows 1 to 3 is on record by 06:05. Its table had no self-hosting row: its rows 1 to 3 are today's rows 1 to 3, and its rows 4 and 5 are today's rows 5 and 6.

Until 06:05 the intro read: As of 05:55 on 2026-10-20. Will came back at 05:49 after about 6 hours asleep. The lead's status summary ended with three asks, in this order: rotate the Grafana password, register the callback URL, and answer the repo-view package question. They stay rows 1 to 3. Row 4 is ready now: at 05:54 the lead said "The app is ready to test" and opened it. At 05:52 Will asked for slash-command autocomplete; that is an instruction, not a question, and a subagent builds it ([slash commands](slash-commands.md)). No answer to rows 1 to 3 is on record by 05:55.

| # | Ask | Your time | When | Unblocks | Note |
|---|---|---|---|---|---|
| 1 | **Security:** rotate the Grafana password, `TF_VAR_grafana_password` in `~/.zshrc`. The sign-in agent printed it into its transcript while reading `~/.zshrc`. The transcript stays on this Mac but went through the model, so treat the password as exposed. | 2 to 5 min | now (asked 01:00, again 05:49) | closes the exposure | [sign-in](sign-in.md) |
| 2 | In the Smithers GitHub App's settings (client ID `GH_CLIENT_ID` in `~/.zshrc`), add `http://localhost:1337/api/auth/callback` as a callback URL. Today GitHub answers `redirect_uri_mismatch`. The production URL follows the first deploy. | 1 to 2 min | now (asked 01:00, again 05:49) | real GitHub sign-in locally and its live test; the dev server signs you in as the local developer until then | [sign-in](sign-in.md) |
| 3 | Should the heavy code viewer move into its own package? The repo view imports `@smthrs/ui/adapters/repo-view`, a subpath. A: allow this one subpath as an exception. B: move the heavy renderers (Shiki, about 10 MB, and Milkdown) into their own package, `@smthrs/repo-view`, imported from its root. Recommended: B, so the repository view needs no exception to your root-imports rule. | 10 s | now (asked 02:35, 02:36, again 05:49) | `importRules` green for the app, its last red | [repo-view package split](repo-view-package-split.md), [repo clone and view](repo-clone-and-view.md) |
| 4 | Build against hosted only for now, leaving the self-hosted Mac install for later? The old app ran as one install on one Apple Silicon Mac. The new app runs on Cloudflare, Neon, Electric and Code Storage, and no note or decision designs a Mac install. The root `AGENTS.md` and M-31 assume one: Smithers' own development moves to the install on your Mac mini. Recommended: yes, hosted only now, with every service kept behind a Layer so self-hosting stays possible. | 10 s | now (asked 06:15:58) | whether every remote service needs a local Layer and a setup flow now; the M-31 dogfooding plan | [self-hosted install](self-host-install.md), [old app feature gaps](old-app-feature-gaps.md) |
| 5 | Test the app at http://localhost:1337/app, signed in as the local developer: ask a question; switch the theme by the header button, then by asking "switch to dark mode"; close the tab mid-answer and reopen it; go offline, ask and come back; sign out and back in; open `/octocat/Spoon-Knife`. | 5 to 10 min | **now**: ready since 05:54 (final run 36 of 37 passed, 1 skipped); under way since 05:56, when Will opened `/octocat/Spoon-Knife` | catches client and agent problems before review | [app wiring](app-wiring.md), [local-first](local-first.md), [repo clone and view](repo-clone-and-view.md) |
| 6 | Review the code, starting with `packages/effect-tanstack-db` and `packages/effect-electric` (`packages/effect-electric/src/ElectricCollection.ts`) | 20 min for the packages | after the feature list is finished (Will, 23:00); the Fable review ran first (05:54 to 06:08), and its 12 fixes run since 06:09 ([Fable review 2 fixes](fable-review-2-fixes.md)) | landing on `main` and the first deploy | [the packages](effect-tanstack-db-and-effect-electric.md), [code reviews](code-reviews.md), [land and deploy](land-and-deploy-mvp.md) |

The 02:43 version, for history. Its intro: "As of 02:43 on 2026-10-20. Row 3 is new: the lead asked it at 02:35 and again at 02:36, recommending B. It replaces the 01:00 table's row 3 (the `adapters` exception, recommended yes) and holds `//apps/mvp:importRules` red until answered; the Markdown half of that old row stays under "Building proceeds on the recommended answer". No answer to rows 1 and 2 is on record by 02:43. At 01:12 Will set the review order (Codex Astra, then fixes, then Fable); that is an instruction, not a question, and is recorded in [code reviews](code-reviews.md)." Its table:

| # | Ask | Your time | When | Unblocks | Note |
|---|---|---|---|---|---|
| 1 | **Security:** rotate the Grafana password, `TF_VAR_grafana_password` in `~/.zshrc`. The S1 agent printed it into its transcript while reading `~/.zshrc`. The transcript stays on this Mac but went through the model, so treat the password as exposed. | 2 to 5 min | now | closes the exposure | [sign-in](sign-in.md) |
| 2 | In the Smithers GitHub App's settings (client ID `GH_CLIENT_ID` in `~/.zshrc`), add `http://localhost:1337/api/auth/callback` as a callback URL. Today GitHub answers `redirect_uri_mismatch`. The production URL follows the first deploy. | 1 to 2 min | now | signing in locally, the live sign-in test, then testing the app signed in | [sign-in](sign-in.md) |
| 3 | The repo view imports `@smthrs/ui/adapters/repo-view`, a subpath. A: allow this one subpath as an exception. B: move the heavy renderers (Shiki, about 10 MB, and Milkdown) into their own package, such as `@smthrs/repo-view`, imported from its root. Recommended: B, no exception to your rule. | 10 s | now | `importRules` green for the app | [repo-view package split](repo-view-package-split.md), [repo clone and view](repo-clone-and-view.md) |
| 4 | Test the app: the agent flow and the repo view, signed in, offline, after a reload and in two tabs | 5 to 10 min | when the lead says it's ready; the app's engine worker doesn't load yet | catches client and agent problems before review | [app wiring](app-wiring.md), [local-first](local-first.md), [land and deploy](land-and-deploy-mvp.md) |
| 5 | Review the code, starting with `packages/effect-tanstack-db` and `packages/effect-electric` (`packages/effect-electric/src/ElectricCollection.ts`) | 20 min for the packages | after the feature list is finished (Will, 23:00) | landing on `main` and the first deploy | [the packages](effect-tanstack-db-and-effect-electric.md), [land and deploy](land-and-deploy-mvp.md) |

The 01:00 version, for history. Its intro: "As of 01:00 on 2026-10-20. Rows 1 and 2 are new and take minutes: S1 finished sign-in, and while reading `~/.zshrc` it printed `TF_VAR_grafana_password` into its transcript. The lead told Will both at 01:00. Rows 3 to 5 are the 23:47 table's rows 1, 3 and 4; its row 2, the callback URLs, is now row 2 with the exact URL. Rows 4 and 5 still wait for the lead's "ready to test"." Its table:

| # | Ask | Your time | When | Unblocks | Note |
|---|---|---|---|---|---|
| 1 | **Security:** rotate the Grafana password, `TF_VAR_grafana_password` in `~/.zshrc`. The S1 agent printed it into its transcript while reading `~/.zshrc`. The transcript stays on this Mac but went through the model, so treat the password as exposed. | 2 to 5 min | now | closes the exposure | [sign-in](sign-in.md) |
| 2 | In the Smithers GitHub App's settings (client ID `GH_CLIENT_ID` in `~/.zshrc`), add `http://localhost:1337/api/auth/callback` as a callback URL. Today GitHub answers `redirect_uri_mismatch`. The production URL follows the first deploy. | 1 to 2 min | now | signing in locally, the live sign-in test, then testing the app signed in | [sign-in](sign-in.md) |
| 3 | Two repo-view answers: may the app import `@smthrs/ui/adapters/*` as the one exception to root-only imports, and does Markdown stay read-only for now? Recommended: yes to both. Building proceeds on the recommendation; R3 to R5 started at 01:00. | 10 s | any time | the repo view's app integration | [repo clone and view](repo-clone-and-view.md), [deep-import migration](deep-import-migration.md) |
| 4 | Test the app: the agent flow and the repo view in chat, signed in, offline, after a reload and in two tabs | 5 to 10 min | when the lead says it's ready, after features 1 and 2 land in the app | catches client and agent problems before review | [app wiring](app-wiring.md), [local-first](local-first.md), [land and deploy](land-and-deploy-mvp.md) |
| 5 | Review the code, starting with `packages/effect-tanstack-db` and `packages/effect-electric` (`packages/effect-electric/src/ElectricCollection.ts`) | 20 min for the packages | after the feature list is finished (Will, 23:00) | landing on `main` and the first deploy | [the packages](effect-tanstack-db-and-effect-electric.md), [land and deploy](land-and-deploy-mvp.md) |

The 23:47 version, for history. Its intro: "As of 23:47 on 2026-10-19. Row 2 is new: S1 started sign-in at 23:39 and will report callback URLs for Will to register. The 23:15 table had today's rows 1, 3 and 4 as rows 1 to 3. At 22:16 Will asked for one question at a time, explained better; the lead explains each in plain words and waits for his answer. At 23:00 Will said to stop raising the MVP and build his feature list; when it is finished he tests the app and reviews the code. So rows 3 and 4 (rows 2 and 3 until 23:47) now wait for the lead's "ready to test"." Its table:

| # | Ask | Your time | When | Unblocks | Note |
|---|---|---|---|---|---|
| 1 | Two repo-view answers: may the app import `@smthrs/ui/adapters/*` as the one exception to root-only imports, and does Markdown stay read-only for now? Recommended: yes to both. Building proceeds on the recommendation. | 10 s | any time | the repo view's app integration | [repo clone and view](repo-clone-and-view.md), [deep-import migration](deep-import-migration.md) |
| 2 | Register the callback URLs S1 reports in the Smithers GitHub App's settings. 00:39 on 2026-10-20: `docs/features/sign-in.md` names `http://localhost:1337/api/auth/callback` for local dev and the deployed `url` plus `/api/auth/callback`; S1 hasn't reported | 1 to 2 min | when S1 reports | signing in with GitHub, then a deploy that lets signed-in people ask | [sign-in](sign-in.md) |
| 3 | Test the app: the agent flow and the repo view in chat, offline, after a reload and in two tabs | 5 to 10 min | when the lead says it's ready, after features 1 and 2 land in the app | catches client and agent problems before review | [local-first](local-first.md), [land and deploy](land-and-deploy-mvp.md) |
| 4 | Review the code, starting with `packages/effect-tanstack-db` and `packages/effect-electric` (`packages/effect-electric/src/ElectricCollection.ts`) | 20 min for the packages | after the feature list is finished (Will, 23:00) | landing on `main` and the first deploy | [the packages](effect-tanstack-db-and-effect-electric.md), [land and deploy](land-and-deploy-mvp.md) |

The 22:56 version's row 1, for history: "Is this the MVP?" (answered 23:00: "more or less right"; reference only). Its rows 2 to 4 were the repo-view answers, the package review and the app check, now rows 1 to 3.

The 22:49 version's row 1, for history: design question 11 of 14 (0007 Q3), 10 answered and 4 open.

The 22:43 version's row 1, for history: design question 8 of 14 (0005 Q3, sandbox budgets), 7 answered and 7 open.

The 22:41 version's row 1, for history: design question 7 of 14 (0005 Q2), 6 answered and 8 open.

The 22:36 version's row 1, for history: design question 6 of 14 (0005 Q1), 5 answered and 9 open.

The 22:24 version's row 1, for history: design question 2 of 14 (0003 Q2), 1 answered and 13 open, unblocking features 1 and 3, sandboxes, roles and notifications.

The 22:14 version of this table, for history: 1 restart W1 and the SDK defects agent (answered 22:16: accidental; restarted), 2 "accept all" on the 14 design questions (replaced at 22:16 by one at a time), 3 the package review, 4 the local-first app check. The lead's 22:15 ranking added the two repo-view answers as item 3.

The lead called the package review the most valuable code review: Will wants these to be generic, publishable libraries, and they set how every later feature reads and writes data.

The lead's 22:00 ranking, for history: 1 Code Storage organization name (answered 22:05), 2 Cloudflare token (answered 22:13), 3 the 14 design questions, 4 the package review, 5 the local-first app check.

### Blocking work now

| Question | Recommended | Blocks | Note |
|---|---|---|---|
| (Answered 13:31:14 on 2026-10-20: B; an agent builds `@smthrs/repo-view`.) The repo view's `@smthrs/ui/adapters/repo-view` import: A, one exception to root-only imports, or B, the heavy renderers in their own package imported from its root? (Asked 02:35 and 02:36 on 2026-10-20, and again at 05:49. At 05:54 the wiring agent reported it as the app's only `importRules` red.) | B | `//apps/mvp:importRules`, red on that one import | [repo-view package split](repo-view-package-split.md) |
| Review the new app's code so it can land on `main` and deploy. (06:39:37 on 2026-10-20: landing no longer waits. Will: "everything should be merged into main even before I review exiting code"; a lander pushes `main` from 06:42:50, [land to main](land-to-main.md). Deploying still waits on the row below.) | n/a | deploy | [land and deploy](land-and-deploy-mvp.md) |
| Say yes to the first `pnpm deploy` (stage `prod`)? The real plan passed at 22:13. | after the code review and sign-in | the live app | [infrastructure as code](infrastructure-as-code.md), [land and deploy](land-and-deploy-mvp.md) |
| (From 13:26:18 on 2026-10-20 part of one GitHub App visit, row 1 of "Next for Will".) Register `http://localhost:1337/api/auth/callback` in the Smithers GitHub App's settings; the production URL after the first deploy. (01:00 on 2026-10-20: S1 reported; GitHub answers `redirect_uri_mismatch` until then. Until 01:00 this row asked to register the callback URLs S1 reports. Until 23:39 this row asked: approve building decision 0008 phase 1 (sign-in) now? 23:02: the lead queued it after W5, since both edit `worker/ChatApi.ts`. 23:39: the lead started it as S1 on the recommendation.) | n/a | signing in, then a public deploy that lets signed-in people ask | [sign-in](sign-in.md) |
| Where should the token-spend alert and the Code Storage 50/80/100% budget alerts reach you: Telegram, email or other? | n/a | both alerts | [token-spend alerts](token-spend-alerts.md), [Code Storage spend caps](code-storage-spend-caps.md) |
| Which repo did "effectscript-ts" mean? Then transfer the repos, or run `gh auth refresh -h github.com -s repo,admin:org` | n/a | the repo move | [move effectscript repos](move-effectscript-repos.md) |

### Building proceeds on the recommended answer

| Question | Recommended | Note |
|---|---|---|
| 0016 Q1: a TODO's run (plan, write the change, open the PR, wait for the merge) runs on Cloudflare, not in the committer's browser. Settled by the lead at 13:45:10 (0011: work that must go on with every device off runs remotely) | Cloudflare | [TODOs and the stack](todos-and-stack.md) |
| 0016 Q2: slice 1's agent writes a TODO's change from reading the code, until it can run code on the branch's machine. Settled by the lead at 13:45:10 | yes | [TODOs and the stack](todos-and-stack.md) |
| Branch sharing: private until shared, "can view" or "can edit", an optional link for repository Members, the owner revokes (the lead, 13:32:34, under Will's 13:31:14 "use common sense") | Google Docs and Figma conventions | [branch sharing](branch-sharing.md) |
| Session expiry: a request with an expired or invalid session cookie answers 401, so the device keeps its synced copy and shows sign-in; an explicit sign-out still wipes (the lead, 13:38:52; 0008 says 401 or 403) | keep the copy | [the packages](effect-tanstack-db-and-effect-electric.md), [P3 cleanup](review-round-4-p3-cleanup.md) |
| Should `app/navigate` go to outside URLs, for example after a confirmation step? Asked 05:58 on 2026-10-20: "Tell me if you want outside URLs allowed, for example with a confirmation step." Outside pages go through the web page flow instead, which always shows the address | same-origin app paths only | [navigate flow](navigate-flow.md), [web page flow](web-page-flow.md) |
| Codex review 2, finding 4: may a library call the web-standard globals all four runtimes ship (`fetch`, `crypto.subtle`), or must WebCrypto come through an injected service? By 23:12 the lead ruled they aren't platform code and wrote it into `docs/libraries.md`; you may overrule | the ruling stands | [web-standard globals](web-standard-globals-rule.md) |
| Override any of the lead's three 0009 choices (22:56): a finished run disappears after `Done`; no toasts for someone else's run; built-in routing only. 22:58: Will overrode the second (see Answered); the first and third stand | keep them | [notifications](notifications-and-live-work.md) |
| The 4 open design questions, 0007 Q3 and 0009 Q1 to Q3; all closed at 22:56 (7 at 22:43 and 8 at 22:41; 0003 and 0004 answered by 22:35, 0005 Q1 at 22:41, 0005 Q2 at 22:42, 0005 Q3 deferred at 22:45, 0007 Q1 at 22:48, 0007 Q2 at 22:49; Will answers one at a time) | the recommended answer to each | [design questions](design-questions.md) |
| Markdown in the repo view stays read-only for now? | yes | [repo clone and view](repo-clone-and-view.md) |
| Which usage questions should metrics answer first? | daily askers, asks per person, time to first answer text | [observability](observability.md) |
| File the Electric client issues on Electric's GitHub? | don't file unless you say so | [Electric client bug report](electric-client-bug-report.md) |
| Ask Cerebras about Enterprise limits now or after a load test? | after | [Cerebras rate limits](cerebras-rate-limits.md) |
| Code Storage budgets: 3 GB stored, 40 GB read a month, 1 GB per repository, 100 repositories, $20 alert base? | yes (worst-case month about $17) | [Code Storage spend caps](code-storage-spend-caps.md) |

### Answered

| Question | Answer | Note |
|---|---|---|
| Does a Tuesday launch of the old stack still happen? Retire the old backend? | Answered by rulings (2026-10-20 docs truth pass): no Tuesday launch; the new app replaces the old stack (SCOPE-1), and the old backend is retired with Google Cloud (ARCH-1, Will 12:59 on 2026-10-19: "move to cloudflare only and abandon gcloud"). Drop the queue item. | [legacy smithers.sh](legacy-smithers-sh.md), [rulings](../rulings.md) |
| Publish VibeLang 0.0.2 now? | Answered by OTHER-2 (14:00 on 2026-10-20): "we will publish at the end" of the migration. Drop the queue item. | [vibelang 0.0.2](vibelang-0-0-2-publish.md), [rulings](../rulings.md) |
| `effect.boundary-only`: Will's narrow "where necessary" over `apps/mvp/AGENTS.md`'s broader reading? | Answered by SDK-7: Will's words outrank the doc. `apps/mvp/AGENTS.md` is narrowed and `rules.md` closed (docs truth pass, 2026-10-20). | [ImportRules and Jev](import-rules-and-jev-lint.md), [rulings](../rulings.md) |
| Does `ModelProxy` come back in `@smthrs/model` or only in the app's `worker/`? | `@smthrs/model`, per SDK-1 (extend the SDK) and ARCH-17 (Will, 16:16 on 2026-10-19: "Name the package thing ModelProxy please"); restored 23:39. | [model endpoint](model-endpoint.md), [rulings](../rulings.md) |
| Row 1 (13:26:18): the GitHub App's settings in one visit | 14:08:55 on 2026-10-20 (queue): done through Arc. Callback URL added; Issues, Pull requests and Contents Read and write; eight events; a new key at `~/.secrets/smithers-jjhub.pem`; installs on `smithersai/smithers` and the new public `roninjin10/smithers-github-tests`. Webhook URL waits for a deploy. 14:12:55: an agent runs the live tests. | [issues](issues.md), [sign-in](sign-in.md) |
| Row 7 (13:21:12): name a Latitude server for a second build machine | 14:09:17 (queue): "The servers are yours to do whatever you want". A Codex Sol coordinator runs SDK lanes on msb-lat-nyc-01. | [second build machine](second-build-machine.md) |
| Row 6 (11:42:48): cap the fleet at about 8 agents? | 14:07:58: dropped by the curator; "ship faster" already answered it. | [dev stack hygiene](dev-stack-hygiene.md) |
| Playground choice 1: the code is the source of truth, not the form | 14:11:48 (queue): option 1, accepted. | [Smithers Playground](smithers-playground.md) |
| Playground choice 2: a time-first run inspector with Kill host | 14:19:59 (queue): option 1, accepted. | [Smithers Playground](smithers-playground.md) |
| Row 2 (since 01:00): rotate the exposed Grafana password | 14:20:47 (queue): "Can we self host grafana instead of using graafana cloud". A Codex lane sets up the LGTM stack on msb-lat-nyc-01; the Cloud password stays exposed until that stack is deleted or rotated (row 2 now). | [self-hosted Grafana](self-hosted-grafana.md) |
| Row 5 (13:45:10): keep the TODO stack order in Postgres, with no `mythical` ref? | 14:21:35 (queue): "Remove mythical history stuff we are adding that later not now". 0016 stands; the docs truth pass removes the `mythical` stack for now. | [TODOs and the stack](todos-and-stack.md), [docs truth pass](docs-truth-pass.md) |
| Row 4 (13:32:34): M-31 under hosted only | 14:22:33 (queue): "A lot of our docs are out of date we need to update them the source of truth is htis mvp. we are building and what we are doing now". 14:25: the docs truth pass started. | [self-hosted install](self-host-install.md), [docs truth pass](docs-truth-pass.md) |
| Row 3 (07:30:21): 0014 Q1, your own flows are prompt flows, code flows live in repositories | 14:26:24 (queue): "No everything is a flow this ruling is clear prompt flows are just a type of code flow". Reverses the recommended yes; an agent merges them into one `Flow.make` model. | [prompt flows are code flows](prompt-flows-are-code-flows.md), [flow authoring](flow-authoring.md) |
| (Change request) the repository home GIF | 14:27:10 (queue): "I don't think the demo worked". The home-view agent fixes the product and records it again. | [home view](repository-declared-home.md) |
| (Change request) the message controls GIF | 14:27:56 (queue): "copy should not be visible nor should the timestamp unless you are already hovering over the message". Unassigned at 14:30. | [message controls](chat-message-controls.md) |
| (Unasked) Run more on the Latitude servers and free disk here | 14:16:52: "we should be running more stuff on latitude servers and freeing up unused worktrees and disk space please have an agent find safe disk space on this machine to free". | [disk space](disk-space.md), [second build machine](second-build-machine.md) |
| Quick question 1 (13:26:18; row 3 since 02:35): move the heavy code viewer into its own package, `@smthrs/repo-view`? | 13:31:14 on 2026-10-20: "Yes move code viewer to it's own package." 13:32:34: an agent started; the old import path is deleted. | [repo-view package split](repo-view-package-split.md) |
| Quick question 2 (row 4 since 06:15:58): build for hosted only now, the self-hosted Mac install later? | 13:31:14: "Built for hosted only now yes cut scope in that way." Deferred; the M-31 line it contradicts is now row 4 of "Next for Will". 14:04: recorded in decision 0010 ("Hosted only") and `todo.md` ("the self-hosted install, after ship"). | [self-hosted install](self-host-install.md) |
| Quick question 3 (0013 Q1): is a shared branch visible only to Members and the people it's shared with? | 13:31:14: "Shared branch you should be able to use common sense and how other collaboration tools to figure it out without asking me questions." 13:32:34: the lead decided by Google Docs and Figma; no more sharing questions. 14:05: recorded in decision 0013 (decisions 8, 9 and 12; Q1 closed). | [branch sharing](branch-sharing.md) |
| 0012 Q1: should what you post through Smithers appear on GitHub under your own account, rather than the App's? (Asked in plain words 13:23:33.) | 13:25:53: "yes should appear under your account is better ux". Recorded in 0012; issues already work this way. | [issues](issues.md), [pull requests](pull-request-list-and-tabs.md) |
| (Unasked) How much weight do flows get? | 13:31:14: "Flows are the most important part of oour product and technology and should be supported very very well but we should be thoughtful and high quality with adding support to flows." He asked for the Smithers Playground; an Opus agent started 13:32:34. The lead holds every flow feature to a higher bar. | [Smithers Playground](smithers-playground.md), [flow authoring](flow-authoring.md) |
| Item 1 of the lead's 13:19:52 list, "your GitHub actions show as you" (meant 0012 Q1, read as GitHub Actions) | 13:21:27 on 2026-10-20, a ruling: "Githubactions we don't support those at all we should not have any view or support for github actions. We support smithers workflows however which are very similar but run on our servers". A PR's Checks tab shows Smithers workflow runs on its head SHA; 0012 drops GitHub checks, statuses and their permissions (docs agent from 13:23:25). 0012 Q1 itself stays open in row 5. | [no GitHub Actions](no-github-actions.md), [pull requests](pull-request-list-and-tabs.md) |
| Can any of the not-started features start in parallel now? (Will asked 13:20:28 and 13:20:43; the lead offered four at 13:21:12: "Should I start those four now?") | 13:21:41 on 2026-10-20: "start the ones that can start now we are trying to ship faster". 13:22:43 to 13:23:25: the lead started agent evals, the secrets egress proxy, token-spend alerts, notifications slice 1, Panel T (TODOs design) and the 0012 docs agent. | [agent evals](agent-evals.md), [secrets](secrets-proxy.md), [spend alerts](token-spend-alerts.md), [notifications](notifications-and-live-work.md), [TODOs](todos-and-stack.md) |
| Which of the 19 old-app gaps to build, and in what order? (The audit's question; the lead hadn't asked it.) | 06:39:05 on 2026-10-20: "ability to open terminal in an iframe is important. Message controls is important. One conversation per branch is important. Repo view extras we should do. Pull request list and generally finishing the entire git e2e flow ... ability to create a repositories own home view is important. Stuff related to flows debugging flows creting flows which wasn't listed is another one." Three design panels and three builders started 06:41 to 06:43. | [old app feature gaps](old-app-feature-gaps.md) |
| Hold the new app's commits locally until Will reviews the code? (His earlier rule: "I will review the code before moving on".) | 06:39:37 on 2026-10-20: no. "let's get all thee done. also before I mentioned don't merge it into main right away I changed mind everything should be merged into main even before I review exiting code". A lander started at 06:42:50; no deploy. | [land to main](land-to-main.md), [land and deploy](land-and-deploy-mvp.md) |
| Should the lead build an `open repository` flow, so a repository opens from chat and with `/open owner/repo`? Asked 05:57 and 05:58 on 2026-10-20 | 05:58: a general flow instead. "Let's add a flow called navigate that navigates to a url and make sure the agent can call it too". The lead started it at once. | [navigate flow](navigate-flow.md), [agent repo navigation](agent-repo-navigation.md) |
| Create a Code Storage organization (Starter, $20/month minimum) and add its key? | 21:49 to 21:51: Will bought Starter and put the private key in `~/.zshrc` as `CODE_STORAGE_API_KEY`. | [repo clone and view](repo-clone-and-view.md) |
| What's the Code Storage organization name (the subdomain in `api.<org>.code.storage`)? | 22:05: "smithers is org name". 22:06: the live test passed 2 of 2. | [repo clone and view](repo-clone-and-view.md) |
| Restart W1 (engine) and the SDK defects agent, stopped at 22:08? Asked 22:09, 22:13, 22:14 and 22:16. | **Accidental; restarted.** 22:16: Will: "I never stopped any agents" and "If I stopped an agent it was unintentional". 22:17: the lead restarted both; fresh replacements started about 22:20 and continue from the work on disk. | [durable answering](durable-answering.md), [model-host Effect boundary](model-host-effect-boundary.md) |
| Design question 0003 Q1: does the agent loop run on Cloudflare, with the browser only asking? | 22:22: "sure let's do it on cloudflare but make sure our cloudflare code is decoupled from cloudflare via dependency injection because our native app version later will just run the cloudflare code locally". Recorded in decision 0003; new rule `sdk.host-agnostic-flows`. | [design questions](design-questions.md), [host-agnostic flows](host-agnostic-flows.md) |
| Add Secrets Store read and Hyperdrive edit to your Cloudflare API token, or run `! alchemy login`? | 22:11 to 22:13: Will added **Account → Secrets Store → Edit** and **Account → Hyperdrive → Edit** to the "baseapp" token, the one in `CLOUDFLARE_API_TOKEN`. 22:13: the real `alchemy plan --stage prod` passed. | [infrastructure as code](infrastructure-as-code.md) |
| Design question 0003 Q2: single-write browser flows on the in-memory engine until one has to wait? | 22:25: "A syncronous change to storage is by default durable yea. ... The agent should run on frontend and the frontend itself should be durable." 22:29: Smithers must run in the browser through `platform-browser`; model calls go through the server; the app is a PWA; "We prefer things to be local first actaully". Recorded as decision 0011, accepted 22:31. | [durable browser engine](durable-browser-engine.md), [flows and the agent](flows-and-agent.md) |
| Multiple tabs: run the engine in a service worker? | 22:29: "You can decide this". The lead chose a leader tab's dedicated worker, elected with Web Locks; the service worker only serves the PWA offline. | [durable browser engine](durable-browser-engine.md) |
| Design question 0004 Q1: generated views are pure layouts with declared events? | 22:32: "this makes sense go with your best judgement here I like yhow you are thinking". | [agent UI](agent-ui-rendering.md) |
| Design question 0004 Q2: the renderer stays on Qwen until evals show it fails? | 22:34: "Yea you got it same model but make it super easy to configure by us as admins". Named roles plus `admin/SetModel`. | [model endpoint](model-endpoint.md) |
| Design question 0004 Q3: views sync across devices? | 22:35: "Yes it syncs this is what enables multiplayer to work". Decision 0004 accepted. | [agent UI](agent-ui-rendering.md) |
| Design question 0005 Q1: is losing running processes on sleep acceptable, so sandboxes use Cloudflare? | 22:41: Cloudflare. "So it's durable so sleeping shouldn't cause issues also couldn't we manually kick the container on the backend to stop it from sleeping or something?" Sleep is our own durable decision (`sandbox/Keep`) after 15 idle minutes with no running job. | [sandboxes](sandboxes.md) |
| Design question 0005 Q3: sandbox limits as admin settings (20 awake per deployment, 2 per person, $100/month alert, 30-day snapshots)? | 22:45: deferred. "Add this as a TODO but we won't worry about this until we ship." In 0005 and `todo.md`. | [sandbox budgets](sandbox-budgets.md) |
| Design question 0007 Q1: should GitHub's five roles replace M-05's three? | 22:46 to 22:48: four roles. "Let's do admin, maintainer, trusted contributor, untrusted contributor but maybe name them better than that." Then "role names are good": Admin, Maintainer, Member, Guest. | [roles and labels](roles-and-labels.md) |
| Design question 0007 Q2: only Maintainers merge into main by default? | 22:49: "Merging into main is actually triggering a workflow and that workflow is configurable. By default maintainers and up obviously". | [PR review and merge](pr-review-and-merge.md) |
| Design question 0007 Q3: may event-started flows apply ordinary labels as Smithers? | 22:56: deferred. "question 11 I think is thinking too far ahead whatever asked the question is doing too much we haven't gottent hat far yet." 06:41:17 on 2026-10-20: back in scope for triage labels. Will: "we need the ability to customize issue triage so issues should have accepted or not accepted and workflow can accept them or reject via an agent"; Panel G designs it in 0012. | [roles and labels](roles-and-labels.md), [issue triage](issue-triage.md) |
| Design questions 0009 Q1 to Q3 | 22:56: settled by the lead with the simplest choice, recorded in 0009 §8: a finished run disappears after `Done` and a failed one stays; no toasts for someone else's run; built-in routing only. Will may override. | [notifications](notifications-and-live-work.md) |
| Is this the MVP? Items 1 TODOs, 2 review and merge, 3 GitHub as truth, 4+6 live work and notifications, each trimmed. Asked 22:56 and 22:59; earlier asked as "Approve MVP items 1, 2 and 3 as trimmed?" | 23:00: reference only. "Don't worry about the mvp I gave you a list of things we are building that's what we are building now and it's insufficient for mvp but once we finish everything we got so far I need to test the app review the code ... But yes it's more or less right". Work follows features 1 to 8. | [MVP scope cut](mvp-scope-cut.md) |
| The lead's 0009 Q2 settlement (22:56): no toasts for someone else's run | 22:58: **overridden.** "Some toasts you should see for other people's runs if they are on same branch as you for sure this goes back to what I said about feeds being tied to user, branch repository etc. Main changing is tied to repository for example or a new release tied to repositry." Toasts follow scope: person (your runs, anything that needs you), branch (every run on a branch you're on, including other people's and the agent's), repository (`main` changed, a new release). Recorded in 0009 §8. | [notifications](notifications-and-live-work.md) |
| Design question 0005 Q2: does the agent's loop stay in the browser, with only its tools in the sandbox? | 22:42: yes. "This is a great question! So we want the sandbox to only expose the sandbox and it's tool and the agent to be independent of that. We want as modular/durable an architecture as possible." A sandbox exposes only the machine and its tools as durable steps; the agent binds them from its own host. | [sandboxes](sandboxes.md), [connecting it all](connect-agents-sandboxes-forge.md) |
| Approve building decision 0008 phase 1 (sign-in) now? Asked 23:02 | 23:39: no answer needed. The lead started it as S1 on the recommendation once W5 freed `worker/ChatApi.ts`. Will registers S1's callback URLs next. | [sign-in](sign-in.md) |

## Why

Will asked at 21:31 on 2026-10-19 whether the design questions were in his maintainer app. Questions sit in about 20 notes; this card puts them in one column so one reply can settle them.

## State

- 2026-10-19, 21:39 and 21:43: the lead asked Will about the Code Storage organization. No answer yet.
- The 14 design questions were asked at 21:21, 21:23 and 21:29. No answer yet.
- 21:45: the lead asked Will to widen the Cloudflare token or run `alchemy login`. No answer yet.
- 21:49 to 21:51: Will bought Code Storage Starter and named the key variable; he also asked for graceful failure at capacity ([spend caps](code-storage-spend-caps.md)). 21:52: the lead asked for the organization name. No answer at 21:54.
- 21:54: the 14 design questions are still unanswered.
- About 22:00: Will asked what the highest-value way to help is. The lead ranked five asks, now the "Next for Will" table above, and asked again for the organization name. App check at 22:04: http://localhost:1337/app answers 200.
- 22:04: no answer yet to any of the five.
- 22:05: Will named the Code Storage organization `smithers`. 22:06: the live clone test passed 2 of 2 ([repo clone and view](repo-clone-and-view.md)).
- 22:06 to 22:09: the lead first asked Will to run `alchemy profile edit` in his own terminal; it isn't installed globally, and `pnpm exec` fails without an interactive terminal. Will asked why his Cloudflare token in env wasn't enough. The lead tested it: Workers and Containers answer; Hyperdrive and Secrets Store return "Authentication error".
- 22:08: two agents stopped, W1 and the SDK defects agent; the lead attributed it to Will, who said at 22:16 it was unintentional. 22:09, 22:13 and 22:14: the lead asked whether to restart them. No answer at 22:14.
- 22:11: Will added Secrets Store to the "baseapp" token; still failing without Hyperdrive. 22:13: Will added Hyperdrive; the real plan passed ([infrastructure as code](infrastructure-as-code.md)). Rows moved to Answered.
- 22:14: the 14 design questions are still unanswered.
- 22:15: Will: "Ok what is the next highest impact way I can help?" The lead ranked five asks: restart both agents, "accept all", the two repo-view answers, the package review, the app check.
- 22:16: Will: "Can you do one at a time and explain it better". The lead explained the restart question alone. Will: "I never stopped any agents"; "If I stopped an agent it was unintentional". 22:17: the lead restarted both; fresh replacements started about 22:20 and continue from the work on disk. Row moved to Answered.
- 22:17: the lead asked design question 1 of 14 on its own, with a diagram. 22:22: Will answered yes, with a dependency-injection condition ([host-agnostic flows](host-agnostic-flows.md)). Row moved to Answered.
- About 22:18: the lead saved `CLOUDFLARE_ACCOUNT_ID` and `NEON_ORG_ID` to `apps/mvp/.env` ([infrastructure as code](infrastructure-as-code.md)). Not a question for Will; it closes the tracker's last infrastructure gap.
- 22:22: the lead asked design question 2 of 14. No answer at 22:24.
- 22:25 to 22:31: Will answered design question 2 by moving the agent into the browser; the lead recorded decision 0011, accepted. Rows moved to Answered.
- 22:32 to 22:35: Will answered all three 0004 questions; 0004 is accepted. Rows moved to Answered.
- 22:35: the lead asked design question 6 (0005 Q1). No answer at 22:36.
- 22:38 to 22:41: Will asked whether the lead suggested Freestyle (no, Cloudflare) and why a sandbox would sleep mid-job (it doesn't). 22:41: he chose Cloudflare; row moved to Answered. The lead asked design question 7 (0005 Q2). No answer at 22:41.

- 22:42: Will answered design question 7 (0005 Q2): yes, the sandbox exposes only itself and its tools and the agent is independent of it. Row moved to Answered. 22:43: the lead asked design question 8 (0005 Q3, sandbox budgets). No answer at 22:46.
- 22:45: Will deferred design question 8 until we ship; it is a TODO ([sandbox budgets](sandbox-budgets.md)). 22:48: he answered question 9 with four roles named Admin, Maintainer, Member and Guest. 22:49: he answered question 10: merging runs a configurable merge flow, Maintainers and up by default. Rows moved to Answered. 22:49: the lead asked question 11 (0007 Q3). No answer at 22:53.
- 22:47: the model-host fixes agent finished; all three fixes pass ([model-host Effect boundary](model-host-effect-boundary.md)). Not a question for Will.
- 22:56: Will deferred question 11 as "thinking too far ahead". The lead settled 0009's three questions itself and closed all 14 design questions ([design questions](design-questions.md)). Then it asked Will to approve the MVP list: "Is this the MVP?" ([MVP scope cut](mvp-scope-cut.md)).
- 22:58: Will overrode the lead's second 0009 choice: toasts follow scope (person, branch, repository), so a teammate's run on your branch toasts for you. Recorded in 0009 §8 ([notifications](notifications-and-live-work.md)).
- 22:59: the lead asked the MVP question again. 23:00: **Will: reference only**, "Don't worry about the mvp"; build the feature list, then he tests the app and reviews the code. The MVP row left "Next for Will" and "Blocking work now" for Answered. 23:02: the lead started W5 (a)+(c), L1, V1+V2, the integrations root and the 0007 rewrite, and said it will tell Will when the agent flow and repo view are ready to test.
- By 23:12: the lead told Will that 0007 is rewritten and accepted with four roles, so no roles question is open ([roles and labels](roles-and-labels.md)). It also reported Codex review 2 and rejected finding 4 (ambient `crypto.subtle`), ruling that web-standard globals aren't platform code; Will may overrule, so the row is under "Building proceeds on the recommended answer" ([web-standard globals](web-standard-globals-rule.md)).

- 23:39 to 23:41: no question went to Will. The lead reported W5 (a)+(c) and B1 done and started S1 (sign-in), the [flows root](flows-root-platform-neutral.md) fix, F1 and F4+F5. It answered its own `1.0.0-rc.15` question: the webhook bug never shipped ([integrations root](integrations-browser-safe-root.md)). S1 will report callback URLs for Will to register, row 2 of "Next for Will" ([sign-in](sign-in.md)).

- About 00:55 to 01:03 on 2026-10-20: the [SDK test reds](sdk-test-reds.md), [sign-in](sign-in.md), the [edge cache](platform-cloudflare-edge-cache.md) and the [integrations retries](integrations-durable-retries.md) finished. None needs a decision from Will.
- **About 01:00: two asks.** The lead to Will: "Register the sign-in callback URL. In the Smithers GitHub App's settings (the one whose client ID is `GH_CLIENT_ID` in `~/.zshrc`), add `http://localhost:1337/api/auth/callback` as a callback URL." And: "Rotate your Grafana password. While reading `~/.zshrc`, the sign-in agent printed `TF_VAR_grafana_password` into its transcript. That transcript stays on this Mac but went through the model, so treat the password as exposed." Rows 1 and 2 of "Next for Will". No answer at 01:05.

- 01:12 on 2026-10-20: Will: "remember to have /codex astra review code and then once responding to it's reviews have fable review". An instruction, not a question: the lead started the Astra review and saved the order in `rules.md` ([code reviews](code-reviews.md)).
- About 02:16 to 02:27 on 2026-10-20: [model endpoint](model-endpoint.md) and [sign-in](sign-in.md) went back to done after their Astra fixes. None needs a decision from Will.
- **02:35 on 2026-10-20: a new ask.** With the repo view built, the lead asked: "One question about your root-imports-only rule: the repository view imports `@smthrs/ui/adapters/repo-view`, a subpath." A: allow it as an exception; B: move the heavy renderers into their own package, e.g. `@smthrs/repo-view`. "Should I split them into their own package (B)?" 02:36: asked again. Row 3 of "Next for Will" ([repo-view package split](repo-view-package-split.md)).
- By 02:43: no answer to rows 1 to 3.

- **05:49 on 2026-10-20: Will is back.** "I fell asleep for about 6 hours but I'm back. What is the update I see you are still working on some things". The lead answered with a table of what finished overnight, what is still running (the final browser run, the [plan identity](plan-identity-across-deploys.md) fix, then the Fable review) and three asks under "Needs you": 1, rotate the Grafana password; 2, register `http://localhost:1337/api/auth/callback` in the Smithers GitHub App; 3, "should the heavy code viewer move into its own package (`@smthrs/repo-view`)? I recommend yes, so the repository view needs no exception to your root-imports rule." Rows 1 to 3 of "Next for Will", in that order.
- **05:52 to 05:53 on 2026-10-20: a new request, not a question.** Will: "The old app supports autocompleting / commands can you add that feature", then "Just have a subagent do it you don't have to do it yourself". The lead started a subagent ([slash commands](slash-commands.md)).
- **05:54 on 2026-10-20: the app is ready to test.** The wiring agent reported done, and the lead opened http://localhost:1337/app for Will with six things to try and three known issues ([app wiring](app-wiring.md)). Row 4 of "Next for Will" moved from "when the lead says it's ready" to now. The Fable review started, ahead of Will's code review, row 5 ([code reviews](code-reviews.md)).
- By 05:55: no answer to rows 1 to 3.
- **05:56 to 05:57 on 2026-10-20: Will tests the app (row 4).** "how do I view a repo?" The lead opened http://localhost:1337/octocat/Spoon-Knife. Then: "Can I open a repo via the chat from the home page though or do I have to travel directly to the url?" The lead: "Not yet: you have to type the URL", and asked: "Should I have it built now? It would be an `open repository` flow the agent can call from chat". 05:58, asked again after the plan-identity news ([plan identity across deploys](plan-identity-across-deploys.md)).
- **05:58 on 2026-10-20: answered with a request.** Will: "Let's add a flow called navigate that navigates to a url and make sure the agent can call it too". The lead started an agent and asked one question: "Tell me if you want outside URLs allowed, for example with a confirmation step." Building proceeds on same-origin only ([navigate flow](navigate-flow.md)).
- **05:58:50 on 2026-10-20: a request, not a question.** Will: "Add a flow where an agent can open a webpage in the chat iframe view or in a new tab too while we are at it" ([web page flow](web-page-flow.md)).
- **06:02 on 2026-10-20: a request, not a question.** Will: "Can you have an agent look at our mvp app and look at the more feature complete app we built before in apps ... and add to the maintainer app every feature we haven't implemented yet and isn't planned. Generally make sure that maintainer app is up to date". An audit agent writes one `idea` note per gap plus an index ([maintainer site](maintainer-site.md)).
- By 06:05: no answer to rows 1 to 3.
- 06:09 on 2026-10-20: Fable review 2 adds no question for Will. On P2-3 it notes that keeping one leader tab would mean revising Will's 0002 answer ("The composer always sends"); the lead keeps the answer and has the code fixed ([Fable review 2 fixes](fable-review-2-fixes.md)). Row 5 now waits on those fixes.
- By 06:15: no answer to rows 1 to 3.
- **06:15:58 on 2026-10-20: a new ask, from the old-app audit.** The lead to Will: "The old-app gap audit is done. It found 19 features the new app neither has nor plans, each now an idea card in the maintainer site." After the top 5: "One question it raises for you: the self-hosted install on a Mac. Should the new app target hosted only for now, leaving the Mac install for later? The audit recommends yes." Row 4 of "Next for Will" ([self-hosted install](self-host-install.md), [old app feature gaps](old-app-feature-gaps.md)). The audit's other question, which gaps to build and in what order, isn't an ask from the lead yet.
- 06:21:41 on 2026-10-20: the lead told Will the web page flow now refuses to embed the app's own origin. A report, not a question ([web page flow](web-page-flow.md)).
- By 06:26: no answer to rows 1 to 4.
- **06:39:05 to 06:42:01 on 2026-10-20: six instructions from Will, no answers to rows 1 to 4.**
  - 06:39:05: his priorities from the old-app gaps (moved to Answered).
  - 06:39:37: "let's get all thee done", and work lands on `main` before his review (moved to Answered; [land to main](land-to-main.md)).
  - 06:40:35: Google Docs-style branch sharing ([branch sharing](branch-sharing.md)).
  - 06:41:17: customizable issue triage, which reopens 0007 Q3 for triage labels ([issue triage](issue-triage.md)).
  - 06:41:24: "The agent in smithers should have access to jev" ([agent Jev](agent-jev.md)).
  - 06:42:01: agent status updates, designed by a designer ([agent status](agent-status.md)).
- **06:43:26: the lead asked rows 1 to 4 again**, under "Blocked on you today": rotate the Grafana password; register the callback URL; the heavy code viewer's own package (recommended yes); hosted only (recommended yes). "Each design panel will add at most three questions when it finishes." Row 5 of "Next for Will".
- By 06:55: no answer to rows 1 to 4; no panel has merged.
- **06:58:01 to 07:03:40: the decisions are written, all `proposed`:** 0015 agent status (06:58:01), 0012 git end to end (06:58:11, 2 questions), 0014 flows and the home view (07:02:13, 1 question) and 0013 the branch workspace (07:03:40, 1 question). Row 5 now lists them. By 07:04 the lead hasn't relayed them, and no answer to rows 1 to 4 is on record.
- **07:20:40 on 2026-10-20:** the lead relayed 0013 Q1 to Will (row 5): "on a public repository, should the live branch (conversation, terminals, presence, live edits) be visible only to Members and the people it's shared with? I recommend yes; the code itself stays public." The first slice of 0013 builds on yes ([branch terminal](branch-terminal.md)). The other row 5 questions (0012 Q1 and Q2, 0014 Q1) aren't relayed yet; Panel G hadn't reported by 07:26.
- **07:30:21 on 2026-10-20:** the lead relayed 0014 Q1 to Will: "may your personal flows be prompt-only (instructions plus the flows they may call, stored in Smithers), with code flows living only in repositories and running only in a sandbox? I recommend yes. It lets this ship now without waiting for sandboxes." 0014's first slice builds on yes ([flow authoring](flow-authoring.md)). 0012 Q1 and Q2 aren't relayed; Panel G hadn't reported by 07:37.
- 07:30:21: round 1 landed on `main` (`bba8df6fab`, 28 commits) with no deploy. Row 7 and the deploy question in [land and deploy](land-and-deploy-mvp.md) stand. No answer to rows 1 to 5 is on record by 07:37.
- **07:40:55 on 2026-10-20:** Panel G done; the lead relayed 0012's two questions: "1. Should your issues, comments, reviews and merges show on GitHub as you, using your own sign-in token, rather than as the Smithers App? I recommend yes. 2. May the Smithers GitHub App gain the permissions and webhook this needs? The agent will list exactly which ones. Every installation owner then accepts the new permissions. I recommend yes." And: "The build uses my recommended answers, but changing the App's settings needs you." Slice G0 builds on yes ([issues](issues.md)). Row 5 is now fully relayed.
- **About 08:15 to 10:40 on 2026-10-20: the Claude usage limit stopped the lead and every Claude agent.** No answer from Will is on record across the gap.
- **10:42:03 on 2026-10-20: the lead asked again,** after resuming the eight agents: "Your answers are still needed on: rotating the Grafana password; registering the GitHub callback URL; whether the heavy code viewer gets its own package; hosted-only for now; your GitHub actions showing as you; changing the GitHub App's permissions; who sees a public repo's live branch; and personal flows being prompt-only." These are rows 1 to 5; the builds still use the recommended answers. No answer by 10:44.
- **About 11:30 on 2026-10-20: the account's weekly limit stopped the lead and every agent.** 11:41:39: Will logged in to another account; 11:42:18: the lead resumed all nine. About 11:35 (the lead's time; the session showed it at 11:42:19) the second account's weekly limit stopped five agents; Will applied a usage reset (11:42:36), and the lead resumed them at 11:42:48 ([dev stack hygiene](dev-stack-hygiene.md)).
- **11:42:48 on 2026-10-20: the lead offered Will a cap** of about 8 agents at a time (row 8). No answer by 11:46.
- **12:36:24 on 2026-10-20, the lead to Will:** "Your sign-in callback URL still needs registering" (row 2).
- **12:54:04 on 2026-10-20: the lead asked Will to set up the GitHub App** (row 9): Issues read and write; the Issues and Issue comment events; a new private key (the file `GH_APP_PEM` names isn't on this Mac); installs on the wrapped repository and a scratch repository, with both names back to the lead. The issues slice is built and its create and comment e2e and live tests wait on this ([issues](issues.md)). No answer by 12:59.
- **13:09:31 on 2026-10-20, the lead to Will:** flows are ready to try (row 6, testing): Flows → New flow, name `count`, What "list the numbers from one to fifty in words", Draft, Save, Run, then Stop and Retry a second run ([flow authoring](flow-authoring.md)).
- **13:09:35 to 13:13:57: a candidate question held back.** The 13:06 tracker drafted "give the live-model tests their own model key?" ([Cerebras rate limits](cerebras-rate-limits.md)); the lead holds it until a rerun still fails on a provider 429, since the failures were very likely our own dev budget (raised to 10,000,000 at 13:13). It is not on the list. No answer to rows 1 to 9 by 13:17.
- **13:19:33 to 13:19:52 on 2026-10-20: Will asked what's left after the current agents.** The lead's "Waiting on you": the GitHub App setup (row 9); the sign-in callback URL (row 2); "the open design questions: your GitHub actions show as you; App permissions; who sees a live branch; personal flows are prompt-only; the repository view's package split; the agent concurrency cap" (rows 5, 3 and 8); rotating the Grafana password (row 1). "Then: the first deploy, after your yes."
- 13:20:28 and 13:20:43: Will: "Can any of those not started get started in parallel now? If you need more computing resources we have latitude servers". 13:21:12: the lead named four that can start, three that should wait, and asked: "Should I start those four now? If you name a Latitude server that isn't running production, I'll set it up as a second build machine" (row 10).
- **13:21:27: Will: "1. Githubactions we don't support those at all ..."** He read item 1 as GitHub Actions; recorded as a ruling under Answered ([no GitHub Actions](no-github-actions.md)).
- **13:21:41: Will: "start the ones that can start now we are trying to ship faster"** (under Answered).
- **13:23:33, the lead to Will:** "My item 1 was badly worded and wasn't about GitHub Actions. It asked whether a comment or issue you post through Smithers should appear on GitHub under your own account, rather than the App's. I recommend yes; is that right?" Row 5's 0012 Q1 is reworded to match. No answer by 13:28.
- **13:25:53 on 2026-10-20, Will:** "yes should appear under your account is better ux are there any other questions that are quick and fast for me to answer or a blocker that is blocking a lot of work from finishing/continuing?" 0012 Q1 is answered.
- **13:26:18, the lead:** the GitHub App's settings page is "the one blocker that holds the most work", one visit of about 5 minutes (row 1), plus four 10-second questions: the code viewer package, hosted only, shared-branch visibility and personal flows prompt-only; and, not blocking, the Grafana password.
- **13:31:14, Will:** "Yes move code viewer to it's own package. Built for hosted only now yes cut scope in that way. Shared branch you should be able to use common sense and how other collaboration tools to figure it out without asking me questions." Then the flows direction and the [Smithers Playground](smithers-playground.md). Question 4 unanswered.
- **13:32:34, the lead:** started the playground and the code viewer package; a docs agent records hosted-only and the sharing rules; M-31 left for Will; 0014 Q1 built on yes.
- 13:38:52: the lead ruled on session expiry (keep the device copy, ask to sign in); under "Building proceeds".
- 13:44:12: decision 0016 (TODOs and the stack) is written with two questions for Will. 13:45:10: the lead settled both on the recommended answers and flagged one change for Will: the stack's order lives in Postgres with no `mythical` ref, departing from root `AGENTS.md` (row 5).
- The GitHub App visit, the Grafana password, the fleet cap, the Latitude server and the code review are not done by 13:46.
- **14:04 to 14:05 on 2026-10-20: the docs agent recorded both 13:31:14 rulings in the decision records.** Hosted only is in decision 0010, with "the self-hosted install, after ship" in `todo.md` ([self-hosted install](self-host-install.md)). Shared branches are 0013 decisions 8, 9 and 12: private until shared, `Can view` or `Can edit` by name, optional general access for Members and above, the owner revokes, viewers in presence; sharing questions no longer go to Will ([branch sharing](branch-sharing.md)). 0013 Q1 is off every open list here. Root `AGENTS.md` is unchanged; M-31 stays row 4.
- **13:54 on 2026-10-20, the lead to Will:** "The Playground design is ready for you." Its three choices (above the table) proceed unless he objects.
- **About 13:57: Will:** "I should have a queue of decisions I can make in the UI and this queue of decisions should be extremelyfast and productive to use." The lead started a queue builder and a curator ([Will's decision queue](will-decision-queue.md)).
- **14:03:47: the curator's first queue holds every open row here** as a `question` or `decision` item (9 and 11), ranked as in the intro. 14:04, the lead: "The GitHub App setup comes first, then the other blockers, the Playground, decision 0016 and M-31 decisions, 18 feature GIF groups and 5 designs." 14:06:34: 150 items with 107 code slices.
- By 14:08: no answer from Will in `apps/maintainer-site/queue/answers.jsonl`; none of rows 1 to 9 is done.
- **14:07:28 on 2026-10-20: the queue went live** at `http://localhost:4747/queue`; 14:07:58: the curator dropped the fleet cap (row 6) and "first deploy yes" (deploying waits on Will's review).
- **14:08:55 to 14:27:56: Will answered rows 1 to 7 and the Playground's choices 1 and 2 in the queue**, and sent two GIF change requests (all under Answered). 14:12:55, the lead: the curator ranks the app and its SDK above internal tools.
- 14:16:52: Will asked for more work on the Latitude servers and a safe disk cleanup here.
- 14:25 to 14:28: Grafana, 0016 and M-31 went to `queue/dispatch.md`, assigned to a Codex lane and the [docs truth pass](docs-truth-pass.md); the Latitude answer is ticked.

## Next

From 14:30 on 2026-10-20: Will answers in the queue. On each answer in `apps/maintainer-site/queue/answers.jsonl` (or in chat), write it into the linked note and its decision record, then move the row off this list. Questions that exist only because a doc was stale leave the queue after the [docs truth pass](docs-truth-pass.md).

Until 14:30 on 2026-10-20 the next step was, from 14:04 on 2026-10-20: Will answers in the queue. On each answer in `apps/maintainer-site/queue/answers.jsonl` (or in chat), write it into the linked note and its decision record, then move the row off this list.

Until 14:04 on 2026-10-20 the next step was, from 13:46 on 2026-10-20: on each answer, write it into the linked note and its decision record, then move the row off this list.

Until 13:46 on 2026-10-20 the next step was, from 06:55 on 2026-10-20: on each answer, write it into the linked note and its decision record, then move the row off this list. When a panel merges, add its questions (at most 3) to row 5, one row each, with the recommended answer.

Until 06:55 on 2026-10-20 the next step was, from 06:26: on each answer, write it into the linked note and its decision record, then move the row off this list. Row 5 is under way: what Will finds while testing goes into the note for that feature.

Until 06:26 on 2026-10-20 the next step was, from 06:05: on each answer, write it into the linked note and its decision record, then move the row off this list. Row 4 is under way: what Will finds while testing goes into the note for that feature.

Until about 06:05 on 2026-10-20 the next step was: On each answer: write it into the linked note and its decision record, then move the row off this list. From 05:54 on 2026-10-20 row 4 is open: what Will finds while testing goes into the note for that feature.

Until about 05:54 on 2026-10-20 the next step was: On each answer: write it into the linked note and its decision record, then move the row off this list.

## Questions for Will

As of 14:30 on 2026-10-20, in order (rows of "Next for Will"):
- The queue's open decisions and questions (row 1).
- Delete the Grafana Cloud stack once the self-hosted one works (row 2, not blocking).
- Test the app (row 3) and review the code in the queue (row 4).
- Answered 14:07:58 to 14:27:56: the GitHub App (done), a Latitude server (all of them), the fleet cap (dropped), Grafana (self-host), 0016 (Postgres, `mythical` later), M-31 (docs follow the MVP), 0014 Q1 (prompt flows are code flows), Playground choices 1 and 2 (accepted).

Until 14:30:

As of 14:08 on 2026-10-20: the 13:46 list below, unchanged, plus the Playground's three design choices; each is a queue item at `/queue`.

As of 13:46 on 2026-10-20, in order:
- **Now (asked 13:26:18):** one visit to the GitHub App's settings: the callback URL, Issues, Pull requests and Contents read and write, the eight events, a new private key, installs on the wrapped and a scratch repository (row 1).
- **Not blocking, now:** rotate the Grafana password (row 2).
- 0014 Q1, personal flows prompt-only: unanswered at 13:31:14; built on yes (row 3).
- M-31 under hosted only (row 4).
- 0016's departure from "One mythical stack" (row 5); 0016 Q1 and Q2 settled by the lead at 13:45:10.
- The fleet cap and a Latitude server (rows 6 and 7).
- Answered 13:25:53 and 13:31:14: 0012 Q1 (yes, as the person), the code viewer package (B), hosted only (yes), shared branches (the lead decides by common practice).

Until 13:46:

- **Now (asked again in plain words 13:23:33 on 2026-10-20):** 0012 Q1: when you post a comment or an issue through Smithers, should it appear on GitHub under your own account, rather than the App's? Recommended: yes. Not about GitHub Actions, which Will ruled out at 13:21:27 ([no GitHub Actions](no-github-actions.md)).
- **Now (asked 13:21:12 on 2026-10-20):** name a Latitude server for a second build machine, not one running production sandbox workers or nyc-01 (row 10, [second build machine](second-build-machine.md)).
- **Now (asked 12:54:04 on 2026-10-20):** set up the GitHub App for issues (row 9): Issues read and write, the Issues and Issue comment events, a new private key, installs on the wrapped and a scratch repository ([issues](issues.md)).
- **Now (written 06:58 to 07:03 on 2026-10-20; relayed 07:20:40 (0013 Q1), 07:30:21 (0014 Q1) and 07:40:55 (0012 Q1 and Q2), all four asked again 10:42:03, all built on yes; 0012 Q2 needs Will to change the GitHub App's settings):** the four panel questions, row 5 of "Next for Will": GitHub attribution (0012 Q1, recommended: as the person), the GitHub App's permissions and webhook (0012 Q2, recommended: yes), a public repository's live branch for Members and sharees only (0013 Q1, recommended: yes), and personal flows as prompt flows (0014 Q1, recommended: yes) ([pull requests](pull-request-list-and-tabs.md), [branch sharing](branch-sharing.md), [flow authoring](flow-authoring.md)).
- Coming (written 06:55, superseded by the row above at 07:04): up to 3 questions from each design panel, with 0012 (git flow and triage), 0013 (branch workspace) and 0014 (flows and the home view). Panel G's Opus draft has two so far: GitHub attribution (recommended: a person's acts show as them) and widening the GitHub App's permissions with a webhook (recommended: yes).
- **Security, now:** rotate the Grafana password (`TF_VAR_grafana_password`), which the S1 agent printed into its transcript (asked 01:00 on 2026-10-20, again 05:49, 06:43:26 and 10:42:03; first of the lead's asks).
- **Now:** register `http://localhost:1337/api/auth/callback` in the Smithers GitHub App's settings (asked 01:00 on 2026-10-20, again 05:49, 06:43:26 and 10:42:03) ([sign-in](sign-in.md)).
- **Now (asked 02:35 on 2026-10-20, again 05:49, 06:43:26 and 10:42:03):** the repo view's deep import, A (one exception) or B (its own package, `@smthrs/repo-view`, imported from its root)? Recommended: B ([repo-view package split](repo-view-package-split.md)).
- **Now (asked 06:15:58 on 2026-10-20, again 06:43:26 and 10:42:03):** build against hosted only for now, leaving the self-hosted Mac install for later? Recommended: yes, with every service kept behind a Layer ([self-hosted install](self-host-install.md)).
- **Now (ready since 05:54 on 2026-10-20):** test the app at http://localhost:1337/app ([app wiring](app-wiring.md)). Under way since 05:56, when Will opened `/octocat/Spoon-Knife`.
- Not asked by the lead yet: which of the 19 old-app gaps to build, and in what order? The audit recommends gaps 1 to 4 now: the command palette, keyboard and Vim input, message controls and a settings screen ([old app feature gaps](old-app-feature-gaps.md)). (Answered unasked 06:39:05 on 2026-10-20 with Will's priorities.)
- **Proceeding on the recommendation (asked 05:58 on 2026-10-20):** should `app/navigate` allow outside URLs, for example after a confirmation step? Recommended: no; same-origin app paths only, and outside pages go through the [web page flow](web-page-flow.md) ([navigate flow](navigate-flow.md)).
- When S1 reports: register its callback URLs in the Smithers GitHub App's settings ([sign-in](sign-in.md)). (S1 reported about 01:00 on 2026-10-20; now the row above.)
- Does the lead's ruling on Codex review 2 finding 4 stand: web-standard globals such as `crypto.subtle` aren't platform code? Recommended: yes ([web-standard globals](web-standard-globals-rule.md)).
- The two repo-view answers (row 1 of "Next for Will"). Then, when the lead says it's ready, test the app; after the feature list, review the code. (From 02:35 on 2026-10-20 the `adapters` half is the A or B question above; the Markdown half proceeds on its recommendation.)
- Is this the MVP? Items 1 TODOs, 2 review and merge, 3 GitHub as truth, and 4+6 live work and notifications, each trimmed ([MVP scope cut](mvp-scope-cut.md)). Then the "Next for Will" table in order. (Answered 23:00: reference only.)
- Design question 11 of 14 (0007 Q3): may event-started flows apply ordinary labels as Smithers, with guarded labels like `todo` reserved for people? Recommended: yes. Then 0009 Q1 to Q3, one at a time, and the "Next for Will" table in order. (Deferred 22:56; 0009 settled by the lead.)
- Design question 8 of 14 (0005 Q3): sandbox limits as admin settings changeable without a deploy (20 awake per deployment, 2 per person, $100/month alert, 30-day snapshots)? Recommended: yes. Then the remaining 6, one at a time, and the "Next for Will" table in order. (Answered 22:45: deferred until we ship. Questions 9 and 10 answered by 22:49.)
- Design question 7 of 14 (0005 Q2): the agent's loop stays in the browser, with only its tools in the sandbox? Recommended: yes. Then the remaining 7, one at a time, and the "Next for Will" table in order. (Answered 22:42: yes.)
- Design question 6 of 14 (0005 Q1): Cloudflare sandboxes that lose running processes on sleep, with files always safe? Recommended: yes. (Answered 22:41: Cloudflare.)
- Design question 2 of 14: do single-write browser flows use the in-memory engine until one has to wait? Recommended: yes. Then the remaining 12, one at a time, and the "Next for Will" table in order. (Answered 22:25 to 22:29: decision 0011. Questions 3 to 5 answered by 22:35.)
- Restart W1 and the SDK defects agent? (Answered 22:16: accidental; restarted.)
- Work down the "Next for Will" table in order: the Code Storage organization name unblocks the live clone test, and the Cloudflare token unblocks the real plan. (Both answered by 22:13.)
- Answer the "Blocking work now" table first: the Code Storage organization name unblocks the live clone test, and the Cloudflare token unblocks the real plan. (Superseded at 22:00 by the ordered table.)
