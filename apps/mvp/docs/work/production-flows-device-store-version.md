---
title: Version production flows repository storage
status: in-progress
area: app
owner: Codex production-flows store finisher; Codex tracker owns note
updated: 2026-10-21 23:44 PDT
links: [device-data-migrations.md, ../decisions/0021-local-first-migrations.md, repo-view-branches-raw-clone.md]
---

## Tracker reconciliation — 2026-10-21 23:44 PDT

**What:** Version the synced repository cache safely.

**Why:** Deployments must respect persisted schema history.

**Current state:** The lead corrected the brief at 23:37: decision 0021 requires synced rows to be dropped and resynced, not migrated. The surviving finisher report now lists six commits ending 8d811f68cbfa, repository cache v4, preserved v3 history and unchanged deployed fixture. Latitude schema/migration/repository tests pass (136 tests, 11 files), as does app typecheck; final combined rerun remains pending. No push receipt.

**Next step:** Finish the combined rerun, deliver the six-commit stack to the lander, then deploy and verify resync.

**Open questions for Will:** None; the existing synced-store ruling resolves the question.

Evidence: recent user-typed text and lead replies extracted by script from the last two transcript hours; surviving final briefs/reports, rulings and queue answers. The named continuation file is absent; continuation-era replies are present in the original transcript. Reboot-wiped files are not missing work. Implementation ownership is retained; Codex maintains this note. Product checks above are reported receipts.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 23:35 PDT

**What:** Version the repo-repositories device store changed by production flows.

**Why:** Prevent deployments from silently changing persisted schemas.

**Current state:** At 23:26 the lead holds five production-flows commits because clone requests and refs_changed_at change v3 without a version bump. The surviving 23:33 finisher report is incomplete: 129 baseline tests pass and 4 schema/fixture tests fail; 114 repository tests pass. Decision 0021 requires synced rows to resync, while the brief requests row-preserving migration; the report requests a policy resolution. No version bump or landing receipt exists.

**Next step:** Resolve the brief against decision 0021 using the existing synced-store contract; retain v3 history, bump version and lock, then pass schema, fixture and repository tests before landing.

**Open questions for Will:** Only if preserving synced cache rows is required: should decision 0021 change? Existing resync ruling otherwise applies.

Evidence: script-filtered recent human text and lead replies in session 6253ecf2; surviving briefs/reports, rulings, queue answers and decision 0021. The continuation filename was not found; continuation-era replies survive in the original transcript. Reboot-wiped files are not missing work. Product receipts are reported evidence; tracker validation is the site build.
