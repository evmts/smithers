# apps/mvp

The Smithers app, rebuilt from scratch one reviewed feature at a time (Will, 2026-10-19). It is the base every later feature builds on, so each feature lands with its architecture, tests, observability, benchmarks and docs, never "later".

## Use the Smithers SDK; extend it, never hand-roll

- When the app needs something a Smithers package should provide, add it to that package with tests and docs, then use it here. We maintain the SDK. A local copy in the app is tech debt.
- Examples: model calls and streaming (`@smthrs/model`); the configured model as a service (`HostModel` in `@smthrs/model-host`); UI components (`@smthrs/ui`).
- Read [docs/libraries.md](../../docs/libraries.md) before writing app code.
- Import packages from their root only.

## Effect

- Run an Effect only at the program's boundary. In the browser that is `main.tsx`, once. On the backend, Alchemy's Effect-native Workers run the handlers, so the app never calls `runPromise`, `runFork` or `runSync` there.
- Use a library's Effect API when it has one: LiveStore's `@livestore/livestore/effect`, Effect `HttpClient`, `Config`.
- Choices such as the model are services provided by layers, never constants in a handler.

## State (flux)

Read [docs/state.md](docs/state.md) first: the state machine is framework-free TypeScript that the web app, and later the TUI, adapt to.

- Route state lives in the URL, through TanStack Router (`src/router.tsx`). Never hand-roll routing.
- All other state lives in LiveStore:
  - synced events for shared data;
  - client documents for one tab's UI state.

  Components read through queries and write through actions.
- No `useState`: even UI state, such as whether the composer is open or its draft, is a LiveStore client document.
- No `useEffect` for data or state syncing.

## Structure

- `src/screens/<screen>/`: one folder per route screen. It composes feature components; its stylesheet holds page layout only.
- `src/features/<feature>/`: one folder per feature, laid out as in [docs/state.md](docs/state.md).
- `worker/`: Cloudflare Workers, deployed and run locally by Alchemy (`alchemy.run.ts`). No Wrangler config.
  - `ChatApi.ts` is Effect-native.
  - `index.ts` only wires LiveStore's sync Durable Object and forwards `/api/*`.
- Configurable values (model, API URL, keys) come from the environment through Effect `Config`, named for what they are, not for one vendor.
- Components, colors and the theme come from `@smthrs/ui` (`packages/smithers/ui`). A reusable piece the app needs goes into that library, with its test and docs, not into this app.
- `src/styles/fonts.css`: loads the Inter files the theme names.

## Tests, observability, performance

- **Unit (`pnpm test`):** every action, query, materializer and background program, in Node with real LiveStore in memory.
- **End to end (`pnpm e2e`):**
  - A feature works only if a real test passes against it: no route mocks or fake backends.
  - Cover multiple devices, offline use and reloads, because the app is local-first.
  - Each test records video, so every flow has a GIF, and saves the browser's console on failure.
- **Observability:** every feature logs, traces and counts what it does, front end and back end, with tests and docs. Logs never carry message content or credentials.
- **Benchmarks (`pnpm bench`):** run locally and against a live deployment, compared with a baseline.
