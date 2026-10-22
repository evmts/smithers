---
title: Reconcile preserved Ops checkout conflicts
status: todo
area: process
owner: Codex tracker (documentation); implementation unassigned
updated: 2026-10-21 11:44 PDT
links: [ops-vault-checkout-catch-up.md, ops-vault-history-repair.md, ops-vault-skill-audit.md, ../rulings.md]
---

**What:** Review the preserved Smithers-Ops local edits against current main and resolve the 41 reported conflicts without losing history.

**Why:** Updating the shared checkout fixed skill freshness but did not reconcile the old local work.

**Current state:** At 11:43 PDT the lead reports 1,329 locally edited files preserved in a commit marked stuck, with 41 conflicts requiring judgment. The shared checkout is now on main. A scratchpad backup is reported; no conflict-resolution receipt exists.

**Next step:** Assign an owner, inspect the preserved commit through jj, compare each conflict with current rulings, and retain or explicitly supersede the edits with validation. Keep private Ops contents outside this public tracker.

**Open questions for Will:** None identified yet; queue only substantive decisions that evidence cannot settle.

History: Added by Codex tracker curator from the lead’s 2026-10-21 11:43 PDT text reply, extracted by script from the latest two hours of session 6253ecf2. Rulings and queue answers take precedence over historical briefs and docs. No Ops mutation was performed by this tracker.
