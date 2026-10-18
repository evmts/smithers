---
title: Stack switch to Postgres, Electric and TanStack DB
status: done
area: app
owner: lead (smithers-b3), with backend, client and e2e agents
updated: 2026-10-19
links: [../decisions/0001-electric-postgres-tanstack-db.md, ../features/chat.md, ../infrastructure.md, ../state.md]
---

## What

Chat state lives in Postgres. Electric syncs it to every device, TanStack DB holds it in the browser, and ChatApi, an Effect-native Cloudflare Worker, takes writes. LiveStore is gone.

## Why

Will, after LiveStore hung `/app` with no error: "Ok let's kill livestore hard to debug for an agent is unacceptable." Then: "Switch to using electric sql with a postgres db please ... we should go back to tanstack db." All other requirements stood: "we are simply changing tech stack".

## State

- Committed locally as `352e0b2a78` (refactor), `8584fadb21` (e2e) and `f56f9ae7f1` (bench). Not pushed.
- 19 of 19 e2e tests and 119 unit tests passed on 2026-10-19; two browser tabs sync.
- Answering still runs on `waitUntil` plus a sweep. [Durable answering](durable-answering.md) replaces it.

## Next

None for the switch itself. Follow-ups: [local-first](local-first.md), [infrastructure as code](infrastructure-as-code.md).

## Questions for Will

None.
