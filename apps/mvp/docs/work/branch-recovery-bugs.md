---
title: Branch tracking and checkpoint recovery bugs
status: blocked
area: branches
owner: codex
updated: 2026-10-21
links: []
---

Four corrections: refuse tracking when the default branch cannot be determined,
reuse the create request's successful lookup, preserve files on unresolved HEAD,
and reclaim interrupted checkpoint pieces while retaining quarantined checkpoints.
Uses the existing Effect services and @smthrs/sandbox catalog entry; no new library.
Existing branch and checkpoint metrics, spans and logs remain the observation boundary.

Latitude regression run: 39 passed, 5 failed, including the four expected bug
assertions and one invalid expectation subsequently removed: permanent restore
failures already quarantine their checkpoints, preserving them across later saves.
The checkpoint retry assertion now names sequence 3, consistent with the existing
monotonic sequence allocator. The regression originally observed surplus sequence-2
pieces alongside sequence 3.

Validation is blocked: nyc-02 disconnected during the baseline suite, then both
Latitude hosts timed out on SSH; the mini hostname did not resolve. The post-change
run could not upload its service helper. Passing tests and a complete suite comparison
are still required. No passing validation is claimed.

The concurrent deletion and missing-piece findings were not exercised: their
regression runs failed during integration setup or could not reach the farm.
