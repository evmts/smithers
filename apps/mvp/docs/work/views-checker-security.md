---
title: Close generated-view checker and prop-copy bypasses
status: blocked
area: views
owner: codex
updated: 2026-10-21
links:
  - packages/smithers/ui/views/docs/security.md
---

Reproduced all five reported findings on Latitude: 11 failing regression cases.
Use the library catalog's generated UI entry, @smthrs/views; no new libraries.
Keep Effect checking and redacted diagnostics. Preserve own keys in null-prototype
records; refuse quoted forbidden keys, top-level await, and indirect Math access.

Latitude receipts: baseline regression run failed 11 cases; initial corrected
full suite passed all 217 tests (16 files), coverage disabled. Final review
excluded computed method names from function scope and expanded boundary cases.
Final coverage/type/lint validation is blocked: nyc-01 reported network unreachable,
nyc-02 timed out, including a retry. No coverage claim. Re-run the final tree
on Latitude before landing.
