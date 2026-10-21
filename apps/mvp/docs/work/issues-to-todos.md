---
title: Create TODOs from GitHub issues
status: in-progress
area: app
owner: TODO UI builder assigned by lead
updated: 2026-10-20
links: [issues.md, todos-and-stack.md, todos-draft-commit-drop.md, ../rulings.md]
---

## Current specification — 2026-10-20, 18:18 PDT

**What:** Create a TODO draft from an issue’s title and body, with reciprocal links.

**Why:** Will requested issue-to-TODO creation at 18:08.

**Current state:** The lead assigned Make TODO to the TODO restyling builder: issue row menu, issue page, key, slash command and agent all use the same flow. The person still commits the draft. No passing receipt.

**Next step:** Implement the draft flow and links, retain person-only Commit, and prove issue-to-draft-to-commit through the UI and agent. The later PR uses Fixes #n to close the issue.

**Builder receipt, 2026-10-20 19:50 PDT:** built. `todo/issue` (Make TODO in an issue's `⋯` menu and on its page with key `t`, `/todo.issue owner/repo <n>`, the agent) drafts from the issue on the device; Commit stores `todos.issue_number` (migration `0027_todo_issue`); the TODO links its issue and the issue its TODOs, and Make TODO shows only while none is open. Unit and integration tests pass locally against real Postgres and Electric; `e2e/todos.spec.ts` "todo-from-issue" skips without `E2E_ISSUES_REPOSITORY`, since neither dev database holds GitHub issues without the App. "Fixes #n" is Track B's.

**Open questions for Will:** None; the recorded requests settle product intent.

Evidence: script-filtered user text and lead replies from the latest two session hours; queue answers through 2026-10-21 01:16:08 UTC; current rulings, decisions, proposals, TODOs, rules and shared panel briefs/designs. Later rulings override historical proposals. Product receipts are reported evidence; this pass validates the site build only.
