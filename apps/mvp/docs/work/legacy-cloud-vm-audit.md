---
title: Audit the two legacy Google Cloud VMs
status: done
area: infra
owner: Codex Sol ops catch-up job assigned by lead
updated: 2026-10-21 22:43 PDT
links: [../rulings.md, ops-vault-checkout-catch-up.md, legacy-code-removal.md]
---

## Tracker reconciliation — 2026-10-21 22:43 PDT

**What:** Stop abandoned Google Cloud compute while retaining data.

**Why:** End unused compute spend without data loss.

**Current state:** At 22:36 the lead confirms the last machine stopped and no compute running in the project. Disks and data remain; the earlier Postgres backup succeeded. This completes shutdown, not data-preservation or deletion clearance.

**Next step:** Keep the separate data-preservation work open before any retirement deletion.

**Open questions for Will:** None newly required.

Evidence: script-filtered recent human messages and lead text replies in 6253ecf2, through 22:43 PDT; the supplied continuation path is absent, with continuation-era text in the available session. Current rulings and queue answers prevail. Existing execution ownership retained; Codex curates this note. Reported product receipts were not rerun here. Wiped briefs are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:44 PDT

**What:** Stop abandoned compute while preserving its disks and data.

**Why:** End unused compute spending without losing user records.

**Current state:** The surviving stop report and 21:35 lead update verify eight old VMs stopped with disks retained. The sandbox Kubernetes pool is scaling to zero; two nodes were still shutting down. A fresh old-Postgres backup succeeded. No zero-node completion receipt is available.

**Next step:** Verify the remaining nodes reach zero; retain disks, buckets, snapshots and database. Keep later deletion separate and gated on data preservation.

**Open questions for Will:** None newly required.

Evidence: script-filtered recent human text and lead replies through 21:43 PDT in session 6253ecf2, current rulings and queue answers; surviving reports where cited. The supplied continuation path is absent; post-reboot replies are in the available transcript. Product results are reported receipts, not rerun here. Existing execution owner retained; Codex curates documentation. Wiped scratch files are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:16 PDT

**What:** Stop authorized abandoned compute while preserving disks.

**Why:** End unused compute spending without losing user data.

**Current state:** The initial stop failed against the wrong project identifier. At 21:15 the lead reports a retry against the corrected project and a planned old-Postgres backup. No successful stop or backup receipt exists. Will approved stopping at 21:05.

**Next step:** Verify the retry and final instance/node states. Preserve data stores and collect a backup receipt before claiming success.

**Open questions for Will:** None; execution and verification remain with operations.

Evidence: script-filtered human messages and lead text replies, 19:15–21:15 PDT in session 6253ecf2; current rulings, queue answers and surviving briefs/reports. The supplied continuation file was not found; continuation-era lead replies are present in 6253ecf2. Product receipts are reported evidence, not rerun here. Existing execution ownership retained; Codex curates documentation. Reboot-wiped scratch files are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:10 PDT

**What:** Stop the 11 abandoned machines without deleting disks; inventory data before later deletion.

**Why:** Stop unused compute spending while preserving user data.

**Current state:** Will approves stopping at 21:05. The stop report says no resources changed: one account cannot access the project and the other cannot refresh authentication. Final machine states remain unknown. The lead launches a separate read-only data inventory and requires data export before any deletion.

**Next step:** Operations owner restores project access, executes the authorized stop and verifies states; retain disks and complete the private data inventory.

**Open questions for Will:** No policy question remains; operations access is the blocker.

Evidence: script-filtered user text and lead replies, 19:06–21:06 PDT; current rulings and queue answers through 21:06; surviving briefs and reports. Product results are reported receipts, not rerun here. Implementation ownership retained; Codex curates documentation. Wiped scratch files are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 11:54 PDT

**What:** Inventory and retire abandoned Google Cloud compute only after the existing decision.

**Why:** ARCH-1 abandoned Google Cloud; unused machines still incur costs.

**Current state:** The read-only audit reports 11 running machines and no current dependencies; no stop or deletion occurred. The lead estimates about $2,000/month at list price. At 11:48 the same stop decision is in the queue at priority 960 and on Telegram; whichever Will answers first settles it.

**Next step:** Record the answer once, remove the duplicate request, then have the operations owner execute only the authorized action and verify inventory privately.

**Open questions for Will:** Queue item 960: stop all 11 while retaining disks, then delete in a week? Recommended yes at 90%; no answer is recorded.

Evidence: script-filtered user text and lead replies from session 6253ecf2, approximately 09:54–11:54 PDT; current rulings and queue answers take precedence over historical briefs, decisions, proposals, TODOs and rules. Product results are lead-reported; this tracker validates the site build only. Existing implementation ownership is retained; Codex curates documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 11:44 PDT

**What:** Inventory abandoned Google Cloud compute and obtain a decision on its retirement.

**Why:** ARCH-1 abandoned Google Cloud; remaining machines continue to incur costs.

**Current state:** At 11:43 the read-only audit is complete: 11 machines are reported running, covering six former lane machines, three Plue cluster nodes, its gateway and SSH bridge. The lead estimates roughly $2,000/month at list price and reports no current workload depends on them. Four lane machines are labelled for deletion after October 23. Nothing has been stopped or deleted.

**Next step:** Wait for the existing Telegram decision, then have the operations owner execute only the authorized retirement and verify the resulting inventory. Keep deployment identifiers and operations details private.

**Open questions for Will:** Stop all 11 now while retaining disks, then delete in a week? Lead recommends yes at 90% confidence; no answer is reported.

Evidence: lead text replies at 11:42–11:43 PDT in session 6253ecf2, extracted by script from the latest two hours with automated notifications and tools excluded. Current rulings and queue answers govern. Codex curates documentation; implementation ownership is retained. Product receipts are reported evidence; this refresh validates the site build only.

## Earlier tracker history (retained)

**What:** Check whether the two old Google Cloud VMs scheduled for deletion today still exist.

**Why:** Google Cloud is abandoned under ARCH-1; the lead requested an accurate inventory of remaining machines.

**Current state:** At 11:39 PDT the lead reports the Codex Sol ops job performing this read-only check. It reports only and deletes nothing. No inventory result is available.

**Next step:** Record the existence/status result privately and route any remaining cleanup through the existing operations owner. This audit does not authorize deletion.

**Open questions for Will:** None until the audit produces evidence requiring a decision.

History: Added by Codex tracker curator from the lead's 2026-10-21 11:39 PDT text reply, script-extracted from session 6253ecf2. Current rulings and queue answers govern; no cloud operation was run by this tracker.
