# State: one framework-free state machine, many frontends

The app's state and behavior live in a state machine that knows nothing about React or the DOM. The web app is one frontend for it. The TUI and other frontends will reuse it later (Will, 2026-10-19).

## Rules

1. **The state machine is plain TypeScript on LiveStore and Effect.**
   - The schema (events, tables, materializers), actions (writes), queries (reads) and background programs import no React, no DOM, no router and no UI library.
   - They import `@livestore/livestore`, `@livestore/livestore/effect` and `effect`, never `@livestore/react`.
2. **Frontends only adapt.** A frontend renders state through its own binding (React live-query hooks in the web app, a terminal binding in the TUI) and calls actions on input. It holds no state the machine doesn't own, and no behavior beyond wiring input to actions.
3. **Effect code uses LiveStore's Effect API.**
   - Background programs read and write through the `AppStore` service: `AppStore.query`, `AppStore.commit`, `store.subscribeStream`.
   - `AppStore` (`src/livestore/AppStore.ts`) is platform-neutral, and each host injects the store it opened:
     - The browser injects `appStoreLive` (`src/livestore/store.ts`): the same instance React renders, since a tab holds one store.
     - Tests inject LiveStore's in-memory Node adapter (`src/test/memoryStore.ts`).
4. **One boundary runs Effects.**
   - `main.tsx` runs the browser program (`src/boot.ts`) once, with `Effect.runFork`. No component, action or module runs an Effect.
   - React event handlers call actions, which are synchronous commits.
   - Slow work is a background program that reacts to the store. Answering a question is one: the answerer.
5. **Dependencies are injected.** The HTTP client, the store and the key-binding target come from layers or arguments, so a test or another frontend supplies its own.
6. **Order comes from the event log, never a clock.**
   - The conversation sorts by `position`, which the materializer assigns in event-log order. Every device shares that order, and LiveStore reapplies it on rebase.
   - `createdAt` is display and diagnostics only.
7. **Testable without a frontend.** Every action, query, materializer and background program has a unit test under `vitest` in Node, with real LiveStore in memory and no browser or React (`pnpm test`).

## Layout

```
src/features/<feature>/
  schema.ts        events, tables, materializers       framework-free (LiveStore)
  actions.ts       what a person does: synchronous commits, store passed in
  queries.ts       reads: queryDb definitions
  answerer.ts      a background program (Effect) that reacts to the store
  api.ts           network calls (Effect HttpClient)
  shortcuts.ts     key bindings, as a scoped Effect
  *.test.ts        unit tests, Node + in-memory LiveStore
  components/      React views: store.useQuery to read, actions to write   (web only)
src/livestore/
  AppStore.ts      the store as an Effect service                          (platform-neutral)
  store.ts         the browser's store: OPFS, workers, React registry      (web only)
src/boot.ts        the browser program main.tsx runs                      (web only)
src/test/          test hosts (in-memory store)
```

When a second frontend (the TUI) starts using a feature's machine, the framework-free files move into a shared package, for example `packages/smithers/state`. Until then they stay here, so there's only one copy and no premature abstraction.

## Today (2026-10-19)

Chat (`src/features/chat/`) follows every rule above. `src/features/chat/chat.test.ts` covers:
- asking;
- event-log order;
- deltas, completion and failure;
- the composer;
- the history the model sees.

The answerer's own test lands with the Smithers model transport, which replaces `api.ts`.
