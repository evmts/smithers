---
title: Move coding agents onto the mini and Latitude
status: in-progress
area: infra
owner: lead coordinates isolated mini builders; Codex tracker curates note
updated: 2026-10-21 20:55 PDT
links: [mac-mini-test-farm.md, second-build-machine.md, disk-space.md, agent-task-routing.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 20:55 PDT

**What:** Run coding builders in separate remote repository copies.

**Why:** Increase concurrency without shared-checkout conflicts and MacBook disk growth.

**Current state:** At 20:54 PDT the lead reports five Opus builders running on the mini, each in its own repository copy: file navigation, forms/views, secrets, plugins and custom domains. This supersedes the 20:46 authentication launch blocker. Astra reviews have also moved to the mini’s Codex account. Area-specific landers remain a proposal, not a completed rollout.

**Next step:** Collect individual builder receipts and measure throughput; keep remote tests and landing capacity distinct from builder availability.

**Open questions for Will:** The purpose and capacity of the Railway deployments remain unclarified.

Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, latest two hours through 20:55 PDT; synthetic notifications and tool blocks excluded. Current rulings and queue answers govern over historical decisions and proposals. Available recovered briefs were read; wiped scratch files are not missing work. Product results are lead-reported; Codex curates documentation and runs the maintainer-site build. Previous implementation ownership is retained below.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 20:47 PDT

**What:** Run isolated coding builders on the Mac mini and remote capacity.

**Why:** Increase throughput without shared-checkout conflicts or MacBook disk growth.

**Current state:** Will asks at 20:38 to raise concurrency using the mini and Railway and offers another Claude account. At 20:46 five mini builders have separate clones and briefs for file tabs, forms/views, secrets, plugins and custom domains. They await a background-session Claude login; no launch success is reported. Area landers with a shared push lock are a lead proposal, not an executed receipt.

**Next step:** Restore mini background authentication, prove one isolated builder, then launch the prepared work and measure capacity.

**Open questions for Will:** What are the Railway deployments for: agents/tests or app deployments? Background Claude authentication on the mini is required.

Evidence: script-filtered human text and lead replies, 18:46–20:46 PDT, session 6253ecf2; current rulings and queue answers prevail. Runner results are recovered report receipts. Codex curates this update; existing implementation ownership is retained.

## Earlier tracker history (retained)


**What:** Plan execution placement for coding agents on the Mac mini and Latitude servers.

**Why:** Will’s 00:09 queue answer asks to use the available machines safely rather than keep filling the MacBook.

**Current state:** At 00:10 PDT the lead explicitly defers the agent-placement/auth plan until after deployment. Existing remote test capacity is not proof that coding-agent placement or login is ready. No completed placement plan or agent-run receipt appears.

**Next step:** Use the shared execution-environment capability to inventory capacity and login status without exposing credentials; plan isolated agent runs and prove one on each selected host. Preserve active sessions and avoid copying credentials into repository files or logs.

**Open questions for Will:** None; compute use is authorized. Resolve routine placement choices from measured capacity.

## History

2026-10-21 02:06 PDT: Added by Codex tracker curator from script-filtered recent lead replies, Will’s queue answers, current rulings and AFTER-PAUSE.md. Execution has not been claimed or started by this documentation update.
