# apps/mvp

The Smithers app, rebuilt from scratch one reviewed feature at a time (Will, 2026-10-19).

## State (flux)

Read [docs/state.md](docs/state.md) first: the state machine is framework-free TypeScript that the web app, and later the TUI, adapt to.

- Route state lives in the URL, through TanStack Router (`src/router.tsx`). Never hand-roll routing.
- All other state lives in TanStack DB collections. Components read through live queries and write through collection actions.
- No `useState`: even UI state, such as whether the composer is open or its draft, is a collection row.
- No `useEffect` for data or state syncing.

## Structure

- `src/screens/<screen>/`: one folder per route screen. It composes feature components; its stylesheet holds page layout only.
- `src/features/<feature>/`: one folder per feature, split the same way every time:
  - `collections.ts`: the feature's TanStack DB collections (its state).
  - `actions.ts`: every write to that state.
  - `queries.ts`: every read, as live-query hooks.
  - `api.ts`: network calls, with no state.
  - `components/`: views that read through queries and write through actions.
- Components, colors and the theme come from `@smthrs/ui` (`packages/smithers/ui`). A reusable piece the app needs goes into that library, with its test and docs, not into this app.
- `src/styles/fonts.css`: loads the Inter files the theme names.

## Tests

A feature works only if a real end-to-end test passes against it: no route mocks or fake backends. Each test records video, so every flow has a GIF.
