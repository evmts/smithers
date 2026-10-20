---
title: Share a branch, Google Docs style (multiplayer read and write)
status: todo
area: app
owner: unassigned; from 13:21:12 on 2026-10-20 it waits for the [branch terminal](branch-terminal.md) slice. Until 13:21: unassigned; designed in decision 0013 (Panel B reported 07:20:20 on 2026-10-20); not in the first slice, which started 07:20:40. Until 07:20: Panel B; decision 0013 written 07:03:40 on 2026-10-20 (status: proposed); no builder yet. Until 07:03: Panel B (Opus merges into decision 0013; started 06:42:01 on 2026-10-20). Sol's design done 06:45; Opus's independent design written 06:55:57
updated: 2026-10-20
links: [../decisions/0013-branch-workspace.md, conversations-and-history.md, branch-terminal.md, sandboxes.md, roles-and-labels.md, auth.md, sign-in.md, local-first.md, notifications-and-live-work.md, old-app-feature-gaps.md, decisions-for-will.md, ../decisions/0005-sandboxes-secrets-and-the-forge.md, ../decisions/0007-roles-and-tags.md, ../decisions/0008-auth.md, docs-check-flow-outcome.md, second-build-machine.md]
---

## What

Create a branch, then share it with other people to read or write. Everyone on the branch gets a live multiplayer experience: who's here, cursors, editing files together, the branch's shared conversation, and its shared terminal (read-only for readers).

```
Share  ┌──────────────────────────────┐
       │ maya@…        Write  ▾  ✕    │   branch grant: read | write
       │ sam           Read   ▾  ✕    │   never more than repository role ∩ GitHub permission
       │ [Copy link]                  │   link needs sign-in and an eligible person
       └──────────────────────────────┘
branch page:  presence ● ● ●   files (Yjs)   conversation (Electric)   terminal (PTY, control by one writer)
```

**Decided in 0013 (07:03, proposed), decisions 8 to 11:**
- **A share names a person by GitHub id, or is a link, and grants `read` or `write`.** Effective access is the minimum of the share, the person's role (from GitHub, re-checked hourly) and the branch's mode, decided at every check. Write needs the Member role (GitHub write); read on a private repository needs GitHub read. A link grants only to signed-in people who already qualify.
- **GitHub stays untouched:** no GitHub invitation, and never secrets, merging, approvals or administration.
- **The live workspace (conversation, terminals, presence, live edits) is visible only to Members and the people a branch is shared with,** even on a public repository; the code stays as public as GitHub makes it. This is 0013's question for Will.
- **Transports:** conversations, shares and terminal rows through Postgres and Electric; files through 0005's Yjs documents over Electric; presence and cursors through one hibernating `RoomObject` per branch that stores nothing; terminal bytes through the branch's `SandboxObject`.
- **Revocation is one flow step:** bump `access_epoch` (0007 §6), then evict the person from the room and the sandbox (close code 1008); a former writer loses their tmux sessions; shapes refuse within one live request (up to 20 s).
- **Build order:** S1 (conversations and the terminal) leaves out sharing, presence and co-editing. Then the access-and-sharing stream (`packages/access`, `worker/flows/Share*.ts`, `src/features/sharing/**`, `ShareDialog`, `PeoplePicker`) waits on 0007 phase 2's per-repository roles; presence and co-editing are their own streams.

The best guess before 0013, from Sol's design (scratchpad `final/panel-b-sol.md`):
- **A share narrows; it never widens.** A grant is `read` or `write`. What a person may do is the intersection of their repository role (0007), their GitHub permission, the branch's mode and protection, and the grant. A share never promotes a repository role and never calls GitHub's collaborator-invitation API (M-46).
- **Guests:** may read a shared branch if GitHub lets them read the repository. They can't edit files, steer the agent or type in the shell.
- **Links:** sharing with named people is the default. A read or write link works only for people who are signed in and already eligible; the token is hashed, never synced or logged. Revoking a link revokes grants that came only from it.
- **What a share never grants:** secrets, merging, approvals or repository administration.
- **Revocation:** stop admitting operations, close sockets, and kill a shared shell whose controller lost access, before reporting done. Cached rows for that branch leave the device; text already read can't be recalled.
- **Three protocols:** Electric and Postgres for the conversation, views and membership; Yjs for open files (0005 already chose it); authenticated WebSockets for presence, cursors and the PTY.
- **Flows:** `branch/SharePerson`, `branch/SetLink`, `branch/RevokeShare` (the branch's creator with write authority, or a Maintainer; people only), `branch/RedeemShare`, `branch/Join` and `branch/Leave`.
- **Tables:** `branch_grants (branch_id, person_id)` and `branch_links`.
- **Dialog copy:** `Read`, `Write`, `Copy link`, `Remove`. Outside a private repository: `GitHub access required`.

## Why

Will, 06:40:35 on 2026-10-20: "we also want to add google docs style sharing where we can create a branch share withothers to read and write to that branch in multiplayer experience".

Scope: M-17 restored shared branch access and presence. The rest of Pair multiplayer stays blocked until Will authorizes it (#3401, root `AGENTS.md`). This request is Will's own and sits inside M-17's shared access and presence. The old app had presence and co-editing with cursors (`cards/BranchCard.tsx`, `cards/CodeEditorSurface.tsx`, `runtime/LiveDocProvider.ts`).

## State

- 06:40:35 on 2026-10-20: Will's request. About 06:41 the lead appended it to `PANEL-B-BRIEF.md` as item 3 ("Added by Will mid-design") and restarted Sol's run with it.
- 06:42:01: the lead started Panel B's Opus member and merger.
- 06:45: Sol's design finished (exit 0), with sharing as its decisions 5 to 7. It names no question for Will.
- By 06:55: Opus's design and `0013-branch-workspace.md` aren't written.
- 06:55:57: Opus's design written. **07:03:40: decision 0013 written (status: proposed)**, with one question for Will, on public repositories (below).
- **07:20:20 on 2026-10-20: Panel B reported.** It merged Opus's and Sol's designs into decision 0013 (status: proposed) with a comparison appendix. Its decisions:
  - **Conversation:** one per branch, for the branch's life, with id `uuidv5(branch)`. Archive only hides it from your own list; a fresh topic means a new branch.
  - **Terminal:** the `@smthrs/ui` xterm inside an opaque-origin iframe, the frame pattern generated views already use. The page keeps the cookie-authenticated socket. One tmux session per person: the owner types, everyone else watches read-only, and the server drops their input.
  - **Sharing:** by person or link, read or write, never beyond the person's GitHub permission (write needs GitHub write). It never sends a GitHub invitation, and revoking closes the person's sockets (code 1008). Presence and cursors go through one hibernating room object per branch. Branch creation is left to 0012.
  - **First slice:** open a fixture repository's existing branch, ask in its conversation, open its terminal and run `git log` in a real Cloudflare container. Reloading keeps the same shell, and a second branch has its own conversation and terminal. The clone goes through a forge proxy that adds a read token outside the box. The same test runs locally (Docker) and live.
  - **Infrastructure and cost:** one Durable Object-scheduled container application (Debian with git and tmux), two Durable Object classes and one egress entrypoint, all in `alchemy.run.ts`; no new domain or npm dependency. The account already runs Containers for Electric. About $0.047 per awake branch-hour, about $11 a month at 8 hours a day; development under $2 a month.
  - Its `pnpm docs:check` exited 0 on the second run; the first stopped with "All fibers interrupted without error" ([docs check outcome](docs-check-flow-outcome.md)).
- **07:20:40 on 2026-10-20, the lead to Will:** "The branch workspace design is done (decision 0013), and building its first slice has started." And the one question: "on a public repository, should the live branch (conversation, terminals, presence, live edits) be visible only to Members and the people it's shared with? I recommend yes; the code itself stays public." The build uses the recommended answer until Will changes it.
- 07:23:41 to 07:25:38 on 2026-10-20, on disk: `apps/mvp/infra/sandbox/tmux.conf` and `apps/mvp/infra/sandbox/Dockerfile`, the first slice's branch machine. No report.
- **Status moved from designing to todo:** the design is done, and the first slice leaves sharing out.
- 13:19:52 on 2026-10-20: the lead's list: "Share a branch, Google Docs style: not started (later slice of 0013)".
- 13:21:12: the lead: branch sharing builds on the branch and terminal slice that's still running, so it waits for the [branch terminal](branch-terminal.md) builder. Not in the 13:22 batch Will approved at 13:21:41 ("start the ones that can start now"). A [second build machine](second-build-machine.md) wouldn't change the order, since it needs that slice.

## Next

From 07:20 on 2026-10-20: sharing builds after the first slice (branch conversation and [terminal](branch-terminal.md)) and 0007 phase 2: by person or link, read or write, capped at GitHub permission, with one room object per branch for presence.

Until 07:20 on 2026-10-20 the next step was, from 07:03 on 2026-10-20: Will answers 0013's question; sharing builds after S1 and 0007 phase 2.

Until 07:03 the next step was: Opus merges both designs into 0013. Sharing builds after the branch conversation and the [terminal](branch-terminal.md) skeleton, since it extends both.

## Questions for Will

- Q1 of 0013: on a public repository, is the live branch (its conversation and history, terminals, presence and live edits) visible only to Members and the people it's shared with? Recommended: yes. It narrows 0007's "watching a branch live: anyone if public"; the code stays public. The first slice's shape authorization depends on it; if no, every visitor can watch every terminal. (Asked by the lead at 07:20:40 on 2026-10-20; the first slice builds on yes until Will changes it.)

Until 07:03: None yet. Panel B sends at most 3 with 0013. Sol's recommended defaults: share links need sign-in, and Guests stay read-only. Letting a Guest type into a branch shell would need its own trust decision.
