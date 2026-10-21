---
"@smthrs/targets": minor
"@smthrs/build-cli": minor
"@smthrs/cli": patch
"@smthrs/testing": patch
---

Node programs load VibeLang (`.vibe`) workspace source.

- `Runtime.Node({ version, imports })` names modules Node preloads with
  `--import` before every program the runtime runs; `Runtime.run`,
  `Runtime.test`, and `Runtime.evaluate` add them, so `NodeTest` and
  `NodeBinary` targets get them. `Runtime.preloads` returns the flags. A
  runtime without imports runs as before.
- `installEffectResolution` installs `vibelang/register` (an optional peer of
  `@smthrs/build-cli`) before its own hooks, so declaration graphs, flows, and
  `node src/bin.ts` load `.vibe` modules. The hooks compose in either order.
- The CLI states a `.vibe` module's compiler diagnostics, or that Node met a
  `.vibe` module without VibeLang's loader, instead of the generic failure
  sentence, also when an Effect wraps the failed import.
- `smthrs-model-server` installs the loader when it runs from a checkout.

```ts
export const runtime = S.Runtime.Node({ version: ">=26.4.0", imports: ["vibelang/register"] })
```
