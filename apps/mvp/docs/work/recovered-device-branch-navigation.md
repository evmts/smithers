---
title: Restore branch navigation after offline sign-in recovery
status: in-progress
area: app
owner: recovered-device navigation builder assigned by lead; Codex curates tracker
updated: 2026-10-21 23:14 PDT
links: [production-e2e.md, sign-in.md, device-ownership-and-queued-authority.md, local-first-conflicts.md, ../rulings.md]
---

**What:** Show branch navigation after a device reopens following offline sign-in.

**Why:** A recovered signed-in device must reach its branch.

**Current state:** At 22:42 the lead reports this failure on both smithers.sh and workers.dev, leaving production E2E at 12/13. Track C’s four passing local sign-in tests at 22:54 do not prove this case. At 22:56 a dedicated builder is assigned. At 23:06 the new production suite is running without a reported final outcome.

**Next step:** Reproduce the recovery journey, fix it with a retained regression, land and deploy, then rerun against smithers.sh.

**Open questions for Will:** None.

Evidence: user text and lead replies extracted by script from session 6253ecf2, approximately 21:14–23:14 PDT; tool payloads and automated notifications excluded. The supplied continuation transcript path is absent; recent continuation-era replies are in the original file. Rulings and queue answers take precedence over older docs and surviving briefs. Wiped scratch files are not missing work. Product receipts are lead-reported; this refresh validates the site build. Codex curates documentation and retains execution ownership.
