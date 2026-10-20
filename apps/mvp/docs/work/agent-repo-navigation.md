---
title: Agent navigates the repo view (feature 4)
status: todo
area: app
owner: unassigned (separate jj workspace)
updated: 2026-10-19
links: [../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0006-repo-clone-and-view.md, ../decisions/0011-the-agent-runs-in-the-browser.md, durable-browser-engine.md]
---

## What

The agent moves through the repo view and answers questions: it opens files, highlights lines, and adds or removes file tabs at the top of the view. Each move is a flow over the view's state, so a person and the agent use the same doors.

## Why

Will: "the agent being able to smoothly navigate the github repo and answer questions. It should be able to do things like open files and highlight lines of code for the user. Files themselves should show up as tabs". He asked for it to run beside the main line because "it's so important".

## State

- Not started. It needs [flows and the agent](flows-and-agent.md), [repo clone and view](repo-clone-and-view.md) and [agent UI](agent-ui-rendering.md).
- Decision 0004 checks the design leaves room for it. If views sync across devices, the agent's highlight shows on every device.
- 22:31 on 2026-10-19: decision 0011 runs the agent in the browser, so opening a file or highlighting lines needs no server round trip.
- 22:35: 0004 Q3 answered: views sync to every device and every person in the conversation, so the agent's highlight shows everywhere; open tabs and scroll position stay per device. Will: "Yes it syncs this is what enables multiplayer to work".
- 23:02: the lead's board: not started; "repo navigation (feature 4) waits on features 2 and 3". Feature 3's SDK half (V1+V2) started at 23:01 ([agent UI](agent-ui-rendering.md)).

## Next

Start in its own jj workspace once features 1 and 2 have a first slice.

## Questions for Will

None. 0004's question on syncing views was answered at 22:35: yes.
