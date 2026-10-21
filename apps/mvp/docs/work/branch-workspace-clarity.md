---
title: Clear branch workspace and understandable walkthrough
status: in-progress
area: app
owner: branch page and recording agent assigned by the lead
updated: 2026-10-20
links: [branch-terminal.md, branch-sharing.md, chaptered-review-videos.md, ../decisions/0013-branch-workspace.md]
---

## Current specification — 2026-10-20, 22:20 PDT

**What:** Make the branch, conversation, terminal, views and people immediately recognizable, and make every recording say what it shows.

**Why:** Will rejected the replacement video at 17:30: most of it looked empty and its purpose was unclear.

**What was on screen:** a 1280 px page with a small header, a Code view that rendered nothing for an uncloned repository, a Terminal view with a small button and seconds of nothing while the machine woke, and a conversation that was the animated wordmark or loose bubbles under the view. The recordings showed 560 px device windows that were scaled up, and their captions were URLs and ids.

**Built (code-complete, unit-tested):**
- The branch page is two columns: the view (Code or Terminal) beside the conversation, with the composer at the conversation's foot. The chrome shows the branch name, the person's access (`Owner`, `Can edit`, `Can view`), everyone on the branch with this person first, and the Code and Terminal tabs (only the current one is marked).
- Empty states: `Not cloned` and `Cloning` in the Code view, `No messages yet` in an empty branch conversation, and `No access` in the conversation's place. The Terminal view always shows its screen: Open terminal in the middle, a spinner while the machine wakes, or `No terminals`.
- The terminal panel shows a terminal that turns up after it found none, so a reload on a loaded machine no longer leaves the view blank (`terminal/actions.ts` `show`).
- Recordings: a 2 s title card (feature, test name, one line from a `summary` annotation or the title), captions in product words, harder cuts of idle waits, 1280×800 windows at 1:1, about half in dark mode by a hash of spec and title, and `status` and `theme` in `<test>.chapters.json`.

**Todo (after the test pause lifts):** re-record `e2e/branch-workspace.spec.ts` and `e2e/branch-sharing.spec.ts` on the mini (`-e BASE_URL=http://localhost:1337` until the HTTPS default works there), review the videos frame by frame, and hand the media paths to the lead. The last mini runs proved branch-workspace 4/4 before the theme and viewport change and 3/4 after (the terminal reload failure is the bug fixed above). Branch-sharing was blocked by the mini's stale `text_updates` table (repaired), then by the lockfile and AgentSandbox breakages (fixed by their owners), then by the pause.

**Open questions for Will:** None.
