---
title: Size limit for the on-device conversation
status: todo
area: app
owner: unassigned
updated: 2026-10-19
links: [../todo.md, ../decisions/0002-local-first.md]
---

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
