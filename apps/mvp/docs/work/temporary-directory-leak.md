---
title: Stop temporary-directory disk leaks
status: in-progress
area: infra
owner: Codex Sol leak investigator assigned by lead
updated: 2026-10-21 12:04 PDT
links: [disk-space.md, dev-stack-hygiene.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 12:04 PDT

**What:** Stop transformed-source temporary directories accumulating across test runs.

**Why:** Recurring leaked outputs exhaust the development machine’s disk.

**Current state:** The last repair report still has the Vitest transformed-source cache fix awaiting landing. At 11:39 a temporary ten-minute sweeper and cleanup restored 15 GB; at 12:03 the lead reports 9.5 GB free during dependency installs and sets a below-6-GB alert. Falling space is not fresh proof that the leak itself worsened; neither repair landing nor a leak-free repeated-run receipt is reported.

**Next step:** Obtain the repair commit and repeated-run evidence across success, failure and cancellation; retire the temporary sweeper only after the fix is verified. Track overall install-driven capacity in disk-space.md.

**Open questions for Will:** None.

Evidence: user-typed text and lead replies extracted by script from session 6253ecf2, 10:03–12:03 PDT; current rulings and queue answers override historical briefs and design records. Product receipts are lead-reported; tracker verification is the maintainer-site build. Existing engineering owners remain assigned; Codex curates this note only.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 11:40 PDT

**What:** Stop transformed-source temporary directories exhausting disk.

**Why:** Repeated abandoned outputs interrupt development and tests.

**Current state:** At 11:26 the lead reports 224 new leaked folders and only 2.9 GB free while the repair waits to land. At 11:39 cleanup restored 15 GB; a temporary sweeper removes stale leaked folders every ten minutes. The leak is still not reported fixed in the running toolchain.

**Next step:** Land the existing repair, prove repeated runs stop accumulating abandoned folders, and retire the temporary sweeper once recovery is verified. Cleanup alone is not completion.

**Open questions for Will:** None.

Evidence: lead text replies through 11:39 PDT in session 6253ecf2, extracted by script from the latest two hours; rulings and queue answers take precedence over shared briefs, designs and older docs. Product results are reported evidence; this refresh validates the site build only. Existing implementation ownership is retained; Codex curates this note.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 10:04 PDT

**What:** Stop repeated transformed-source temporary directories exhausting disk.

**Why:** The abandoned 40–60 MB outputs accumulated across test runs.

**Current state:** At 10:03 PDT the lead reports the leak identified as Vitest 5 transformed-source copies and fixed by reusing one cache folder. The repair is going to the lander; no landing receipt appears. Earlier safe cleanup recovered disk from 7 GB to 33 GB.

**Next step:** Retain the regression/validation and landing receipt, then confirm repeated runs do not accumulate new abandoned directories. Do not claim shipped completion from a handoff.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead text replies in session 6253ecf2, latest approximately two hours through 10:03 PDT; automated notifications, compaction summaries and tools excluded. Current rulings and queue answers override historical briefs, designs, decisions, proposals, TODOs and rules. Product receipts are lead-reported; this tracker validates only the site build. Execution ownership retained; Codex curates documentation.

## Earlier tracker history (retained)


**What:** Ensure tool-created temporary directories are reclaimed when their owning run finishes.

**Why:** Repeated abandoned outputs exhausted the MacBook disk.

**Current state:** At 09:46 PDT the lead reports a tool leaving about 60 MB per invocation and 1,318 stale directories. Cleanup recovered free disk from 7 GB to 33 GB. A Codex Sol investigation is running; no root-cause fix or validation receipt is reported.

**Next step:** Identify the owning tool, implement cleanup through its existing lifecycle, and verify success, failure and cancellation while preserving active runs. Record the landed revision and cleanup regression.

**Open questions for Will:** None.

Evidence: lead text reply at 09:46 PDT in session 6253ecf2, extracted by script from the latest two hours. This is reported evidence; the tracker performs no disk cleanup or product tests. Codex curates this note; the assigned investigator owns implementation.
