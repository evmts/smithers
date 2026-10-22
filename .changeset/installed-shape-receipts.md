---
"@smthrs/effect-tanstack-db": minor
"@smthrs/effect-electric": patch
---

Add Collection.Options.onSyncCommit with a metadata reader after actual installation receipts, including shared-device coordinator hydration. Electric applied events verify the installed resume cursor against the latest accepted response, so watcher source writes and expired-handle resets cannot report false recovery, including empty shapes.

Require both source decoding and actual installation, regardless of arrival order, so a watcher also recovers when its writer installed the matching cursor before its own source healed.

Emit once per accepted response, including when coordinator hydration installs the same cursor again.

Preserve caller cancellation through shape response body reads by combining its signal with Effect interruption, so closing a collection also aborts a long poll after its headers have arrived.

Uses the library catalog's effect-tanstack-db local-state adapter and effect-electric shape-sync entries.
