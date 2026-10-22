---
title: Apply job deadlines to starting and collecting work
status: in-progress
area: sdk
owner: Mac mini runner builder assigned by lead
updated: 2026-10-21 13:54 PDT
links: [mac-mini-subscription-routing.md, durable-queue-recovery.md, agent-review-finding-repairs.md, ../rulings.md]
---

**What:** Cover job start and result collection with the declared deadline.

**Why:** A job timeout must bound the entire operation, including a blocked launch or collection.

**Current state:** At 13:49 the lead reports a confirmed engine finding: the timeout excludes starting and collecting a job. The Mac mini runner builder is already fixing it; no passing regression or landing is reported.

**Next step:** Retain regressions with unresolved start and collect operations, deadline expiry, cancellation and recovery; land the SDK repair and validate runner consumers.

**Open questions for Will:** None.

Evidence: lead text replies at 13:44–13:53 PDT on 2026-10-21, extracted by script from session 6253ecf2 within its latest approximately two hours. Automated notifications, relayed agent messages and tool content are excluded. Rulings and queue answers take precedence over historical briefs and designs. Results are lead-reported; this tracker verifies the maintainer-site build. Existing implementation ownership is retained.
