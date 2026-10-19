# State: one framework-free state machine, many frontends

The app's state and behavior live in a state machine that knows nothing about React or the DOM. The web app is one frontend for it. The TUI and other frontends will reuse it later (Will, 2026-10-19).

## Rules

1. **The state machine is plain TypeScript.** Collections (state), actions (writes) and selectors (reads) import no React, no DOM, no router and no UI library. They import TanStack DB's core (`@tanstack/db`), never its React adapter (`@tanstack/react-db`).
2. **Frontends only adapt.** A frontend renders state through its own binding (React live-query hooks in the web app, an Ink or terminal binding in the TUI) and calls actions on input. It holds no state the machine doesn't own, and no behavior beyond wiring input to actions.
3. **Effects enter as dependencies.** Network calls, clocks, IDs and key bindings are passed in, so a test or a different frontend can supply its own. The browser's `fetch` and `window` are the web app's choice, not the machine's.
4. **Testable without a frontend.** Every action and selector has a test that runs under a plain test runner (`bun test`), with no browser and no React: dispatch actions, then assert on collection contents.
5. **The app works without the machine's internals.** Views depend only on the machine's public surface (state shapes, actions, selectors), so either side can change its internals without touching the other.

## Layout

```
src/features/<feature>/
  collections.ts   state           framework-free
  actions.ts       writes          framework-free
  selectors.ts     reads           framework-free
  api.ts           network calls   framework-free, injected into actions
  react.ts         live-query hooks over the selectors   (web only)
  components/      React views                           (web only)
```

When a second frontend (the TUI) starts using a feature's machine, the framework-free files move into a shared package, for example `packages/smithers/state`. Until then they stay here, so there's only one copy and no premature abstraction.

## Today (2026-10-19)

The chat feature (`src/features/chat/`) is close, but not there yet:

- **Collections:** `collections.ts` imports `createCollection` from `@tanstack/react-db`; it should import from `@tanstack/db`.
- **Reads:** `queries.ts` mixes the selectors with React hooks; split it into `selectors.ts` and `react.ts`.
- **Effects:** `actions.ts` calls `fetch` through `api.ts`, and `shortcuts.ts` binds `window` directly; both should be injected.
- **Tests:** there are no `bun test` tests of the actions yet. Today only the browser end-to-end tests cover chat.
