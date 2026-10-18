# MVP gaps for Will's approval

**MVP means the one loop the product exists for:**

```
ask in chat ──▶ TODO ──▶ agent works it on its own branch (sandbox) ──▶ PR on GitHub ──▶ person reviews diff ──▶ merge
```

Only items 1, 2 and 3 are proposed for the MVP, each trimmed to that loop. Everything else below is roadmap. It's kept for reference, with its evidence, and is not proposed for the MVP.

**Will, 2026-10-19:** "it's more or less right". He also said: "Don't worry about the mvp I gave you a list of things we are building that's what we are building now ... once we finish everything we got so far I need to test the app review the code". Work follows his feature list (features 1 to 8). This file is reference only.

## Proposed MVP (trimmed)
- [ ] **1. TODOs, minimum:** create a TODO from chat, the agent works it on its own branch, see its status, drop it. *Cut:* insert, amend and move on a stack; TODOs from issues.
- [ ] **2. Review and merge, minimum:** see the PR's diff and checks, and a person merges. Agents never approve or merge. *Cut:* evidence views, revocable pre-approval, stack-order enforcement.
- [ ] **3. GitHub as the source of truth, minimum:** open the PR on GitHub, and show when it's merged or closed on GitHub. *Cut:* conflict screens, review-comment steering, outside-push handling, full issue and check sync.

Covered elsewhere, so no MVP item is needed:
- the agent asking questions mid-task (feature 3's forms);
- pause, resume and retry (the durable flow engine);
- opening a repo (feature 2);
- sign-in and roles (decisions 0007 and 0008).

## Roadmap, not MVP

These are the full versions of 1 to 3, plus items 4 to 17 as originally proposed, kept for reference.

## Scope and evidence

Read FEATURES.md first (2026-10-19 evening brief). This is a source inventory and proposal, not a production verification report. No tests, servers, network operations or version-control commands were run.

Paths below are relative to `/Users/williamcory/smithers`; `plue/` means `/Users/williamcory/plue/`. `E` means `apps/app/e2e/real/`; `P` means `apps/app/e2e/playwright/spec/`; `Mem` means `/Users/williamcory/.claude/projects/-Users-williamcory-smithers/memory/`. Spec references mean `.specs/product/mvp.md`.

Classification: **R** = required by spec; **U** = usage/dependency evidence; **N** = nice to have. A journey test establishes intended coverage, not a passing deployed receipt. Some `P` tests use DesignWorld fixtures or `fixme`; real journeys are selectively enabled (`E/journeys.ts`). Memories are historical evidence and yield to current product rules.

Baseline: `apps/mvp/src/router.tsx` exposes `/` and `/app`; its feature code is chat, sync recovery, history and composer. Existing decisions 0001/0002 cover state/sync and local-first chat, including offline asks and serialized answers. Excluded those features, all FEATURES 1–7, and roles/tags/auth reserved to decisions 0007/0008 per Will. Those two decision files were not present in this checkout. FEATURES 8 is an open selection request, not a defined feature to exclude wholesale.

Inventory inspected: old app `src/mainview/flows/entries/`, cards, controller and journey suites; local HTTP routing in `apps/app/src/bun/routes.ts`; Plue's backend composition, repository routing, workspace runtime, workers and GitHub-sync service. Plue composes the common product backend; product behavior also lives in `packages/backend/internal/routes/`, not exclusively in Plue.

Backend/API evidence: TODO handlers expose file/list/read/merge/answer/control/amend (`packages/backend/internal/routes/todos.go`); flow launch returns an idempotent accepted receipt (`flow_runs.go`); sync status/dispatch lives in `github_sync.go`. Plue GitHub-sync serves `POST /webhooks/smithers`, `/webhooks/github` in metadata/combined mode, and `/sync/initial` (`plue/apps/github-sync/src/server.ts`). Its private workers prune egress audit and drain storage deletion (`plue/apps/backend/internal/composition/workers.go`): infrastructure to retain, not new product screens or app-owned job loops.

## Committed work and review

- [ ] **1. Create and manage TODOs on an ordered stack.** Capture an immutable prompt from chat or an issue; append, insert, amend, move and drop, with one branch per item.
  - **R:** §4, §6.6, M-01; **U:** J1/J2/J7, `E/todo-from-issue.spec.ts`, `E/todo-placement.spec.ts`, `E/todo-stack-actions.spec.ts`; `Mem/feedback_dogfood_smithers_for_everything_20260930.md` documents reliance on flow-driven work.
  - Today: `apps/app/src/mainview/cards/TodoCard.tsx`, `flows/entries/todo.ts` under the same mainview directory; `packages/backend/internal/routes/todos.go`. **L**. Depends on FEATURES 1, 5, 7; auth/roles design. Adds work scheduling beyond sandbox branch creation.

- [ ] **2. Review a PR's diff and evidence, then merge under human control.** Show machine/GitHub checks, review findings and exact reviewed head; enforce stack order and revocable TODO pre-approval.
  - **R:** §6.10, M-05/M-39; **U:** J1/J2/J10, `E/todo-evidence.spec.ts`, `E/todo-merge.spec.ts`, `E/todo-merge-order.spec.ts`.
  - Today: `apps/app/src/mainview/cards/ChangeCards.tsx`, `HostedChangeCard.tsx`, `flows/entries/review.ts`; `packages/backend/internal/routes/todos.go`. **L**. Depends on 1, 3, FEATURES 2/7 and roles/auth; agents never approve or merge. No in-app line comments.

- [ ] **3. Keep GitHub authoritative and surface synchronization conflicts.** Sync issues, PRs, checks, reviews and external merges; show freshness/retry, turn review comments into steers, and require Bring in/Discard for outside pushes.
  - **R:** §6.3, M-22/M-33; **U:** J10, `E/github-j10/{review-steer,foreign-push,sync-health,merge-on-github,main-moved-rebase}.spec.ts`.
  - Today: `apps/app/src/mainview/cards/SyncCards.tsx`, `flows/entries/github.ts`; `plue/apps/github-sync/src/sync/{combined,github-to-smithers,smithers-to-github}.ts`. **L**. Depends on FEATURES 1/2/5/7 and auth/App coverage; connect 1/2 incrementally. Extends main-following already planned in feature 5 with metadata and conflict handling.

- [ ] **10. Make the issues template actionable.** Create, read, comment, close/reopen and Make TODO from real GitHub issues; allow repository-defined transitions.
  - **R:** M-47, §6.3, Appendix A/B; **U:** J2, `E/todo-from-issue.spec.ts`, `P/C-J2-01.spec.ts`.
  - Today: `apps/app/src/mainview/cards/IssueCards.tsx`, `flows/entries/issues.ts` (including `issues.transition`); `plue/apps/github-sync/src/sync/github-to-smithers.ts`. **M**. Depends on 1, 3, FEATURES 1/3 and auth/roles; tags remain in 0007/0008. Feature 3 already owns the issues display template; this item is the underlying issue operations.

## Async work and attention

- [ ] **4. Watch and control live work without blocking chat.** Answer a pending question separately from steering; pause/resume/retry durable runs, reconnect after reload and retain failures.
  - **R:** §6.6/6.9, J3/J4, root AGENTS “Instant chat”; **U:** `E/todo-needs-you.spec.ts`, `E/todo-steer.spec.ts`, `E/duplicate-launch.spec.ts`; `Mem/reference_workflow_resume_quota_ratchet.md` records recovery depending on the same durable run.
  - Today: `apps/app/src/mainview/cards/RunsCards.tsx`, `state/controller/backgroundWork.ts`, `flows/entries/run.ts`; `packages/backend/internal/routes/flow_runs.go`. **M**. Depends on FEATURES 1/3/7 and 1; runtime durability itself remains feature 1's responsibility.

- [ ] **5. Show the team's stack and background runs in one work overview.** Filter Needs you/Working/Queued/In review, show merges since last visit, capacity and failed background work with Retry/Dismiss.
  - **R:** §6.4, J4; **U:** `E/home.spec.ts`, `P/C-J4-01.spec.ts` (fixture-based UI coverage).
  - Today: `apps/app/src/mainview/flows/entries/history.ts`, `cards/TodoCard.tsx`, `cards/RunsCards.tsx`. **M**. Depends on 1/3/4, FEATURES 3/5 and branch-scoped shared data; no cross-repository management console.

- [ ] **6. Notify the right people about work needing attention.** Durable progress toasts and timeline entries for questions, review readiness and failures; browser notifications by consent and repository-owned notification policy.
  - **R:** §6.4, M-47; **U:** J2/J4, `P/C-J4-02.spec.ts`, `P/C-J4-03.spec.ts`; root AGENTS requires completion-based toast settlement.
  - Today: `apps/app/src/mainview/state/RepositoryNotifications.ts`, `state/controller/failures.ts`, `cards/RepositoryUpdateCard.tsx`. **M**. Depends on 3/4, FEATURES 1/3 and auth identity; no separate notification center, email or phone delivery.

- [ ] **11. Inspect any run's recorded execution.** Live graph, step inputs/outputs, transcript, waits, retries, tokens/time/cost and read-only replay; accessible from a run rather than occupying the first screen.
  - **R:** §6.14, M-23, J11; **U:** `P/C-J11-01.spec.ts`, `P/C-J11-01-monitor-install.spec.ts`; `Mem/project_monitor_ui_design_review.md` records Will's live monitor use and concrete usability fixes.
  - Today: `apps/app/src/mainview/cards/RunTraceCard.tsx`, `FlowRunGraphSurface.tsx`, `FlowGraphSurface.tsx`. **M**. Depends on 4 and FEATURES 1/3; secret-redacted engine records, no arbitrary signal sender or fork/rewind controls.

## Memory and customization

- [ ] **7. Give people and both agents one editable wiki.** Shared Markdown pages, live co-editing, backlinks/outline and cited page revisions; refresh source-derived pages after merges, including for fresh repos.
  - **R:** §6.11, J8; **U:** `E/wiki-coedit.spec.ts`, `E/wiki-decision-follow.spec.ts`, `E/wiki-generated-refresh.spec.ts`, `P/C-J8-01.spec.ts` exercises a source-linked learning page.
  - Today: `apps/app/src/mainview/cards/WikiCards.tsx`, `flows/entries/wiki.ts`; `packages/backend/internal/repohostserver/wiki_document.go`, `packages/backend/internal/live/wikidoc.go`. **L**. Depends on FEATURES 1/3, auth/roles and 3 for refresh receipts; ordinary repo Markdown editing in feature 2 does not supply a shared memory vault.

- [ ] **8. Let teams author and safely activate their own flows and views.** Source/plan/typed Run, propose edits through TODOs, distinguish proposed/merged/active, pin existing runs and preserve the last working version on load failure.
  - **R:** §6.12/6.14, M-23/M-30/M-47/M-49; **U:** J5/J11, `E/flow-activation.spec.ts`, `E/flow-source-run.spec.ts`; `P/C-J5-01.spec.ts` is explicitly fixme, so is not completion evidence.
  - Today: `apps/app/src/mainview/cards/{FlowCard,FlowPlanCard,FlowFormCards}.tsx`, `state/controller/flowAuthoring.test.ts`; `packages/backend/internal/routes/flow_runs.go`. **L**. Depends on 1/2, FEATURES 1/2/3/5; adds user authoring/activation beyond feature 1's registry and feature 3's generated rendering. System flows remain non-overridable.

- [ ] **9. Learn from merged work with reviewable improvements.** Record source-linked decisions in the wiki and propose evidence-backed flow improvements as suggested TODOs; never silently change the factory.
  - **R:** §6.12, M-04, J5/J8; **U:** `E/learning-journey.spec.ts`, `P/C-J8-01.spec.ts`; root AGENTS explicitly retains wiki memory and post-merge refresh.
  - Today: `packages/backend/db/product/migrations/{0129_learning_notes,0131_learning_receipts}.sql`, `apps/app/src/mainview/cards/WikiCards.tsx`. **M**. Depends on 1/2/7/8 and FEATURES 1/7. Old spec calls learning missing; receipt tests and schemas show pieces, not universal deployed completion.

- [ ] **12. Configure the factory's agents through instructions and model settings.** Propose instruction changes as TODOs, expose agents from flow steps, and let the owner choose models without restoring the model lab.
  - **R:** §6.14, M-23/M-30, J11.4; **U:** `P/C-J11-04.spec.ts` defines the agent configuration journey.
  - Today: `apps/app/src/mainview/cards/{AgentCards,ModelCards}.tsx`, `flows/entries/agent.test.ts`. **M**. Depends on 1/8 and auth/roles; feature 7's Qwen-only sandbox constraint holds until Will changes it. Instruction editing can precede model switching; no tool/permission/budget editor.

## Entry, access to tools, and finding work

- [ ] **13. Complete the repository launcher and truthful GitHub import experience.** Open/create/explore, genuine update news, and distinct App-install/import/refusal/retry states.
  - **R:** §6.16, M-45/M-46; **U:** J1 and `E/github-j10/app-manifest.spec.ts`; `Mem/gotcha_prove_a_clone_renders_never_infer_it.md` cautions against claiming a usable repository from clone success.
  - Today: `apps/app/src/mainview/cards/{LandingCards,RepositoryChoiceCard,RepositoryUpdateCard}.tsx`, `RepositoryEntryLauncher.test.tsx`. **M**. Depends on FEATURES 1/2 and auth design; feature 2 already owns tree/blob viewing and repo route rendering. Public keyless cloning stays available; import of protected GitHub data follows the designed access rules.

- [ ] **14. Open an interactive branch terminal and support external coding tools.** Run tests or a member's own CLI agent; other members may watch, while tool login remains private.
  - **R:** §6.8/6.13, J3/J6; **U:** `E/agent-terminal.spec.ts`, `E/terminal-signin.spec.ts`, `P/C-J6-01.spec.ts`.
  - Today: `apps/app/src/mainview/cards/TerminalCard.tsx`, `flows/entries/shell.ts`; `plue/apps/backend/internal/composition/workspaceruntime/terminal.go`. **M**. Depends on FEATURES 3/5/7 and auth/delegated identity; adds the interactive user surface beyond containers running jobs. No typing into another person's terminal.

- [ ] **15. Expose the same approved actions through CLI/API and a generated Smithers skill.** Share one catalog and record “agent for member”; person-only decisions open person-only confirmations.
  - **R:** §6.13, M-21/M-34, J6; **U:** `E/agent-terminal.spec.ts`, `P/C-J6-02.spec.ts`; root AGENTS execution-environment rule requires shared tool access.
  - Today: `apps/app/src/mainview/flows/{registry,agentTools}.ts`, `flows/entries/confirm.test.ts`; `packages/backend/internal/routes/todos.go`. **M**. Depends on FEATURES 1/7, auth and 1/2; catalog construction overlaps feature 1, so approve only its external-client projection and delegation integration here.

- [ ] **16. Search code, wiki and past runs, with source-linked results.** Find an existing answer or failure instead of reopening branches blindly; save a useful answer to the wiki or draft a TODO.
  - **R:** Appendix A `/search`, §6.5, J9 (P1); **U:** `E/ask-repository.spec.ts`; dependency on wiki/run retrieval extends feature 4's code navigation and answers.
  - Today: `apps/app/src/mainview/cards/SearchResultsCard.tsx`, `flows/entries/search.ts`. **M**. Depends on 1/4/7, FEATURES 2/3/4; reuse feature 4's code retrieval, do not implement a second repository Q&A agent.

- [ ] **17. Sync the wiki with the install's local Obsidian folder.** Bidirectional local vault sync, configured by the owner.
  - **R:** §6.11, J8; **U:** `E/wiki-obsidian.spec.ts`; overview explicitly defines the vault as factory memory synced on the install's Mac.
  - Today: `packages/backend/internal/config/wiki_sync.go`, `packages/backend/docs/wiki.md`; `apps/app/src/mainview/cards/WikiCards.tsx`. **S** for the setting/integration if existing sync is reusable. Depends on 7, auth/roles and a self-hosted Mac; no teammate laptop vault sync.

## Deliberately dropped

**Cut/deferred, not approval items:** five-job setup and CI/Feature/Chores workers; marketplace/community nominations; Pair beyond shared branches/presence M-17; theme collection; cloud desktop streaming/Electrobun; create-app; non-GitHub integrations; third-party OAuth hosting; separate Explainer; calendar-to-notes; public traction metrics; separate review service/quizzes; historical fork/rewind controls; predictive estimates/model lab; cross-repository management; a separate notifications center; triggers/Machine view/manual signal UI; in-app diff line comments/replies in GitHub review threads; stacked PR retargeting; automatic foreign-push adoption; teammate-branch machine import; shared terminal typing; laptop Obsidian sync; billing/plans; TUI; outside-contributor maintainer automation before §14. Sources: root AGENTS, §8/§14/§16, M-09/M-20/M-23/M-40. Hosting itself remains in scope under M-44; FEATURES 5/7 already explicitly plan hosted sandboxes despite older remote-machine deferral language.

**Already covered, not gaps:** themes' light/dark toggle and flow registry (1), clone/tree/Markdown/editor capability (2), embedded UI/forms/issues template/safe HTML (3), file navigation and repository answers (4), branch sandboxes/access/presence/co-editing/offline branch work (5), secret management/proxy (6), agent/sandbox integration and Qwen execution (7), local-first chat/outbox and serialized answers (0001/0002), roles/tags/auth (reserved 0007/0008), token-spend alerts and device storage cap (`apps/mvp/docs/todo.md`).

**Nice to have:** no N-only feature recommended. A general webpage reader exists in `apps/app/src/mainview/flows/entries/browser.ts` and root AGENTS says retain it, but no J1–J11 dependency found here justifies selecting it ahead of these gaps. Preserve it in the old app; defer proposing a new MVP surface until needed.

**Implementation contract if approved:** every action/model call runs through `@smthrs/flow`/`@smthrs/agent`; use Effect, flux/TanStack DB and `@smthrs/ui` per apps/mvp rules. Before choosing any library, consult `docs/libraries.md` and state the catalog entry used in the change; any missing library capability needs a reason and issue. Product logic belongs in the shared backend/SDK, not private Plue composition. Carry M-48 keyboard/minimal-copy regression tests through each feature. J1–J11 on the deployed app supply acceptance evidence; source inventory alone does not.
