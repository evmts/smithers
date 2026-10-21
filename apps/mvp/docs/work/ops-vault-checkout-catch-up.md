---
title: Safely catch up the shared ops vault checkout
status: todo
area: process
owner: lead; catch-up owner not reported
updated: 2026-10-20
links: [ops-vault-history-repair.md, ops-vault-skill-audit.md, ../rulings.md]
---

## What

Reconcile the shared ops checkout with the pushed vault history while preserving its local work.

## Why

The isolated merge landed without touching the shared checkout; new commits from that stale checkout risk conflicts or lost work.

## Current state

At 16:01:33 PDT the lead reported the shared checkout 3,114 commits behind with 1,233 uncommitted files. No catch-up receipt is reported. These counts are reported evidence, not a fresh filesystem check.

## Next step

Inventory and preserve local edits, reconcile with jj in isolation, verify retained work and only then allow commits from the shared checkout.

## Open questions for Will

None; settle preservation and reconciliation details from evidence.

## History

2026-10-20 16:04 PDT: added from the lead’s text replies in the last two hours of session 6253ecf2, extracted by script; current rulings take precedence. No operational action or product test was run by this tracker.
