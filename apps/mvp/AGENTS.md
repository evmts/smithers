# apps/mvp

The Smithers app, rebuilt from scratch one reviewed feature at a time (Will, 2026-10-19).

## State (flux)

- Route state lives in the URL, through TanStack Router (`src/router.tsx`). Never hand-roll routing.
- All other state lives in TanStack DB collections. Components read through live queries and write through collection actions.
- Component-local state (`useState`) is only for UI mechanics, such as whether a menu is open.
- No `useEffect` for data or state syncing.

## Structure

- `src/screens/<screen>/`: one folder per route screen. Its stylesheet holds page layout only.
- Components, colors and the theme come from `@smthrs/ui` (`packages/smithers/ui`). A reusable piece the app needs goes into that library, with its test and docs, not into this app.
- `src/styles/fonts.css`: loads the Inter files the theme names.

## Tests

A feature works only if a real end-to-end test passes against it: no route mocks or fake backends. Each test records video, so every flow has a GIF.
