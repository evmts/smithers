# 0091 — Current item access wins over cached issue and pull content

2026-10-23. Production bug bash follow-up to GH-4 and decision 0079.

The issue and pull detail pages may hold a previously synced item on the
device after their shape receives a current `401` or `403`. Either the issue or
pull shape may refuse a pull request separately. The refusal takes
priority over that cached item: show Sign in for `401`, or Not found for `403`.
An access state that is still unknown does not erase an item already on this
device, preserving the local-first offline view until an authoritative refusal
arrives. A successful shape read uses the item as before.

This is a view decision shared by the issue and pull screens. The source
regression covers both refusals with a cached item. Live revocation and
sign-out acceptance still need production testing.

Review addendum, 2026-10-23: a successful HTTP batch grants access before
Electric installs every item row. On a cold device, an absent direct issue or
pull stays Loading until its accepted network batch is installed and its
repository sync query is ready. A restored local snapshot or an eager query's
readiness alone does not certify the new batch.
Only then may the page show the GitHub fallback or, after a complete repository
sync, Not found.
