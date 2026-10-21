---
title: Live attention review fixes, Sol slice
status: done
area: notifications
owner: Codex Sol
updated: 2026-10-21
links: [../features/notifications.md]
---

Fix the six findings in SOL-1-BRIEF: transport diagnostics and malformed successful receipts, retryable HTTP statuses, watch launch ownership and recovery, branch detail subscriptions, clone retry outcomes, and the branch toast stack. Preserve the companion builder's files. Use the catalog's Effect HttpClient, @smthrs/flow dispatch, @smthrs/effect-tanstack-db collections and @smthrs/ui ToastStack. Validate on Latitude, commit once with jj, and do not push.

Verified on Latitude: all 77 attention/status tests pass; the six changed logic files have 100% statement, branch, function and line coverage; all four typecheck projects pass. The five isolated store/render regressions fail on the original implementation, as do the transport/retry and clone-admission regressions. The real branch screen renders its synced notice under its header. One local jj commit; no push.
