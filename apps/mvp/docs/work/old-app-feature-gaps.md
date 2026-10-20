---
title: Old app features the new app neither has nor plans
status: in-progress
area: process
owner: the lead, from Will's priorities at 06:39 on 2026-10-20 (three design panels, three builders and a lander). Until 06:39: unassigned. Written by the old-app audit agent (started about 06:03 on 2026-10-20 by the lead), which finished at 06:15:52; the tracker loop keeps it current
updated: 2026-10-20
links: [land-to-main.md, site-deployment-test.md, issues.md, issue-triage.md, branch-terminal.md, branch-sharing.md, flow-authoring.md, flow-debugging.md, agent-jev.md, agent-status.md, command-palette.md, keyboard-navigation-and-vim.md, chat-message-controls.md, settings-screen.md, conversations-and-history.md, repo-view-branches-raw-clone.md, pull-request-list-and-tabs.md, context-preflight.md, bug-report-and-diagnostics.md, device-data-recovery.md, code-intelligence.md, scratch-branches.md, review-requests-and-revisions.md, in-app-docs-and-help.md, repository-declared-home.md, ssh-into-a-branch.md, timeline-rail.md, self-host-install.md, effect-code-conversion.md, ../proposals/mvp-gaps.md, ../proposals/early-features.md, mvp-scope-cut.md, decisions-for-will.md, maintainer-site.md, slash-commands.md, fable-review-2-fixes.md]
---

## What

Every user-facing feature of the old app (`apps/app`, mainly `src/mainview/**`) that the new app (`apps/mvp`) neither implements nor plans, as 19 notes. Will, 2026-10-20: "add to the maintainer app every feature we haven't implemented yet and isn't planned."

"Planned" means named in any of these:
- decisions 0001 to 0011;
- [`mvp-gaps.md`](../proposals/mvp-gaps.md) (17 items) and [`early-features.md`](../proposals/early-features.md);
- [`todo.md`](../todo.md);
- an existing note in this folder;
- the lead's `FEATURES.md` brief (features 1 to 8).

Work in flight counts as planned: [slash commands](slash-commands.md), [`app/navigate`](navigate-flow.md) and [`app/web/open`](web-page-flow.md). All three are done: slash commands at 07:06, `app/navigate` and `app/web/open` at 07:44 on 2026-10-20.

Sources: an inventory of the old app's cards, views, flow entries (`apps/app/src/mainview/flows/entries/*.ts`), repository views, shell, state layer and journey specs, on 2026-10-20. It reads source code only; it is not a test of what the old app does in production.

Sizes are for one agent: S up to 2 days, M up to a week, L 1 to 3 weeks.

## Why

Will asked for it at 06:02 on 2026-10-20. With one list, no old-app feature is lost by accident: each is built, cut on purpose, or covered by a plan.

## Will's priorities (2026-10-20)

Will, 06:39:05: "ability to open terminal in an iframe is important. Message controls is important. One conversation per branch is important. Repo view extras we should do. Pull request list and generally finishing the entire git e2e flow of being able to create issues open prs or update branch resync etc. ability to create a repositories own home view is important. Stuff related to flows debugging flows creting flows which wasn't listed is another one."

Then, 06:39:37: "let's get all thee done. also before I mentioned don't merge it into main right away I changed mind everything should be merged into main even before I review exiting code". From 06:40:35 to 06:42:01 he added four more: branch sharing, issue triage, Jev for the agent, and agent status.

As of 07:53:

| Priority | Work | Status | How it proceeds |
|---|---|---|---|
| Land | [Land finished work on `main`](land-to-main.md) | in progress | Round 1 pushed by 07:30: `bba8df6fab`, no deploy; the red [site test](site-deployment-test.md) fixed 07:51 in the working copy; round 2 next |
| Build now | [Repo view extras](repo-view-branches-raw-clone.md) | in progress | `repo/refs`, raw, `repo/copy` and `/clone` on disk; `e2e/repo-extras.spec.ts` and `repo-clone.spec.ts` written 07:46 to 07:49; no GIF or report |
| Build now | [Jev for the agent](agent-jev.md) | done | Reported 07:49: `app/jev/classify` and `app/jev/evaluate`, e2e with one judge call and a GIF, `ModelStep.model` in `@smthrs/agent`; no slash command, on purpose |
| Design, then build | [Agent status](agent-status.md) | in progress | 0015 and the mock done; phase 1 on disk (the `runs` table, three flows, `@smthrs/ui` components); no e2e |
| Build next | [Message controls](chat-message-controls.md) | to do | The composer is free (slash commands done 07:06); waits on the client [Fable fix](fable-review-2-fixes.md) agent |
| Build | The whole git flow: [issues](issues.md) first, then [pull requests](pull-request-list-and-tabs.md) and [issue triage](issue-triage.md) | in progress | 0012 done 07:40:55; slice G0 (list, view, create and comment on issues, two devices) building; PRs and triage after |
| Build | The branch workspace: [conversation per branch](conversations-and-history.md), [terminal](branch-terminal.md); [sharing](branch-sharing.md) after | in progress | 0013 reported 07:20; first slice building since 07:20:40; branch machine and a container spike on disk by 07:27 |
| Build | Flows: [creating](flow-authoring.md), [debugging](flow-debugging.md), and a repository's [own home view](repository-declared-home.md) | in progress | 0014 done; first slice building since 07:30:21 on the recommended yes to its question |

The 07:42 table, for history:

| Priority | Work | Status | How it proceeds |
|---|---|---|---|
| Land | [Land finished work on `main`](land-to-main.md) | in progress | Round 1 pushed by 07:30: `bba8df6fab`, 28 commits, the 05:58 snapshot, no deploy; one red [site test](site-deployment-test.md) being fixed; round 2 next |
| Build now | [Repo view extras](repo-view-branches-raw-clone.md) | in progress | `repo/refs`, raw, `repo/copy` and `/clone` on disk; no e2e or report |
| Build now | [Jev for the agent](agent-jev.md) | in progress | e2e passed 07:11 with its GIF; `docs/features/jev.md`; unreported |
| Design, then build | [Agent status](agent-status.md) | in progress | 0015 and the mock done; phase 1 on disk (the `runs` table, three flows, `@smthrs/ui` components); no e2e |
| Build next | [Message controls](chat-message-controls.md) | to do | The composer is free (slash commands done 07:06); waits on the client [Fable fix](fable-review-2-fixes.md) agent |
| Build | The whole git flow: [issues](issues.md) first, then [pull requests](pull-request-list-and-tabs.md) and [issue triage](issue-triage.md) | in progress | 0012 done 07:40:55; slice G0 (list, view, create and comment on issues, two devices) building; PRs and triage after |
| Build | The branch workspace: [conversation per branch](conversations-and-history.md), [terminal](branch-terminal.md); [sharing](branch-sharing.md) after | in progress | 0013 reported 07:20; first slice building since 07:20:40; branch machine and a container spike on disk by 07:27 |
| Build | Flows: [creating](flow-authoring.md), [debugging](flow-debugging.md), and a repository's [own home view](repository-declared-home.md) | in progress | 0014 done; first slice building since 07:30:21 on the recommended yes to its question |

The 07:20 table, for history:

| Priority | Work | Status | How it proceeds |
|---|---|---|---|
| Land | [Land finished work on `main`](land-to-main.md) | in progress | Lander typechecking 46 touched packages at 07:16; `main@origin` still `fe9800eec5`; no deploy |
| Build now | [Repo view extras](repo-view-branches-raw-clone.md) | in progress | `repo/refs`, raw, `repo/copy` and `/clone` on disk; no e2e or report |
| Build now | [Jev for the agent](agent-jev.md) | in progress | e2e passed 07:11 with its GIF; `docs/features/jev.md`; unreported |
| Design, then build | [Agent status](agent-status.md) | in progress | 0015 and the mock done; phase 1 on disk (the `runs` table, three flows, `@smthrs/ui` components); no e2e |
| Build next | [Message controls](chat-message-controls.md) | to do | The composer is free (slash commands done 07:06); waits on the client [Fable fix](fable-review-2-fixes.md) agent |
| Design | The whole git flow and [issue triage](issue-triage.md) | designing | 0012 proposed 06:58; Panel G waiting on its last docs check at 07:08 |
| Build | The branch workspace: [conversation per branch](conversations-and-history.md), [terminal](branch-terminal.md); [sharing](branch-sharing.md) after | in progress | 0013 reported 07:20; first slice building since 07:20:40 |
| Design | Flows and a repository's own home view | designing | 0014 proposed 07:02 |

The 06:55 table, for history:

| Priority | Work | Status | How it proceeds |
|---|---|---|---|
| Land | [Land finished work on `main`](land-to-main.md) | in progress | Lander agent since 06:42:50; no deploy |
| Build now | [Repo view extras](repo-view-branches-raw-clone.md) | in progress | Builder since 06:42:16 |
| Build now | [Jev for the agent](agent-jev.md): "The agent in smithers should have access to jev" | in progress | Builder since 06:42:25 |
| Design, then build | [Agent status](agent-status.md): "status updates like whether the thing needs help or not" | in progress | Designer since 06:43:04: decision 0015 and HTML mocks, then the first slice |
| Build next | [Message controls](chat-message-controls.md) | to do | After the chat-store and composer agents land |
| Design | The whole git flow: issues, [pull requests](pull-request-list-and-tabs.md), branch update and resync, plus [issue triage](issue-triage.md) | designing | Panel G → decision 0012 |
| Design | The branch workspace: [one conversation per branch](conversations-and-history.md), a [terminal in an iframe](branch-terminal.md), and [branch sharing](branch-sharing.md) | designing | Panel B → decision 0013 |
| Design | Flows: [creating](flow-authoring.md), [debugging and monitoring](flow-debugging.md), and [a repository's own home view](repository-declared-home.md) | designing | Panel F → decision 0014 |

Each panel runs Opus and Sol independently; Opus then merges both into the decision record with at most 3 questions for Will. Sol finished all three by 06:46. The merged records, all `proposed`: [0012](../decisions/0012-git-end-to-end.md) at 06:58:11 (2 questions), [0014](../decisions/0014-flows-authoring-debugging-and-home-view.md) at 07:02:13 (1) and [0013](../decisions/0013-branch-workspace.md) at 07:03:40 (1). The agent-status designer wrote [0015](../decisions/0015-agent-status.md) at 06:58:01 with a mock. Their questions are row 5 of [decisions for Will](decisions-for-will.md).

The 06:40 table, for history (written by the lead at 06:39:34, under the heading "Will's priorities (2026-10-20, 06:40)"):

| Priority | Work | How it proceeds |
|---|---|---|
| Build now | [Repo view extras](repo-view-branches-raw-clone.md) | Builder agent |
| Build next | [Message controls](chat-message-controls.md) | After the chat-store and composer agents land |
| Design, then build | The whole git flow: issues, the pull request list and opening PRs, branch update and resync ([pull requests](pull-request-list-and-tabs.md)) | Opus and Sol panel → decision 0012 |
| Design, then build | The branch workspace: [one conversation per branch](conversations-and-history.md) and a terminal in an iframe | Opus and Sol panel → decision 0013 |
| Design, then build | Flows: create, debug and monitor flows, plus [a repository's own home view](repository-declared-home.md) | Opus and Sol panel → decision 0014 |

## The gaps, most useful first

| # | Gap | Size | Why this rank |
|---|---|---|---|
| 1 | [Search and command palette](command-palette.md) | M | One keyboard door to every subject and action; builds on slash commands and `app/navigate`, both in flight |
| 2 | [Keyboard-first shell and Vim input](keyboard-navigation-and-vim.md) | M + M | Weak keyboard access is a release bug (M-48); cheaper before more views land |
| 3 | [Message controls](chat-message-controls.md) | S | Daily use (copy, times, editing a queued question, a saved draft) at small cost |
| 4 | [Settings screen](settings-screen.md) | M | `admin/SetModel`, budgets and the import pause have no door a person can press |
| 5 | [Several conversations](conversations-and-history.md) | L | One endless conversation slows the agent; spec §6.4 wants one per branch |
| 6 | [Repo view extras](repo-view-branches-raw-clone.md) | M | Any branch, raw, copy and clone, so the domain swap holds |
| 7 | [Pull request list and tabs](pull-request-list-and-tabs.md) | M | `/pulls` and the conversation and commits tabs, beside 8a's files view |
| 8 | [Context preflight](context-preflight.md) | M | Keeps answers cheap on Cerebras limits and shows what an answer read |
| 9 | [Bug report and diagnostics](bug-report-and-diagnostics.md) | S | A trace id in every report; bug intake is a keep rule |
| 10 | [Recover or reset this browser's data](device-data-recovery.md) | S | A local-first device holds unsent work; today a broken store offers only Reload |
| 11 | [Code intelligence](code-intelligence.md) | L | An explicit keep rule in the root `AGENTS.md` |
| 12 | [Scratch branches](scratch-branches.md) | M | J7 (P0); needs the stack and sandboxes first |
| 13 | [Review requests and revisions](review-requests-and-revisions.md) | M | The diff since my review; follows 8a |
| 14 | [In-app docs and help](in-app-docs-and-help.md) | M | `todo.md` says the app is also the docs |
| 15 | [A repository's own home view](repository-declared-home.md) | M | M-45; useful once repositories declare flows |
| 16 | [SSH into a branch](ssh-into-a-branch.md) | L | J3 and J6; after sandboxes and the terminal |
| 17 | [Timeline rail](timeline-rail.md) | L | Pays off only once conversations are long and shared (after 5) |
| 18 | [Self-hosted install on a Mac](self-host-install.md) | L | A scope decision for Will before any build: M-31's dogfooding assumes it |
| 19 | [Convert code to Effect](effect-code-conversion.md) | S | Served the Effeck launch; recommended: drop it from Smithers |

## Deliberately cut

Listed for completeness, never as work. Each is cut or deferred on purpose.

| Old app feature | Old code | Reason | Source |
|---|---|---|---|
| Billing, balance, plans, Stripe checkout and portal | `flows/entries/billing.ts`, `cards/BillingCards.tsx` (already unmounted) | Money is out of this release; hosting is in | M-09, M-44; mvp.md §8 |
| Triggers, schedules and the dispatcher screen | `cards/TriggersCard.tsx`, `flows/entries/triggers.ts`, the trigger panel in `cards/FlowGraphTrigger.tsx` | Return later as an advanced primitive on the Flow card | mvp.md §8, §16 |
| Machine views: services, egress lists, environment images, "Add to machine image" | `flows/entries/box.ts` (`box.services`, `box.egress`, `box.images`), `flows/entries/egress.ts` (`egress.session`), `flows/entries/image.ts`, `cards/EnvironmentImagesCard.tsx` | SSH covers hands-on access to the machine | mvp.md §8, §16 |
| Sending signals to a run by hand | `runs.signal` in `flows/entries/runs.ts` | Waits show in the monitor; manual signals deferred | mvp.md §6.14, §16 |
| Sync-ops cards and raw dev tools for members | `cards/SyncCards.tsx`, `debug.*` | Hidden from members; admins keep them ([diagnostics](bug-report-and-diagnostics.md)) | mvp.md §8 (Hide) |
| A notifications center | the Notifications pane in `ShellRail.tsx` | Toasts, the timeline and the repository card carry notifications | mvp.md §8; decision 0009 item 11 |
| The activity rail's pinnable icons | `ShellRail.tsx` | The MVP shell has no rail | mvp.md §16 |
| Historical fork and rewind | none left; run replay is read-only scrubbing | Read-only replay stays (`mvp-gaps.md` item 11) | root `AGENTS.md` |
| Predicted durations | `state/controller/flowDurations.ts` | Nothing shows an estimated time left | root `AGENTS.md` (estimates); decision 0009 item 9 |
| In-app diff line comments and review threads (Done, Ack, Reopen) | `review.done`, `review.ack`, `review.reopen`; the Review facet of `cards/ChangeCards.tsx` | Deferred | mvp.md §16 |
| Moving a file's diff into a new change ("Restore this file") | `file.restore`, `cards/ChangeCards.tsx` | Splitting across TODOs breaks TODO identity | mvp.md §8 |
| Reproduction and proof-of-concept runs on issues | `flows/entries/issue.ts` (`issue.repro`, `issue.poc`, `issue.add-flow`), `cards/CodingPocCard.tsx` | Serve outside contributors; the maintainer release | mvp.md §8, §14 |
| Asking Smithers while signed out ("Ask this repository") and its turn limit | `state/controller/guestChat.ts`, `cards/AnonymousCeilingCard.tsx` | Asking needs sign-in; abuse is caught by spend alerts | Will 2026-10-19 in `todo.md` and decision 0008 §11 (may revisit) |
| Email sign-in, and a separate Smithers Cloud sign-in | `auth.email`, `cards/LoginScreen.tsx`, `flows/entries/cloud.ts` | One GitHub identity for every client | decision 0008 |
| Signup poll and first-run stages | `state/LegacySignup.ts`, `state/SavedSignInPrompts.ts` | J1 replaces them | mvp.md §8 |
| Plugin manifests for a storefront | `plugins/AppPlugin.ts` (never loaded) | The marketplace is blocked | root `AGENTS.md` (#3402) |
| Desktop app (Electrobun) and its native conversation history | `apps/app/src/bun/`, `native/ConversationHistory.ts` | Returns with the first feature that must run locally | decision 0010 (revises the root `AGENTS.md` removal) |
| The TUI | outside `mainview` | The browser app is the surface | mvp.md §8, §16 |

Also cut by scope, with no old-app frontend surface left to list: Pair multiplayer beyond shared branch access and presence (presence is planned with [sandboxes](sandboxes.md), M-17), the themes collection (light and dark are built), cloud desktop streaming, non-GitHub integrations, create-app, the model laboratory and reviewer quizzes.

## Covered elsewhere

Old app features that look missing but are planned.

| Old app feature | Old code | Where it is planned |
|---|---|---|
| Slash commands in the composer | `Composer.tsx`, `registry.slashTree` | [slash commands](slash-commands.md), in progress |
| Page URLs, frames, back and forward | `runtime/FrameHistory.ts`, `flows/entries/frame.ts` | [`app/navigate`](navigate-flow.md), done 07:44 on 2026-10-20 (in progress until then) |
| Webpage reader card | `flows/entries/browser.ts`, Browser card in `cards/ConversationCards.tsx` | [`app/web/open`](web-page-flow.md), done 07:44 on 2026-10-20 (in progress until then) |
| Theme; sign-in and sign-out | `flows/entries/theme.ts`, `flows/entries/auth.ts` | built ([flows and agent](flows-and-agent.md), [sign-in](sign-in.md)) |
| Card maximize and minimize, form cards, model-written HTML results | `flows/entries/card.ts`, `cards/FlowFormCards.tsx`, `cards/RunResult.tsx` | decision 0004 ([agent UI](agent-ui-rendering.md)): inline and full sizes, `ui/form`, the sandboxed frame |
| Ask about lines, file tabs, highlights | `repository/RepositoryCodeView.tsx` | feature 4 ([agent navigates the repo view](agent-repo-navigation.md)) |
| Tool-call lines in answers | `cards/views/ActLineView.tsx` | streamed steps ([agent](../features/agent.md)) |
| Stop an answer; remove a queued question | `stop`, `chat.queue.remove` | decision 0002 §5 (steer and cancel, later) |
| TODOs, the stack, drafts, merge confirmation, the home card | `cards/TodoCard.tsx`, `cards/DraftCard.tsx`, `cards/ActCard.tsx`, `cards/HomeContainer.tsx` | [TODOs and the stack](todos-and-stack.md); `mvp-gaps.md` items 1 and 5 |
| PR files, findings (Please fix, Not useful), merge | `cards/LandingCards.tsx`, `flows/entries/findings.ts`, `flows/entries/prs.ts` | [PR review and merge](pr-review-and-merge.md); `mvp-gaps.md` item 2 |
| GitHub sync status, rebase, conflicts, outside pushes | `flows/entries/github.ts`, `/github`, `branch.bring-in` | [GitHub as the source of truth](github-source-of-truth.md); `mvp-gaps.md` item 3 |
| Runs inbox, run card, monitor, trace, graph, approvals inbox | `cards/RunsCards.tsx`, `cards/RunTraceCard.tsx`, `cards/FlowRunGraph.tsx`, `cards/ApprovalCard.tsx` | [notifications and live work](notifications-and-live-work.md) (8b); `mvp-gaps.md` items 4 and 11 |
| Toasts, browser notifications, live-work edges, Needs you | `ToastStackView.tsx`, `EdgeMap.tsx`, `state/controller/failures.ts` | decision 0009; `mvp-gaps.md` item 6 |
| Repository activity since the last check | `cards/RepositoryUpdateCard.tsx`, `state/RepositoryReadReceipts.ts` | `mvp-gaps.md` items 5 and 6 |
| Issues: list, detail, create, comment, close, transitions | `repository/IssueViews.tsx`, `cards/IssueCards.tsx`, `flows/entries/issues.ts` | feature 3's issues template ([agent UI](agent-ui-rendering.md)); `mvp-gaps.md` item 10 |
| Flows: list, card, plan, run, new, edit, source | `cards/FlowCard.tsx`, `cards/FlowPlanCard.tsx`, `repository/RepositoryFlows.tsx` | `mvp-gaps.md` item 8 |
| Agents and model configuration | `cards/AgentCards.tsx`, `cards/ModelCards.tsx` | `mvp-gaps.md` item 12; [model endpoint](model-endpoint.md) |
| Wiki: pages, co-editing, backlinks, graph, history, Save to wiki, lessons | `WorldSurface.tsx`, `wiki/*`, `cards/WikiCards.tsx`, `cards/ProposalContainer.tsx` | `mvp-gaps.md` items 7, 9 and 17 |
| `/search` and its results card | `cards/SearchResultsCard.tsx`, `flows/entries/search.ts` | `mvp-gaps.md` item 16 |
| Branch terminal; your own CLI agent | `cards/TerminalCard.tsx`, `flows/entries/shell.ts` | `mvp-gaps.md` items 14 and 15; decision 0005 §5 job panel |
| Launcher: open, your repositories, create, explore, update news; import states | `cards/RepositoryLauncher.tsx`, `flows/entries/repos.ts` | `mvp-gaps.md` item 13; [repo open states](repo-open-states.md) |
| Branch card, presence, co-editing with cursors, sleep and wake, the branch picker with sandbox state | `cards/BranchCard.tsx`, `cards/CodeEditorSurface.tsx`, `runtime/LiveDocProvider.ts` | [sandboxes](sandboxes.md), [connecting it all](connect-agents-sandboxes-forge.md); decision 0005 §2 and §5 |
| Hosted change from Ask | `cards/HostedChangeCard.tsx` | features 5 and 7; [TODOs and the stack](todos-and-stack.md) |
| Members, roles, labels, Guest approvals | `cards/MembersCard.tsx`, `flows/entries/members.ts` | decision 0007 ([roles and labels](roles-and-labels.md)) |
| Secrets card and egress grants | `cards/SecretsCard.tsx`, `egress.allow` | feature 6 ([secrets proxy](secrets-proxy.md)); decision 0005 |
| Agent marks such as "Smithers for Maya" | `AgentMark.tsx`, `Persona.ts` | decision 0007 §4 |
| Markdown editing of repository files | `MarkdownEditorSurface.tsx` | decision 0006 question 3 (read-only for now); editing with sandboxes |

Not counted, because they are dead or mock code in the old app: `plugins/AppPlugin.ts` (never loaded), `cards/RepositoryChoiceCard.tsx` (orphaned), `wiki/search.ts` (only its test imports it), `runtime/PointerMode.ts` (no callers), `cards/SubjectCards.tsx` and the design-world half of `cards/ActCard.tsx` (seeded mock data), `CloudIssueDoor` (a test with no source), and dictation, which the old app already retired. Per-message command selection (`state/Recommend.ts`) and `state/MessageScrub.ts` are plumbing, not features.

## State

- **06:02 to 06:03 on 2026-10-20:** Will asked; the lead started the audit agent ([maintainer site](maintainer-site.md)).
- 06:10 to 06:15 on 2026-10-20: this index and the 19 gap notes were written, each `status: idea`, `owner: unassigned`.
- **06:15:52 on 2026-10-20: the audit agent finished.** 06:15:58, the lead to Will: "The old-app gap audit is done. It found 19 features the new app neither has nor plans, each now an idea card in the maintainer site." Its top 5: search and command palette (medium); keyboard-first shell and Vim-style input (medium); message controls (small); a settings screen (medium); several conversations (large). "It also lists 18 features cut on purpose, each with its reason, and 26 old features that existing plans already cover."
- The lead relayed one question, the [self-hosted install](self-host-install.md), now row 4 of [decisions for Will](decisions-for-will.md). It didn't ask which gaps to build.
- By 06:26: no answer from Will, and no gap note has moved from `idea`.
- **06:39:05 on 2026-10-20: Will picked.** His priorities (above) answer this note's first question. 06:39:34: the lead recorded them here. Moved from `idea`: [repo view extras](repo-view-branches-raw-clone.md) to `in-progress`; [message controls](chat-message-controls.md) to `todo`; [pull requests](pull-request-list-and-tabs.md), [conversations](conversations-and-history.md) and [the home view](repository-declared-home.md) to `designing`. New notes: [issue triage](issue-triage.md), [branch terminal](branch-terminal.md), [branch sharing](branch-sharing.md), [flow authoring](flow-authoring.md), [flow debugging](flow-debugging.md), [agent Jev](agent-jev.md), [agent status](agent-status.md) and [land to main](land-to-main.md).
- Gaps 1, 2, 4 and 8 to 19 aren't in his list and stay `idea`. Gap 16, [SSH into a branch](ssh-into-a-branch.md), follows the [browser terminal](branch-terminal.md).
- 06:43:26: the lead to Will: "Everything you asked for is now started", with the table above and four asks ([decisions for Will](decisions-for-will.md)).
- 07:30:21 on 2026-10-20: Panel F done; 0014's first slice building, so [flow authoring](flow-authoring.md), [flow debugging](flow-debugging.md) and [the home view](repository-declared-home.md) moved from `designing` to `in-progress`. Round 1 of [land to main](land-to-main.md) pushed `bba8df6fab`.
- 07:40:55 on 2026-10-20: Panel G done; 0012's slice G0 builds issues ([issues](issues.md), new). [Pull requests](pull-request-list-and-tabs.md) and [issue triage](issue-triage.md) moved from `designing` to `todo`: designed, not in the first slice.

## Next

From 07:30 on 2026-10-20: 0013's and 0014's first slices build on the recommended answers to their questions; Panel G reports 0012 and its two questions; message controls starts when the client Fable fix agent lands; round 2 lands finished work on `main`. [Self-hosted install](self-host-install.md) is still open with Will.

Until 07:30 on 2026-10-20 the next step was, from 06:43 on 2026-10-20: the three panels merge into decisions 0012 to 0014, each with at most 3 questions for Will; then their walking skeletons build. Message controls starts when the chat-store and composer agents land. [Self-hosted install](self-host-install.md) is still open with Will.

Until 06:39 the next step was: Will picks from the table; each pick moves its note from `idea` to `todo`. Answer [self-hosted install](self-host-install.md) first: it decides whether every remote service keeps a local Layer.

## Questions for Will

- Which gaps to build, in what order? Recommended: 1 to 4 now; they are small, keyboard and settings ones block release quality (M-48), and none waits on sandboxes or auth. (Answered 06:39:05 on 2026-10-20 with his priorities above: of 1 to 4, only message controls.)
- Keep the self-hosted Mac install in this release? Recommended: hosted-only now ([self-hosted install](self-host-install.md)). (Asked again 06:43:26 on 2026-10-20; no answer by 06:55.)
