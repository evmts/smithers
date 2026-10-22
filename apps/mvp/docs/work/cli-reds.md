---
title: Burn down CLI and runtime reds
status: blocked
area: sdk
owner: codex-cli-reds
updated: 2026-10-22
links: [../../../../../packages/smithers]
---

Reproduce packages/smithers suite, check and lint on main@origin on Latitude.
Classify environment requirements with evidence, fix each real cause in its own
local jj commit, and retain behavioral tests and thresholds. Never push. No
installs or validation on the MacBook. Use the catalog's existing CLI, runtime
and platform-node libraries; no new runtime or dependencies are planned.

Baseline revision: 9ed661b2. Stop after three hours; classification and final
report live in ~/smithers-builders/cli-reds-CLASSIFY.md and cli-reds-REPORT.md.

Baseline on unchanged main: 5,445 passed /97 failed; check exit2; lint exit1.
Thirty-three local cause commits repair product defects, deliberate fixture
drift and explicit environment requirements. No push. Last completed full
suite: 5,547 passed /2 failed /38 skipped /1 expected failure. Both remaining
failures have passing focused receipts after their fixes. Final affected
suite:99 passed; final contract/projection/replay suite:64 passed, including
real PostgreSQL replay; check and lint both exit0. Astra and Fable final
reviews have no actionable findings. No thresholds lowered or blanket skips.

Blocked on a complete default-coverage package suite on the final source.
Later full attempts were cancelled to fix review findings and are not green
receipts. The three-hour budget does not fit another complete run. Reports
retain the exact classification, ordered local commits and validation logs.
