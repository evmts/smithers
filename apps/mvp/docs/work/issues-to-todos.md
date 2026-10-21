---
title: Create TODOs from GitHub issues
status: in-progress
area: app
owner: TODO UI builder assigned by lead
updated: 2026-10-20
links: [issues.md, todos-and-stack.md, todos-draft-commit-drop.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-20, 22:05 PDT

**What:** Draft a TODO from a real GitHub issue, retaining reciprocal links and person-only Commit.

**Why:** Will asked for Make TODO from issues.

**Current state:** At 21:56 the lead reports the feature built but its browser test skipped because the dev database lacks GitHub issues. The builder is recording against the live GitHub test instance; no passing live receipt is reported.

**Next step:** Complete the real issue-to-draft-to-person-commit recording and hand proof to the lander within the current burn-down slice.

**Follow-up (status todo): record "todo-from-issue" live.** Run `e2e/todos.spec.ts` "todo-from-issue" against the live GitHub test instance with `E2E_ISSUES_REPOSITORY=roninjin10/smithers-github-tests` and a Member's `E2E_SESSION_COOKIE`, then `pnpm e2e:gifs:check`. It waits on write access to that repository for codeplanesmithers, which is a Guest there (GitHub read or triage maps to Guest, `worker/GitHubAuth.ts` `roleOf`), and on the lead lifting the 22:05 test pause.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies in session 6253ecf2, approximately 20:04–22:04 PDT; synthetic notifications, compaction summaries and tool blocks excluded. Rulings and queue answers through 19:38 prevail over historical briefs, decisions and proposals. Execution ownership retained; Codex curates this note. Product checks are reported evidence; tracker validation is the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 20:57 PDT

**What:** Draft a TODO from a GitHub issue and retain reciprocal source links.

**Why:** Will asked for Make TODO from issues.

**Current state:** At 20:27 PDT the lead reports Make TODO and the issues-style TODO UI built. The existing builder receipt documents real Postgres/Electric tests but a skipped issue-to-TODO browser journey without E2E_ISSUES_REPOSITORY. No later passing live-issue browser receipt supersedes that limitation; migration 0027 is now reported applied on shared dev.

**Next step:** Run the real issue-to-draft-to-person-commit browser journey with the GitHub fixture, record it and hand the verified slice to the lander. A draft must never silently commit or merge.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies from session 6253ecf2, approximately 18:57–20:57 PDT; current rulings and queue answers, decisions through 0021, proposals and shared briefs/designs. Transport details additionally use its final builder report. Product checks are reported evidence; this pass runs the maintainer-site build. Execution ownership retained.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 18:18 PDT

**What:** Create a TODO draft from an issue’s title and body, with reciprocal links.

**Why:** Will requested issue-to-TODO creation at 18:08.

**Current state:** The lead assigned Make TODO to the TODO restyling builder: issue row menu, issue page, key, slash command and agent all use the same flow. The person still commits the draft. No passing receipt.

**Next step:** Implement the draft flow and links, retain person-only Commit, and prove issue-to-draft-to-commit through the UI and agent. The later PR uses Fixes #n to close the issue.

**Builder receipt, 2026-10-20 19:50 PDT:** built. `todo/issue` (Make TODO in an issue's `⋯` menu and on its page with key `t`, `/todo.issue owner/repo <n>`, the agent) drafts from the issue on the device; Commit stores `todos.issue_number` (migration `0027_todo_issue`); the TODO links its issue and the issue its TODOs, and Make TODO shows only while none is open. Unit and integration tests pass locally against real Postgres and Electric; `e2e/todos.spec.ts` "todo-from-issue" skips without `E2E_ISSUES_REPOSITORY`, since neither dev database holds GitHub issues without the App. "Fixes #n" is Track B's.

**Open questions for Will:** None; the recorded requests settle product intent.

Evidence: script-filtered user text and lead replies from the latest two session hours; queue answers through 2026-10-21 01:16:08 UTC; current rulings, decisions, proposals, TODOs, rules and shared panel briefs/designs. Later rulings override historical proposals. Product receipts are reported evidence; this pass validates the site build only.
