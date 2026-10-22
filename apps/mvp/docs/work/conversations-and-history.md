---
title: Several conversations (new, archive, history, one per branch)
status: done
area: app
owner: conversations builder for new, archive and history from 2026-10-22; before that unassigned; one conversation per branch finished with the branch workspace slice at 13:42:00 on 2026-10-20 (R4-5 and R4-6 fixed). Until 13:46: branch workspace builder; from about 10:53 on 2026-10-20 also review round 4's R4-5 and R4-6 (a branch's web views land in the home conversation; the full-screen view resolves home rows only), fixes on disk 10:55 to 10:58, unreported by 11:07. Until 10:53: branch workspace builder, resumed by the lead at 10:42 on 2026-10-20 from where it stopped (the Claude usage limit stopped it from about 08:15 to 10:40); unreported by 10:44. Until 10:42: branch workspace builder, 0013's first slice from 07:20:40 on 2026-10-20 (asking in a branch's own conversation); unreported. Panel B reported 0013 at 07:20:20. Until 07:20: Panel B; decision 0013 written 07:03:40 on 2026-10-20 (status: proposed); no builder yet. Until 07:03: Panel B (Opus merges into decision 0013, the branch workspace; started 06:42:01 on 2026-10-20). Sol's design done 06:45; Opus's independent design written 06:55:57. Until 06:42: unassigned
updated: 2026-10-22
links: [review-round-4.md, ../decisions/0013-branch-workspace.md, old-app-feature-gaps.md, branch-terminal.md, branch-sharing.md, local-first.md, lru-size-limit.md, auth.md, timeline-rail.md, chat-message-controls.md, agent-status.md, sandboxes.md, decisions-for-will.md, ../decisions/0002-local-first.md, ../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0009-notifications-and-live-work.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../todo.md, fable-review-2-fixes.md, docs-check-flow-outcome.md]
---

## What

**Decided in 0013 (07:03, proposed), decisions 1 to 3:**
- **A branch is the workspace.** Each branch has a `branches` row with an immutable id; renaming keeps it. `main`'s conversation is the team's home.
- **One conversation per branch, for as long as the branch lives.** Its id is `uuidv5(branch id)`, so a device knows it offline. Starting fresh means a new branch. Archive is personal and syncs across your devices; opening the branch brings it back. No conversation lives outside a branch.
- **Everything chat-scoped names its conversation:** messages, views, outbox rows, runs and the agent's execution. Nothing infers the branch from the URL. Each conversation is one Electric shape and one persisted TanStack DB collection; only the open one and those with work in flight sync live.
- **Walking skeleton S1, track A:** migration `0013_branch_workspace` (`branches`, `conversations`, `conversation_people`, `conversation_id` on messages and views, the legacy binding), `branch/Track`, shapes per conversation, `POST /api/questions` with `conversationId`, the turn wait and history per conversation, and the composer bound to the route's branch.

**From 06:39 on 2026-10-20 this is Panel B's item 1.** Will: "One conversation per branch is important." Panel B designs it with a [terminal in an iframe](branch-terminal.md) and [branch sharing](branch-sharing.md) as decision 0013. Best guess from Sol's design (scratchpad `final/panel-b-sol.md`); the merge decides:

```
branch (UUID, survives a rename) ──1:1── conversation ──▶ messages, views (conversation_id)
                                              └── conversation_people: per-person archive, last read
/owner/repo/tree/<branch>  ⇄  that branch's conversation   (switching is local navigation)
main's conversation = the team's home
```

- **One branch, one shared conversation.** Each branch gets an immutable UUID; `UNIQUE(conversations.branch_id)` includes archived ones. "New conversation" means a new branch, never clearing someone else's history.
- **Switching is local navigation.** Chat, agent context, views, drafts, scroll and the terminal bind to explicit scope ids, never to the current URL. A running answer keeps its branch when you switch.
- **Archive is personal.** It hides a conversation for you and syncs across your devices; it doesn't delete the branch or stop anyone's work.
- **Data:** `messages` and `views` gain a non-null `conversation_id`; a foreign key keeps an answer in its question's conversation; the server sets the author from the session. Electric shapes are fixed by the server per conversation; collections are keyed by principal, repository and conversation.
- **The agent (0011):** the asking browser owns each answer; other viewers never start a second one. Turns serialize within a conversation, not across the deployment.
- **Flows:** `conversation/Ensure`, `app/conversation/open`, `conversation/Archive`; the existing ask and answer flows gain `conversationId`.

The original gap, as the audit wrote it at 06:10:

The old app kept many conversations: a new one on demand, an archive, and one shared conversation per branch.

Old app:
- **New and archive:** `/archive` (aliases `new`, `clear`) archives the chat and starts a new one. `/history` lists archived chats grouped by repository, then branch, with each one's summary, entries and the runs it started (`apps/app/src/mainview/flows/entries/chat.ts`, `cards/HistoryContainer.tsx`, `cards/views/HistoryView.tsx`, `state/ConversationArchive.ts`).
- **Branch conversations:** each branch is one conversation shared by everyone on it. Header crumbs and a branch tree move between them, and a read-only "Earlier · N" node holds past conversations (`BranchTree.tsx`, `BranchNavigation.tsx`, `HeaderSelectors.tsx`, `EarlierArchive.tsx`, `state/controller/earlierHistory.ts`).
- **Shared conversation:** each prompt shows its author, and queued turns on the server can be edited or removed. Signing in restores past conversations after an integrity check (`SharedConversation.tsx`, `state/controller/sharedPrompts.ts`, `state/controller/conversationHistory.ts`).
- Journey: `apps/app/e2e/real/branch-conversations.spec.ts`.

New app: one conversation, the newest 50 messages and Load earlier ([chat](../features/chat.md)).

Already planned, so not part of this gap:
- Decision 0002 §5, "later": a `conversations` table, `messages.conversation_id`, one shape per conversation, `author_id`, and steer and cancel as outbox mutations.
- `todo.md`, under the auth design: conversations owned by a person or a team, with the server setting the conversation.
- Decision 0009: toasts scoped to person, branch and repository.

Not planned: starting a new conversation, archiving one, a history list, branch-scoped conversations, and moving between them.

## Why

- One endless conversation grows slow and fills the agent's context.
- Spec mvp.md §6.4: "Each branch is one conversation, shared by everyone on the branch." J3 and J4 treat `main`'s conversation as the team's home.

## How it fits

- `conversations` rows in Postgres, synced by Electric. The server sets the conversation id, never the browser.
- Flows `chat/new`, `chat/archive` and `chat/open { id }`: client flows that write through the outbox, so the agent can call them too.
- A route `/app/c/$conversationId` in TanStack Router. Branch conversations hang off the repository and branch routes once [sandboxes](sandboxes.md) exist.
- The device cap ([size limit](lru-size-limit.md)) evicts whole conversations.

## Size

L. New, archive and history alone are M.

## State

- 06:10 on 2026-10-20: the old-app audit wrote this note as gap 5 (`status: idea`).
- **06:39:05:** Will: "One conversation per branch is important."
- 06:40 to 06:42:01: the lead wrote `PANEL-B-BRIEF.md`, started Sol at 06:40 and again at about 06:41:28 with sharing added, and started Panel B's Opus member and merger at 06:42:01. Status moved from `idea` to `designing`.
- 06:45: Sol's design finished (exit 0) with conversations as decisions 1, 2 and 8. It names no question for Will.
- By 06:55: Opus's design and `0013-branch-workspace.md` aren't written.
- 06:55:57: Opus's design written; it allowed New as a fresh generation per branch (`uuidv5(branch id, generation)`). **07:03:40: decision 0013 written (status: proposed)**: one conversation for the life of a branch, as Sol had it.
- **A shared rule since 07:01:52 on 2026-10-20:** `messages` syncs only `SYNCED_MESSAGE_COLUMNS` (`worker/Chat.ts`), so any column decision 0013 adds to `messages`, such as a branch or conversation id, must be listed there to reach devices ([local-first](local-first.md)).
- **07:20:20 on 2026-10-20: Panel B reported.** It merged Opus's and Sol's designs into decision 0013 (status: proposed) with a comparison appendix. Its decisions:
  - **Conversation:** one per branch, for the branch's life, with id `uuidv5(branch)`. Archive only hides it from your own list; a fresh topic means a new branch.
  - **Terminal:** the `@smthrs/ui` xterm inside an opaque-origin iframe, the frame pattern generated views already use. The page keeps the cookie-authenticated socket. One tmux session per person: the owner types, everyone else watches read-only, and the server drops their input.
  - **Sharing:** by person or link, read or write, never beyond the person's GitHub permission (write needs GitHub write). It never sends a GitHub invitation, and revoking closes the person's sockets (code 1008). Presence and cursors go through one hibernating room object per branch. Branch creation is left to 0012.
  - **First slice:** open a fixture repository's existing branch, ask in its conversation, open its terminal and run `git log` in a real Cloudflare container. Reloading keeps the same shell, and a second branch has its own conversation and terminal. The clone goes through a forge proxy that adds a read token outside the box. The same test runs locally (Docker) and live.
  - **Infrastructure and cost:** one Durable Object-scheduled container application (Debian with git and tmux), two Durable Object classes and one egress entrypoint, all in `alchemy.run.ts`; no new domain or npm dependency. The account already runs Containers for Electric. About $0.047 per awake branch-hour, about $11 a month at 8 hours a day; development under $2 a month.
  - Its `pnpm docs:check` exited 0 on the second run; the first stopped with "All fibers interrupted without error" ([docs check outcome](docs-check-flow-outcome.md)).
- **07:20:40 on 2026-10-20, the lead to Will:** "The branch workspace design is done (decision 0013), and building its first slice has started." And the one question: "on a public repository, should the live branch (conversation, terminals, presence, live edits) be visible only to Members and the people it's shared with? I recommend yes; the code itself stays public." The build uses the recommended answer until Will changes it.
- 07:23:41 to 07:25:38 on 2026-10-20, on disk: `apps/mvp/infra/sandbox/tmux.conf` and `apps/mvp/infra/sandbox/Dockerfile`, the first slice's branch machine. No report.
- **Status moved from designing to in-progress:** the first slice includes asking in a branch's own conversation, and a second branch with its own.
- 07:27:39 on 2026-10-20, the lead to Will: "the branch terminal and per-branch conversations are in progress." By 07:37 the slice's identifiable files are the branch machine (`infra/sandbox/`) and a container spike ([branch terminal](branch-terminal.md)); none is identifiably the conversation track's yet.
- 07:42:44 on 2026-10-20, on disk: migration `0014_branch_workspace.ts`, the first slice's tables (decision 0013 §1): `branches` (an immutable id; tracked by `branch/Track` from GitHub's refs), `conversations` (one per branch, id the version 5 UUID of the branch's id, so a device knows it offline), `conversation_id` on `messages` and `views`, and `terminal_sessions` (status and machine generation, never bytes). Rows written before it join the conversation of `GITHUB_REPOSITORY`'s `main`, so Will's history stays readable. It imports `src/features/branch/contract.ts`.
- 07:44 to 08:04 on 2026-10-20, on disk, unreported: `worker/branch/Conversations.ts` (07:46:25), `@smthrs/ui` `item-conversation/` (07:53:21) and `src/features/branch/` with `branch/track` (08:00 to 08:03); the terminal side is in [branch terminal](branch-terminal.md). No e2e or report by 08:07. Kept out of landing round 2 at 07:53:57 as still in flight ([land to main](land-to-main.md)).
- 08:12:57 on 2026-10-20: `src/features/branch/contract.ts` changed again. **About 08:15: the Claude usage limit stopped the builder** with every other Claude agent, unreported; the limit reset at 10:40. **10:42: the lead resumed it** from where it stopped ([branch terminal](branch-terminal.md)). No conversation e2e or report by 10:44.

- **10:50 to 10:53 on 2026-10-20: two P2s from [review round 4](review-round-4.md), both source-verified, sent to this builder by the lead at 10:53:16.**
  - **R4-5 (Codex Astra and Codex Sol): a branch's web views go to the home conversation.** `app/web/open` carries no conversation in its payload or checked result, and `show` sends no `conversationId` (`src/features/web/steps.ts:62-68`), so `worker/Views.ts:157-166` inserts every view into home. Asking the agent in branch B to open a page, or `/web … embed` there, puts the card in home and not in B, and can show B's context to home's readers. Fix: capture the conversation at dispatch, carry it through the durable checked-page payload into `ViewsClient.add`; an agent child inherits its parent answer's conversation, never the tab's current location.
  - **R4-6 (Codex Sol): the full-screen view resolves home rows only.** `shown` joins `showing` with the home `views` collection (`src/features/views/store.ts:73`, `:75-99`; `views.ts:29-35`; `screens/view/ViewScreen.tsx:11-21`), so `/app/views/<id>` for a branch view stays blank even when the branch collection has the row. Fix: the route opens the owning conversation's collection, keeping authorization.
- 10:55 to 10:58 on 2026-10-20, on disk, unreported: `src/features/views/store.ts` gains `forConversation` and `shownIn(conversationId)`, with `views.ts` and `ViewScreen.tsx` (10:55:48); `src/features/web/steps.ts` (10:57:04) carries `conversationId` on the checked page ("a person's open goes to the conversation" it asked from); `worker/Views.ts` (10:58:04).
- **11:01 to 11:05 on 2026-10-20, more from round 4 on this slice, unrouted:**
  - Fable's R4-12 (P2, reproduced): the conversation shapes swap to an empty `NO_CONVERSATION` shape under the same URL when the session lookup fails, and Electric's `must-refetch` then empties the device's persisted `messages` and `views` ([local-first](local-first.md)).
  - Opus P3-12: `GITHUB_REPOSITORY` is parsed three ways (`db/migrations/0014_branch_workspace.ts:71-72`, `worker/branch/Conversations.ts:18-21`, `worker/github/Config.ts`), so a migration run under another environment leaves no home conversation and every ask answers `503 no_home`; `BRANCHES_SHAPE_ROUTE` has no route (`src/features/branch/contract.ts:9`).
  - Opus's light review: migrations 0013 to 0016 have constraints and partial unique indexes that match the code, `REPLICA IDENTITY FULL` where Electric needs it, and rows scoped per conversation.

- 2026-10-20: S1 built locally ([branch-workspace.md](../features/branch-workspace.md)): `0014_branch_workspace`, `branch/track`, conversations per branch, `terminal/open` and the remote `terminal/Open`, `SandboxObject` and its container, the forge proxy (`GitProxy`), `TerminalFrame` and `TerminalSocket`, and `e2e/branch-workspace.spec.ts` against `alchemy dev` with Docker. Not deployed: the live half waits for Will.
- 12:14 on 2026-10-20: status `building` is not a tracker status; set to `in-progress`. 11:58 (the lead to Will): the branch slice's first browser run failed two tests: the terminal never appeared, and a branch view showed twice. The agent is still on it; `e2e/branch-workspace.spec.ts` changed at 12:08:46 and `worker/branch/Terminals.ts` since 12:00; unreported by 12:14.
- **13:32:18 on 2026-10-20: the branch workspace e2e passed** ([branch terminal](branch-terminal.md)), including "a branch's conversation only" and branch views opened from the branch and from its URL; GIF `~/Desktop/smithers-mvp/gifs/branch-workspace/branch-workspace-branch-conversation.gif`.
- **13:42:00, the builder:** the slice is finished and "All the review findings are fixed and tested", R4-5 and R4-6 included; a late answer can no longer overwrite the next branch's page. Known gap: Retry doesn't reconnect a branch's views shape.
- One conversation per branch is done. New, archive and history for a person's own list have no builder. **Status moved from in-progress to todo.**

- **2026-10-22: new, archive and history built** by the conversations builder ([conversations](../features/conversations.md)): `/new` (`conversation/new`) makes a new branch of the repository the tab shows, or the deployment's own from `/app`, and opens it; Archive and Restore (`conversation/archive`) change only the person's own list, on every device, the latest act winning, and opening the branch brings it back; the agent can do both, archiving the conversation it answers in; `/app/conversations` lists the conversations the person opened or asked in, searchable, with the archived ones a switch away. Migration `0047_conversation_people`. Codex Astra reviewed three times; every finding fixed (a fresh `/new` never opens an existing conversation, pending acts follow their runs after a reload, every act carries a time fixed when it is first taken), but one: the list's view stays core until the plugin host serves a `core/conversations` query. E2e: history and archive on two devices, GIFs `~/Desktop/smithers-mvp/gifs/conversations-history.gif` and `conversations-archive.gif`; `/new`'s e2e needs Code Storage, which the Mac mini's dev server lacks, so it ran only as unit and device tests.

## Next

From 13:42 on 2026-10-20: the per-branch work lands in round 3 ([land to main](land-to-main.md)). New, archive and history for a person's own list wait for a builder.

Until 13:46 on 2026-10-20 the next step was, from 10:53 on 2026-10-20: the first slice's report as before (open a branch, ask in its conversation, a second branch with its own), plus R4-5 and R4-6 with tests that fail on the old code: a view opened in branch B appears only in B, also when the tab moves to A before the step completes and on a resumed run; a fresh full-screen URL for a non-home view resolves ([review round 4](review-round-4.md)). New, archive and history for a person's own list follow.

Until 10:53 on 2026-10-20 the next step was, from 07:20 on 2026-10-20: the first slice's report: open a branch, ask in its conversation, and a second branch with its own conversation. New, archive and history for a person's own list follow.

Until 07:20 on 2026-10-20 the next step was, from 07:03 on 2026-10-20: S1's conversation track, beside the [terminal](branch-terminal.md) track; it meets on the branch page.

Until 07:03 the next step was: Opus merges both designs into 0013. The walking skeleton creates a branch, ensures its conversation, sends a scoped ask, and proves branch B can't see branch A's conversation.

## Questions for Will

- Is a conversation one person's, one branch's, or both? The spec says one per branch, shared. Recommended: per person first (new, archive, history), then branch conversations with sandboxes. (Answered 06:39:05 on 2026-10-20: "One conversation per branch is important." Sol's design: one shared conversation per branch, archive per person.)
- Panel B sends at most 3 questions with 0013. (07:03: 0013 has one, on who sees a public repository's live branch ([branch sharing](branch-sharing.md)); it decides these shapes' authorization.) (Asked by the lead at 07:20:40 on 2026-10-20; the first slice builds on yes until Will changes it.)
