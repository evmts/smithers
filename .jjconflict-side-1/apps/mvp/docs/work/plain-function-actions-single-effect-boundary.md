---
title: Plain-function actions and one Effect boundary
status: done
area: app
owner: Electric and TanStack DB package agent (Opus); the lead commits
updated: 2026-10-19
links: [../state.md, ../rules.md, ../../AGENTS.md, effect-tanstack-db-and-effect-electric.md]
---

## What

- `main.tsx` calls `start` in `src/boot.ts` once; `start` builds one `ManagedRuntime`, the program's only boundary.
- A callback a library calls (`onInsert`, key listeners) captures `Effect.context()` where it is registered and runs with `runPromiseWith` or `runSyncWith`.
- React gets `{ queries, actions }` through `useChat()`, where actions are plain functions such as `ask(text)`. No `.tsx` file imports `effect`, and no logic file imports React.

## Why

Will: "we should never runPromise or any other way of breaking out of effect and if we do it should only be on the absolute boundary of the program". On the first attempt: "lib/runtime.ts ... feels like it's ... overengineering a solution." And: "reacts hould simply be the view layer on top of what is otherwise purely effect.ts using tanstack db in a flux like pattern".

## State

- Earlier: `src/lib/` (with `Boundary` and `runtime.ts`) was deleted and `AppContext.tsx` provided a `ChatView`.
- 21:23 on 2026-10-19: the agent reported done. Uncommitted.
  - `state.md` rules 4 to 6 describe the result.
  - `telemetry.test.ts` and `boot.test.ts` assert every browser record from parsed OTLP bodies, including `chat.ask` from inside `onInsert` sharing a trace with ChatApi.
  - Its files pass `ImportRules`. The page reload is now a `reload()` action through a `Page` service.
- One `ImportRules` red remains outside it: `worker/ChatApi.ts:54` still uses `waitUntil`, which [durable answering](durable-answering.md) W5 removes.

## Next

The lead commits it with the package work.

## Questions for Will

None.
