# State: one framework-free state machine, many frontends

The app's state and behavior live in a state machine that knows nothing about React or the DOM. The web app is one frontend for it; the TUI and other frontends will reuse it later (Will, 2026-10-19). Shared state lives in Postgres and reaches every device through Electric into TanStack DB collections; one tab's own state lives in local-only TanStack DB collections ([decision 0001](decisions/0001-electric-postgres-tanstack-db.md)).

## Rules

1. **The state machine is plain TypeScript on Effect and TanStack DB.**
   - Its collections, queries, actions and background programs import no React, no DOM, no router and no UI library.
   - They reach TanStack DB and Electric only through `src/lib/collections.ts`, never the libraries themselves.
2. **Every library API is used through an Effect wrapper** (`src/lib/collections.ts`):
   - creating a collection is scoped, and its scope closing cleans it up (`localOnly`, `electric`, `liveQuery`);
   - reads are Effects (`toArray`, `get`, `status`, `getWindow`, `preload`), and a change subscription is a scoped Stream (`changes`);
   - mutations are Effects that apply at once and return the TanStack DB transaction (`insert`, `update`, `remove`); `settled` waits for one;
   - moving a live query's window (`setWindow`) is an Effect that moves it at once and succeeds once the rows it needs have loaded;
   - Electric's `awaitMatch` is an Effect with a timeout;
   - a mutation handler, such as the `onInsert` that asks ChatApi, and a shape's error handler and request reports are Effects;
   - `electric` owns the shape's retries: a request that fails on the network or with 5xx waits out a backoff and retries forever, and its `reconnect` Effect ends every wait at once. `syncMode: "on-demand"` loads only what live queries ask for.
   - `electric` keeps the shape's offset when a later subset snapshot arrives. `@electric-sql/client` 1.5.28 moves it to the snapshot's, which drops changes the live stream hasn't delivered yet to rows outside that snapshot, such as an answer streaming while earlier messages load. A test in `collections.test.ts` reproduces it; drop the workaround once Electric fixes it.

   Query expressions (`eq`, `lt`, `caseWhen`, …), Electric's `snakeCamelMapper` and `isChangeMessage` are pure, re-exported there unwrapped.
3. **Frontends only adapt.** A frontend reads the machine's live queries through its own binding (React: `@tanstack/react-db`'s `useLiveQuery` and `useLiveSuspenseQuery`; a TUI: `Collections.changes`) and runs actions on input. It holds no state of its own: no `useState`, and no `useEffect` for state.
4. **One Effect boundary.** The program's one runtime is a `ManagedRuntime` built once (`makeRuntime` in `src/lib/runtime.ts`). Effects run only on it:
   - `main.tsx` builds it from `appLayer` (`src/boot.ts`) and starts the boot program with `runFork`. Nothing else in `main.tsx`, or anywhere in the app, starts an Effect.
   - **Actions are Effects that finish synchronously.** A frontend runs them with the runtime's `runSync` (React: `useApp().run`), so an action's writes show before its event handler returns. An action that starts slow work leaves it to a library callback or forks it into the store's scope.
   - **Library callbacks run on the same runtime through `Boundary`:** `runPromise` where a library wants a Promise (a TanStack DB `onInsert`, Electric's `onError` and `fetchClient`), `runSync` where a DOM listener must finish in the event (⌘K's `preventDefault`, `online`). The layer that registers a callback gives its Effect the services it needs.
   - No module calls `Effect.runPromise`, `runSync` or `runFork` itself. Tests are their own boundary and build their own runtime with `makeRuntime`.
5. **Dependencies are layers or arguments.** ChatApi's origin, `fetch`, the HTTP client, telemetry, deadlines, backoff, page size and the event target for keys and `online` come from `appLayer`'s options, layers or the boot program's arguments, so a test or another frontend supplies its own.
6. **Order comes from Postgres, never a clock.** The conversation sorts by `messages.position`. A row this tab inserted sorts after every synced row, in the order asked, until Electric delivers its real position. `createdAt` is display and diagnostics only.
7. **Testable without a frontend.** Every wrapper, action, query and background program has a unit test in Node (`pnpm test`): local-only collections in memory, and Electric collections against the compose Postgres and Electric (`pnpm db:up`) and ChatApi's real handler, never a fake of them. The only scripted pieces are the model and faults on the network.

## Layout

```
src/lib/
  collections.ts   Effect wrappers for TanStack DB and Electric                 framework-free
  runtime.ts       Boundary and makeRuntime: the one runtime and its callbacks   framework-free
src/features/<feature>/
  schema.ts        row types (Effect Schema for Postgres rows), constants       framework-free
  store.ts         the feature's collections and queries as a service and layer
  queries.ts       live queries: what frontends read
  actions.ts       what a person does: Effects that finish synchronously
  api.ts           ChatApi calls (Effect HttpClient)
  shortcuts.ts     key bindings, as a scoped Effect over an EventTarget
  reconnect.ts     syncs again when the browser comes back online, as a scoped Effect over an EventTarget
  metrics.ts       the feature's usage metrics (Effect Metric)
  *.test.ts        unit tests, Node
  components/      React views: live queries to read, useApp().run(action) to write   web only
src/screens/       one folder per route; AppScreen picks the lost-connection view or the shell   web only
src/boot.ts        appLayer (the browser's services) and the boot program           web only
src/AppContext.tsx the store and `run` for React components                          web only
src/main.tsx       the boundary: builds the runtime, runs boot, renders              web only
src/test/          ChatApi's real handler on a scratch schema, a scripted model, and network seams
```

When a second frontend (the TUI) starts using a feature's machine, the framework-free files move into a shared package, for example `packages/smithers/state`. Until then they stay here, so there's one copy and no premature abstraction.

## Chat (2026-10-19)

`src/features/chat/` follows every rule above.

| Piece | What it is |
|---|---|
| `ChatStore` | `messages` (Electric, on demand), and this tab's `composer`, `asks` (answers it asked for), `failures` (questions ChatApi didn't take), `sync` (sync health) and `history` (the window), all local-only; plus the queries |
| `recent` | the most recent `pageSize` (50) messages Postgres has, newest first: the window, and all Electric sends of the past. Rows this tab inserted stay out of it until Postgres positions them, so asking or a rollback never reloads the window |
| `pending` | the rows this tab inserted that Postgres hasn't stored yet |
| `conversation` | `recent` then `pending`, ordered by `position`, with this tab's failed questions where they were shown; a failed answer reads the failure copy |
| `composerState` | this tab's composer: open, and the draft |
| `waiting` | an answer this tab asked for that is still streaming, if any |
| `syncState` | sync health: `syncing`, `ready`, or `failed` with `reason` (`unreachable`, `refused`, `invalid_response`) and `httpStatus` |
| `historyState` | `opened` (the first page loaded), `limit`, `earlier` (the window is full, so there may be more) and `loading` |
| `ask(text)` | trims and checks 1 to 8,000 characters (else `{ asked: false }`, draft kept), inserts the question and an empty streaming answer, clears the draft |
| `loadEarlier` | widens the window by a page at once; `loading` until the rows arrive. Nothing while loading or when nothing is earlier |
| `retrySync(via)` | retries every waiting shape request now; a failed sync turns `syncing`, with 10 s to succeed, and a shape Electric gave up on restarts. `via` is `button` or `online` |
| `openComposer(via)`, `closeComposer`, `toggleComposer(via)`, `setDraft(text)` | the composer; `via` is `shortcut` or `button` |
| `chatShortcuts(target)` | ⌘K (Ctrl+K) toggles, Esc hides, while its scope is open |
| `reconnectOnline(target)` | `online` runs `retrySync("online")`, while its scope is open |

Asking, in order:
1. `ask` inserts both rows into `messages`. They show at once (`pending`), `waiting` turns true, and the draft clears.
2. TanStack DB calls `messages`' `onInsert` (`store.ts`) on the runtime. It posts `POST /api/questions` under one 15 s deadline that covers reading the body, then waits up to 15 s until Electric delivers both rows (`awaitMatch` on their ids), so TanStack DB swaps the optimistic rows for Postgres' own. A 200 (the question was already there, a retry) waits the same way: its rows may not have arrived yet.
3. If ChatApi doesn't take the question (no whole answer in time, or any status but 200 and 202, 409 included), or Electric doesn't deliver it, `onInsert` fails and TanStack DB rolls both rows back. In the same step `failures` keeps the question and a failed answer after the last synced row, so the conversation shows the question and "Smithers couldn't answer. Try again." where they were. If the question reached Postgres after all, its synced rows replace the failure.

Sync health, in `store.ts`:
- `syncing` until a shape request succeeds, then `ready`.
- A request that fails on the network or with 5xx while `ready` makes it `syncing` and starts a 10 s deadline (`openWithin`); so does opening. Past it, sync is `failed` (`unreachable`) if requests are failing, or one was sent and none ever succeeded. A request in flight may be a long poll that reached Electric, so it has until it settles; a tab opened hidden, whose shape Electric pauses, has sent nothing and hasn't failed. Requests keep retrying (1 s, doubling to 10 s); the first to succeed makes sync `ready` again.
- Electric giving up on the shape (a 4xx, or a response it couldn't read) makes it `failed` (`refused`, `invalid_response`), and the shape waits for `retrySync`, then restarts from where it stopped.
- The web app shows "Smithers lost its connection." with Try again: alone (`AppScreen`) when the conversation never opened, else above it (`SyncAlert`).

History: `recent` starts at 50. While it is full, `earlier` is true and the conversation heads it with Load earlier. `loadEarlier` moves the window (`setWindow`), and Electric sends the next page through ChatApi's shape proxy (`subset__*`); if it can't, the window stays and Load earlier applies again.

Tests: `src/lib/collections.test.ts` (the wrappers, on-demand windows, retries, `reconnect`, the offset workaround), `src/features/chat/chat.test.ts` (the machine, two tabs, failures, retries and 409, the body deadline, sync health, history, shortcuts and telemetry), `src/features/chat/api.test.ts` (`POST /api/questions` against a local HTTP server, a stalled body included), `src/boot.test.ts` (the boot program and page errors). The chat and boot tests run ChatApi's real handler (`src/test/chatApi.ts`) with a scripted model.
