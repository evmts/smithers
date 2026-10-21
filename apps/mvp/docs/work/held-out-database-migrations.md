---
title: Reconcile database migrations 0034 and 0035
status: todo
area: app
owner: unassigned; lead schedules after deployment
updated: 2026-10-21 02:06 PDT
links: [issue-lifecycle.md, device-data-migrations.md, land-to-main.md, land-and-deploy-mvp.md, ../rulings.md]
---

**What:** Identify the owners and intended features of the two database migrations excluded from round 4.

**Why:** Schema changes must ship with their consumers and real migration proof.

**Current state:** The 01:49 PDT lead update says two unfinished migrations were held out. AFTER-PAUSE.md names 0034/0035 and suggests issue-lifecycle drafts as a possible owner, explicitly unconfirmed. Migrations 0028–0033 landed in c6940ac5; no completion receipt exists for 0034/0035.

**Next step:** Identify each migration’s owner and consumers, reconcile against pushed main, and land only with the corresponding completed feature and forward-upgrade tests. Keep the unfinished POC path disabled.

**Open questions for Will:** None; ownership is for the lead to resolve from lane evidence.

## History

2026-10-21 02:06 PDT: Added by Codex tracker curator from script-filtered recent lead replies, Will’s queue answers, current rulings and AFTER-PAUSE.md. Execution has not been claimed or started by this documentation update.
