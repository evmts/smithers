---
title: Clear branch workspace and understandable walkthrough
status: done
area: app
owner: branch page and recording agent assigned by the lead
updated: 2026-10-21
links: [branch-terminal.md, branch-sharing.md, chaptered-review-videos.md, ../decisions/0013-branch-workspace.md]
---

## Current specification — 2026-10-21, 00:25 PDT

**What:** Make the branch, conversation, terminal, views and people immediately recognizable, and make every recording say what it shows.

**Why:** Will rejected the replacement video at 17:30: most of it looked empty and its purpose was unclear.

**What was on screen:** a 1280 px page with a small header, a Code view that rendered nothing for an uncloned repository, a Terminal view with a small button and seconds of nothing while the machine woke, and a conversation that was the animated wordmark or loose bubbles under the view. The recordings showed 560 px device windows that were scaled up, and their captions were URLs and ids.

**Built (code-complete, unit-tested):**
- The branch page is two columns: the view (Code or Terminal) beside the conversation, with the composer at the conversation's foot. The chrome shows the branch name, the person's access (`Owner`, `Can edit`, `Can view`), everyone on the branch with this person first, and the Code and Terminal tabs (only the current one is marked).
- Empty states: `Not cloned` and `Cloning` in the Code view, `No messages yet` in an empty branch conversation, and `No access` in the conversation's place. The Terminal view always shows its screen: Open terminal in the middle, a spinner while the machine wakes, or `No terminals`.
- The terminal panel shows a terminal that turns up after it found none, so a reload on a loaded machine no longer leaves the view blank (`terminal/actions.ts` `show`).
- Recordings: a 2 s title card (feature, test name, one line from a `summary` annotation or the title), captions in product words, harder cuts of idle waits, 1280×800 windows at 1:1, about half in dark mode by a hash of spec and title, and `status` and `theme` in `<test>.chapters.json`.

**Proof (2026-10-21 00:16, Mac mini, HTTPS dev default):** `pnpm e2e branch-workspace.spec.ts branch-sharing.spec.ts`: 6 passed. `pnpm e2e:gifs`: 6 videos and GIFs, 0 fail the check. Every frame was reviewed. The videos are at `~/Desktop/smithers-mvp/videos/branch-workspace/{branch-conversation,branch-terminal,branch-views,second-branch-terminal}.mp4` and `~/Desktop/smithers-mvp/videos/branch-sharing/branch-sharing-{shared-to-view-ben-watches-maya-s-terminal-an,anyone-in-the-repository-with-the-link-reache}.mp4`, each with its `.chapters.json`.

**Follow-ups (todo, other owners):**
- A branch conversation stays blank for seconds until its shape first syncs (decision 0002: blank, never the empty state). On the mini it was 5 to 10 s.
- The full-screen view page shows only "Back to chat" until the framed page loads.
- The notifications pill sits over the repository header's Stack and Clone buttons at 1280 px.

**Open questions for Will:** None.
