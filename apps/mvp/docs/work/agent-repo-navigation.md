---
title: Agent navigates the repo view (feature 4)
status: todo
area: app
owner: unassigned; from 13:21:12 on 2026-10-20 it waits for the [repository home](repository-declared-home.md) builder, which edits the same routes. Until 13:21: unassigned (separate jj workspace)
updated: 2026-10-20
links: [../decisions/0004-agent-ui-codemode-and-rendering.md, ../decisions/0006-repo-clone-and-view.md, ../decisions/0011-the-agent-runs-in-the-browser.md, durable-browser-engine.md, navigate-flow.md, slash-commands.md, repo-clone-and-view.md, flows-and-agent.md, repository-declared-home.md]
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
- **05:56 on 2026-10-20: Will opened a repository page** at http://localhost:1337/octocat/Spoon-Knife, which the lead opened for him after "how do I view a repo?" ([repo clone and view](repo-clone-and-view.md)).
- **05:57 on 2026-10-20, Will:** "Can I open a repo via the chat from the home page though or do I have to travel directly to the url?" The lead: "Not yet: you have to type the URL. The agent's only flows today are switching the theme and reading a repository's tree and files ... Opening and navigating the repository view is feature 4, which isn't built yet."
- **05:58 on 2026-10-20: Will asked for a `navigate` flow** the agent can call; an agent builds it ([navigate flow](navigate-flow.md)). It covers opening a page by path, including a file and its `?L=` lines from chat. File tabs and the agent's synced highlights in the view stay with this item.
- **07:44 on 2026-10-20: [navigate](navigate-flow.md) is done.** Asking "open octocat/Spoon-Knife" moves the asking tab to the repository, and `/navigate /octocat/Spoon-Knife/blob/main/README.md?L=3` opens the file with line 3 highlighted. The agent's door into the repository view exists; file tabs and synced highlights don't yet. Still unassigned.
- 13:19:52 on 2026-10-20: the lead's list: "Agent navigates the repository view: not started".
- 13:21:12: the lead: it "edits the routes the home-view agent is editing", so it waits for the [repository home](repository-declared-home.md) builder. Not in the 13:22 batch.

## Next

From 13:21 on 2026-10-20: when the [repository home](repository-declared-home.md) builder finishes, an agent adds file tabs and the agent's synced highlights on top of `app/navigate`. Will listed it on his feature list (the lead's 13:19:52 table).

Until 13:21 on 2026-10-20 the next step was, from 07:44 on 2026-10-20: an agent adds file tabs and the agent's synced highlights on top of `app/navigate`, with views synced to every device and person (0004 Q3). Not started; it isn't on Will's 06:39 priority list ([old app feature gaps](old-app-feature-gaps.md)).

Until 07:44 on 2026-10-20 the next step was, from 05:58 on 2026-10-20: the [navigate flow](navigate-flow.md) lands first and gives the agent its door into the repository view. Then this item adds file tabs and synced highlights on top of it.

Until about 05:58 on 2026-10-20 the next step was: Start in its own jj workspace once features 1 and 2 have a first slice.

## Questions for Will

None. 0004's question on syncing views was answered at 22:35: yes.
