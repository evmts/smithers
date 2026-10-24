# 0089 — Wait for the device's pull list

2026-10-23. Repairs the existing pull-list rendering and mobile sweep; no new
feature, dependency, persisted schema or public API.

GitHub's completed walk and the browser's completed Electric snapshot are
separate receipts. Production 98bd3487's signed-out tablet failure received
pull metadata and GitHub sync rows, but its shared items shape's 3,845-row
batch had no `up-to-date` control in the supplied diagnostics. The pull list
joins items, not just pull metadata. Those receipts do not establish dropped
rows or a completed device snapshot.

Use the live list query's `isReady` along with the repository sync receipt
before showing an empty pull list. Existing rows remain usable and refusals
still show immediately. The mobile detail case waits for the actual list's
busy state to settle, then still requires a real detail link. No layout
assertion, access rule or empty-list prerequisite changes.

Issue TODO links and TODO Watch links use the existing `@smthrs/ui`
`ItemAsideSection`. Its links get 32px minimum targets through 960px, retaining
wrapping and desktop geometry. Local Chromium regressions fail first on the
captured 18px targets and on a false empty pull list.

The mobile TODO fixture owns cleanup from before its Commit press. Fixture
teardown has its own timeout and runs in `finally`, including after a test
failure or timeout. It recovers the TODO from the real shape by its unique
title, drops it through the stack API, confirms Dropped, and requires an
existing run to be terminal. A launch or drop acknowledgment alone cannot
count as cancellation. Completed or failed runs have already stopped.
