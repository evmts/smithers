---
title: Publish views and remove the duplicate home schema
status: todo
area: sdk
owner: release and home-schema owners; not yet individually assigned
updated: 2026-10-20
links: [repository-declared-home.md, effect-repository-home.md, ../decisions/0014-flows-authoring-debugging-and-home-view.md]
---

## Current specification — 2026-10-20, 18:33 PDT

**What:** Publish @smthrs/views with the next release and delete the duplicate home schema in @smthrs/targets.

**Why:** Will approved publishing at 18:23; one canonical home-page format avoids drift.

**Current state:** At 18:24 the lead confirmed the release and schema consolidation. Will also approved keeping smithersai/home-fixture. No publication or completed consolidation receipt exists.

**Next step:** Publish in the next release, migrate consumers to the canonical public schema and delete the duplicate, retaining compatibility tests. Keep the existing fixture repository. No approval question remains.

**Open questions for Will:** None.

Evidence: script-filtered last two hours of session 6253ecf2 through 18:32 PDT; queue answers through 18:30 PDT; current rulings, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Queue answers supersede older open questions. Product receipts are reported evidence; this tracker validates only the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 18:26 PDT

**What:** Publish @smthrs/views with the next release and make @smthrs/targets consume its home format.

**Why:** Will approved publication at 18:23; the published targets package currently retains a duplicate because views is private.

**Current state:** At 18:24 the lead committed to public release and deletion of the second home-format implementation. Authorization exists; no release or migration receipt. The public smithersai/home-fixture is explicitly approved to stay.

**Next step:** Make the public package installable, update targets through its root export and workspace dependency, remove the duplicate implementation and parity-only test, and verify package/build/consumer behavior with release receipts.

**Open questions for Will:** None; both publication and fixture retention are settled.

Evidence: latest two session hours extracted by script as human text/lead replies; queue answers through 2026-10-21 01:24:15 UTC, current rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Latest rulings override historical proposals. Product results are reported receipts; this pass verifies the maintainer-site build only.
