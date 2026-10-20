# apps/mvp

The Smithers app, rebuilt from scratch one reviewed feature at a time (Will, 2026-10-19). It is the base every later feature builds on, so each feature lands with its architecture, tests, observability, benchmarks and docs, never "later".

## Use the Smithers SDK; extend it, never hand-roll

- When the app needs something a Smithers package should provide, add it to that package with tests and docs, then use it here. We maintain the SDK. A local copy in the app is tech debt.
- Examples: model calls and streaming (`@smthrs/model`); the configured model as a service (`HostModel` in `@smthrs/model-host`); UI components (`@smthrs/ui`).
- Read [docs/libraries.md](../../docs/libraries.md) before writing app code.
- Import packages from their root only.

## Durable flows

Every action, every model call included, is a durable Smithers flow step; see the root [AGENTS.md](../../AGENTS.md#everything-is-a-durable-flow-will-2026-10-19-permanent). The app writes no retry loops, background jobs or sweeps of its own.

## Effect

- Run an Effect only at the program's boundary. In the browser that is `start` (`src/boot.ts`), which `main.tsx` calls once; a callback a layer registers runs with the services captured there (`Effect.runPromiseWith`, `Effect.runSyncWith`). On the backend, Alchemy's Effect-native Workers run the handlers, so the app never calls `runPromise`, `runFork` or `runSync` there.
- Use every library through Effect: a library's own Effect API when it has one (Effect `HttpClient`, `Config`, `@effect/sql-pg`), else an SDK wrapper: TanStack DB through `@smthrs/effect-tanstack-db`, Electric through `@smthrs/effect-electric`. App code calls the wrappers, never the raw library.
- Choices such as the model are services provided by layers, never constants in a handler.

## State (flux)

Read [docs/state.md](docs/state.md) first: the state machine is framework-free TypeScript that the web app, and later the TUI, adapt to.

- Route state lives in the URL, through TanStack Router (`src/router.tsx`). Never hand-roll routing.
- Shared state lives in Postgres. Electric syncs it into TanStack DB collections that the device keeps (SQLite on OPFS), and every write goes through a durable outbox to ChatApi (decision 0002). One tab's UI state lives in local-only TanStack DB collections. Components read through live queries and write through actions. See [docs/decisions/0001-electric-postgres-tanstack-db.md](docs/decisions/0001-electric-postgres-tanstack-db.md).
- No `useState`: even UI state, such as whether the composer is open or its draft, is a local-only collection.
- No `useEffect` for data or state syncing.
- A feature's logic and its React views share its folder, never a file: no `.tsx` file imports `effect` or our Effect libraries, and no logic file imports `react` or `@tanstack/react-db`.

## Structure

- `src/screens/<screen>/`: one folder per route screen. It composes feature components; its stylesheet holds page layout only.
- `src/features/<feature>/`: one folder per feature, laid out as in [docs/state.md](docs/state.md).
- `worker/`: Cloudflare Workers, deployed and run locally by Alchemy (`alchemy.run.ts`). No Wrangler config.
  - `ChatApi.ts` is Effect-native: it stores questions in Postgres, proxies Electric shapes, serves the metered model endpoint (`POST /api/model/<role>`, [docs/features/model-endpoint.md](docs/features/model-endpoint.md)) and the answer routes the browser's agent answers through ([docs/features/agent.md](docs/features/agent.md)), starts remote flows (`POST /api/flows/<name>`), and routes repositories to `RepoApi.ts` (cloning and reading at a commit, [docs/features/repo.md](docs/features/repo.md)). It never answers a question itself.
  - `SignIn.ts` is sign-in: the GitHub App's routes under `/api/auth/*` and the `Sessions` layer every route reads who is asking from ([docs/features/sign-in.md](docs/features/sign-in.md)).
  - `DevChatApi.ts` is ChatApi under `alchemy dev`, with real sign-in when the GitHub App is configured and a local developer signed in otherwise; a deploy never bundles it.
  - `index.ts` forwards `/api/*` and serves the app.
  - `Executions.ts` (the Alchemy Durable Object) and `ExecutionHost.ts` run remote flows, one Durable Object per execution; `flows/` holds those flows, which never import Cloudflare ([docs/features/remote-flows.md](docs/features/remote-flows.md)).
- `db/`: the Postgres schema as Effect SQL migrations (`db/migrations`, `pnpm db:migrate`) and the client layer ChatApi, the migrations and the tests share. `docker-compose.yml` runs Postgres and Electric locally (`pnpm db:up`). Infrastructure: [docs/infrastructure.md](docs/infrastructure.md).
- Configurable values (model, API URL, keys) come from the environment through Effect `Config`, named for what they are, not for one vendor.
- Components, colors and the theme come from `@smthrs/ui` (`packages/smithers/ui`). A reusable piece the app needs goes into that library, with its test and docs, not into this app.
- `src/styles/fonts.css`: loads the Inter files the theme names.

## Tests, observability, performance

- **Unit (`pnpm test`):** every action, query, wrapper and handler, in Node. ChatApi's handlers run against the real compose Postgres; the model is the only scripted seam.
- **End to end (`pnpm e2e`):**
  - A feature works only if a real test passes against it: no route mocks or fake backends.
  - Cover multiple devices, offline use and reloads, because the app is local-first.
  - Each test records video, so every flow has a GIF, and saves the browser's console on failure.
- **Observability:** every feature logs, traces and counts what it does, front end and back end, with tests and docs. Logs never carry message content or credentials.
- **Benchmarks (`pnpm bench`):** run locally and against a live deployment, compared with a baseline.
