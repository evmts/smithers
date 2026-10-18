# 0001: Postgres, Electric and TanStack DB replace LiveStore

Status: accepted (Will, 2026-10-19). Superseded by [0002](0002-local-first.md) for writes and the device store: "Writes need the network" no longer holds; every read comes from the device and every write goes through a durable outbox. The rest stands.

## Decision

Chat state lives in Postgres:
- Electric syncs it to every device as shapes.
- TanStack DB holds it in the browser as collections, with optimistic writes.
- Writes go through ChatApi, an Effect-native Cloudflare Worker, which answers questions in the background on the server.

Every library API the app touches is wrapped in Effect first. The state machine stays framework-free, so React and any later client only adapt to it.

## Why

LiveStore 0.5 was not ready for this app. In one session it:
- shut down a store and stalled its web worker with no error, only a debug log;
- hid its worker's failures from the page console;
- rebuilt state from the whole event log on load.

An agent could not debug it from its records, and Will ruled that unacceptable. Electric is plain HTTP: every sync request can be read, replayed and curled. Will has used Electric before.

The server now owns answering. When a tab closed mid-answer, the answer used to stay stuck, and two tabs could answer one question twice.

## Consequences

- **Postgres and Electric run beside the app:**
  - locally through `docker-compose.yml`;
  - in production as managed services, Postgres reached through Cloudflare Hyperdrive.
- **Writes need the network.** A question asked offline shows optimistically, then rolls back with a failure if ChatApi can't be reached. Nothing in the spec requires offline asking.
- **Order comes from Postgres** (`messages.position`, an identity column), never from a device's clock.
- **The old pieces are gone:** LiveStore, its sync Durable Object and the browser-side answerer.
