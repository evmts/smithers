---
title: Repair offline branch page on current main
status: in-progress
area: app
owner: Codex offline-chrome finisher; Codex tracker owns note
updated: 2026-10-21 23:44 PDT
links: [recovered-device-branch-navigation.md, repo-view-branches-raw-clone.md]
---

## Tracker reconciliation — 2026-10-21 23:44 PDT

**What:** Keep branch navigation visible after an offline reopen.

**Why:** An evicted device must recover usable branch chrome.

**Current state:** At 23:37 the lead reports the fix queued with the lander. Report b0d527eee738 traces the two failures to a fixture that declared main without publishing its ref; assertions are unchanged. Offline tests pass 2/2, branch suites 41/41, import rules and full typecheck pass; the corrected tests fail on the old chrome implementation. Not pushed.

**Next step:** Land the queued fix and verify the recovered-device journey against production.

**Open questions for Will:** None.

Evidence: recent user-typed text and lead replies extracted by script from the last two transcript hours; surviving final briefs/reports, rulings and queue answers. The named continuation file is absent; continuation-era replies are present in the original transcript. Reboot-wiped files are not missing work. Implementation ownership is retained; Codex maintains this note. Product checks above are reported receipts.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 23:35 PDT

**What:** Restore offline branch chrome after device eviction.

**Why:** A recovered device must retain usable branch navigation.

**Current state:** At 23:26 the lead assigns a repair: db36c070ad32 fails two offline tests on current main (failed versus ready). Two sibling branch-page fixes are accepted. The surviving OFFLINE-CHROME brief requires finding the changed behavior without weakening assertions; no completion report exists.

**Next step:** Reproduce on current main, fix the product or incorrect expectation from evidence, retain regression proof, then pass branch tests, import rules and typecheck.

**Open questions for Will:** None.

Evidence: script-filtered recent human text and lead replies in session 6253ecf2; surviving briefs/reports, rulings, queue answers and decision 0021. The continuation filename was not found; continuation-era replies survive in the original transcript. Reboot-wiped files are not missing work. Product receipts are reported evidence; tracker validation is the site build.
