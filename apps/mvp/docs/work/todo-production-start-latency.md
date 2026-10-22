---
title: Reduce production TODO commit-to-claim latency
status: in-progress
area: runtime
owner: Codex todo-start-latency
updated: 2026-10-22
links: [engine-writer-lock.md, journal-latency.md]
---

Target: commit to claim under 3 seconds and idle lock waits under 500 ms.
Base: 998199dc, production push 22. Work remains local; no push or deployment.

Production alarm records report 101 transactions, three schema-wide transactions,
and 8,217 ms cumulative lock acquisition (including transaction open/network),
not one 8-second lock wait. Runtime registration runs clock and deferred recovery
queries for every registered flow, even on a single-execution host.

Library catalog entries: @smthrs/platform-cloudflare (host), @smthrs/engine-store
(durable recovery), @smthrs/database (Postgres transaction scope and telemetry).
All installs and validation run through lat-run on Latitude.

Focused Latitude matrix: HostedEngine 14/14 on SQLite and 14/14 on Postgres.
The real TCP-delay catalog benchmark (10 ms each direction) records 5,292 ms
for 32 recovery passes and 168 ms for one; SQLite records 7 ms and 2 ms.
The red-first run failed on both backends with 32 recoveries instead of one.
Full coverage gates and production target proof remain outstanding.
