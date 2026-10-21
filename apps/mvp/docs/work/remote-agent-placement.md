---
title: Move coding agents onto the mini and Latitude
status: todo
area: infra
owner: unassigned; lead schedules after deployment
updated: 2026-10-21 02:06 PDT
links: [mac-mini-test-farm.md, second-build-machine.md, disk-space.md, agent-task-routing.md, ../rulings.md]
---

**What:** Plan execution placement for coding agents on the Mac mini and Latitude servers.

**Why:** Will’s 00:09 queue answer asks to use the available machines safely rather than keep filling the MacBook.

**Current state:** At 00:10 PDT the lead explicitly defers the agent-placement/auth plan until after deployment. Existing remote test capacity is not proof that coding-agent placement or login is ready. No completed placement plan or agent-run receipt appears.

**Next step:** Use the shared execution-environment capability to inventory capacity and login status without exposing credentials; plan isolated agent runs and prove one on each selected host. Preserve active sessions and avoid copying credentials into repository files or logs.

**Open questions for Will:** None; compute use is authorized. Resolve routine placement choices from measured capacity.

## History

2026-10-21 02:06 PDT: Added by Codex tracker curator from script-filtered recent lead replies, Will’s queue answers, current rulings and AFTER-PAUSE.md. Execution has not been claimed or started by this documentation update.
