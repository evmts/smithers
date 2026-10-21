---
title: Consistent loading and hover preloading
status: in-progress
area: app
owner: loading-pattern builder assigned by lead
updated: 2026-10-20
links: [navigate-flow.md, repo-view-branches-raw-clone.md, notifications-and-live-work.md, ../rulings.md]
---

## Current specification — 2026-10-20, 18:18 PDT

**What:** Use one calm app-wide loading pattern, retain useful content and preload on hover where appropriate.

**Why:** Will repeatedly rejected janky spinners; the 18:16 repo review adds hover preloading and clone workflow notifications.

**Current state:** At 18:10–18:12 the lead assigned navigate investigation and app-wide indicator replacement. The latest repo feedback adds scope; no completed fix receipt.

**Next step:** Delay visible loading by 300 ms, then use a stable bar or placeholder; keep navigation content until ready. Route clone progress through durable notifications; prove no flash, no layout shift and visible destinations.

**Open questions for Will:** None; the recorded requests settle product intent.

Evidence: script-filtered user text and lead replies from the latest two session hours; queue answers through 2026-10-21 01:16:08 UTC; current rulings, decisions, proposals, TODOs, rules and shared panel briefs/designs. Later rulings override historical proposals. Product receipts are reported evidence; this pass validates the site build only.
