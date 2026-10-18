---
title: ChatApi hardening from the reviews
status: done
area: app
owner: server hardening agent
updated: 2026-10-19
links: [../features/chat.md, ../observability.md, ../infrastructure.md]
---

## What

Fixes from the final Codex and Fable reviews on the server side:
- the global ask lock removed, with a test that fails on the old lock;
- the telemetry relay bounded to 128 KiB and 200 records per export, with an allowlist of record names and no exception text;
- test databases refused unless they are the local compose one, one schema per test file;
- a missing Postgres or Electric fails loudly instead of skipping.

## Why

Will: "Note this is our final draft of this code so I expect absolute perfection wrt test coverage everything".

## State

- 114 tests passed over 6 runs; 100% coverage outside the files the durable-answering cutover replaces.
- Uncommitted. Hand-offs (vitest coverage config, test-database helper, three record fixes) are on the lead's integration list.
- Finding: Electric logs the whole `text` column on every append, so write frequency is the lever. The answer flow batches writes at 1 s.

## Next

Integrate the hand-offs during the [durable answering](durable-answering.md) cutover.

## Questions for Will

None.
