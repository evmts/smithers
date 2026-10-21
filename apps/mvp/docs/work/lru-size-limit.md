---
title: Size limit for the on-device conversation
status: todo
area: app
owner: unassigned
updated: 2026-10-20 23:44 PDT
links: [../todo.md, ../decisions/0002-local-first.md]
---

## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Bound optional on-device cached data while keeping the required database subset.

**Why:** ARCH-18 requires the native and web local-first data model to sync through the hosted backend.

**Current state:** Will’s 23:27 approval explicitly requires an always-kept database subset plus LRU for other data. The lead says the previously deferred LRU size bound is now required. No implementation receipt; the old statement that persistence does not exist is historical.

**Next step:** Define required versus evictable rows and a configured size bound in the shared storage design. Preserve drafts, pending writes and required records; verify refetch of evicted optional data.

**Open questions for Will:** No new question; choose the bound from measurements and shared storage requirements.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## What

Cap the on-device store. Evict the least recently used conversations or older pages, and fetch them again on demand.

## Why

Will, answering whether each device keeps the whole conversation: "Yes it should be local first but note later we may run into limits with this and require a LRU type setup but that complexity you can just leave as a TODO".

## State

- Listed in `todo.md` with one open box.
- Not started. [Local-first](local-first.md) persistence doesn't exist yet, so there is nothing to cap.
- 23:01: L1 started building that persistence (TanStack DB on OPFS). Its brief repeats that LRU eviction stays a TODO, so this waits for L1 to land.

## Next

Wait for local-first persistence. Then measure browser storage use on a long conversation and pick the cap from the measurement.

## Questions for Will

None until there is a measurement.
