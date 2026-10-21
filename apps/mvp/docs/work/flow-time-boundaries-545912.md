---
title: Flow retry and timeout numeric boundaries
status: blocked
area: flow
owner: codex-545912
updated: 2026-10-21
links:
  - packages/smithers/flows/flow/CHANGELOG.md
---

Four confirmed regressions: accepted shrinking factors stop early; malformed
elapsed readings claim expiry; out-of-range Date formatting masks deadline
expiry; human-task absolute timeout overflow defects instead of refusing the
request. Regression tests failed on Latitude before the fixes. Post-fix package
validation is blocked: both Latitude hosts timed out on SSH before upload.
Focused pre-fix run: 4 failures, 118 passes; corrected overflow case: 1 failure,
60 passes, with the expected DurableClock RangeError. No post-fix pass claimed.
