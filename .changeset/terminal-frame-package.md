---
"@smthrs/terminal-frame": minor
"@smthrs/ui": minor
---

Adds `@smthrs/terminal-frame`, which holds `TerminalFrame` and its generated runtime, imported from its root.
`node scripts/build-runtime.mjs` regenerates `src/runtime.generated.ts`, and `test/runtime-generated.test.ts` fails
while it is stale.

`@smthrs/ui` drops the unreleased `./adapters/terminal-frame` subpath, and `scripts/build-views.mjs` no longer builds
the terminal runtime. The root gains `newNonce`, `useNearScreen` and `xtermBaseCss`, which the frame shares with
`GeneratedView` and the `Terminal` adapter.
