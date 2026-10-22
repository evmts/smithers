# Recover the persisted flow during hosted runtime registration

Date: 2026-10-22

A single-execution host knows the flow tag from its persisted intent. Pass
that tag through CloudflareRuntime to the SDK engine's hosted sweep options,
so registering an unrelated flow performs no recovery queries. The handlers
remain registered, and the named flow still recovers clocks and deferred
completions from durable storage on every registration. Generic process hosts
and callers omitting the tag keep their existing behavior.

This fixes a core runtime cost, not a product feature or plugin: each extra
registered flow previously added two recovery reads before runtime readiness.
The real-store 32-flow regression and restart cases live in engine-store's
HostedEngine suite. Runtime lifetime and ownership fencing are unchanged.

Library catalog: @smthrs/platform-cloudflare, @smthrs/engine-store, @smthrs/database.
Production timings require a later authorized deployment; this work is local.
