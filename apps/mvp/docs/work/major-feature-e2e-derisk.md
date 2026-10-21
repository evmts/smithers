---
title: Derisk every major feature end to end
status: in-progress
area: process
owner: lead coordinating four-model panels; Opus to implement after merged reports
updated: 2026-10-21 09:24 PDT
links: [../rulings.md, sandboxes.md, cloudflare-flow-host.md, e2e-suite-and-gifs.md, issues.md, repo-clone-and-view.md, vibelang-coding-factory.md, token-spend-alerts.md, roles-and-labels.md, conversations-and-history.md, sign-in.md, local-first-conflicts.md, todo-active-run-view.md]
---

**What:** Coordinate four-model investigations of the major end-to-end failures, merge their reports, then have Opus implement and prove the fixes. Feature implementation stays in the linked workstreams.

**Why:** At 09:23:49 PDT Will said: “panel of 4 on all of those. And then immediately have opus implement all of these we gotta derisk everything”. This extends the sandbox priority to the full failure list.

**Current state:** The sandbox panel (Sol, Astra, Opus, Fable), remote-host repair and fixed-revision 37-spec sweep are reported running. No launch receipt for additional panels, merged reports, completed sweep or completed production repair exists in the reviewed text. Known hosted failures: sandboxes, webhook issue sync, clone/import, TODO runs/factory, spend alerts, role checks, chat expiry and GitHub token revocation. Local gaps: question loss across tabs, first identity-check failure needing reload, and missing TODO steering. Production e2e coverage is absent, a proof gap rather than an executed failing test.

**Next step:** The lead extends the panel remit to every listed failure, combines independent findings into concrete repairs, and hands implementation immediately to Opus. Collect the sweep matrix and add missing production tests. Record per-feature revision, failing regression, passing local/production receipts and GIF; keep blocked cases visible. Reuse the existing feature notes rather than opening competing implementation lanes. Cloudflare stays preferred for sandboxes; Freestyle is the fallback if Cloudflare cannot meet the requirements. Secrets stay disabled until proven safe; people approve and merge.

**Open questions for Will:** None. The latest direction is explicit; no additional product-scope approval is needed.

Evidence: session 6253ecf2, script-filtered user text and lead replies in the last approximately two hours through 09:23:49 PDT; automated notifications, compacted summaries and tool results excluded. Rulings (including ARCH-14), Will’s queue answers, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules were reconciled. Product results are lead-reported; this tracker verifies the site build only. Existing feature execution ownership is retained.
