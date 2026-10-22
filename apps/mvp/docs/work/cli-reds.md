---
title: Burn down CLI and runtime reds
status: in-progress
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
