---
"@smthrs/targets": minor
"@smthrs/repo-targets": minor
---

Builds packages whose programs reach VibeLang `.vibe` sources.

- The `tsc` tool of `TsBuild` and `DtsBuild` runs `vibelang`, VibeLang's
  compiler, with the flags it gave `tsc`, as `Typecheck` does. A `.vibe` entry
  names the same `dist/<format>/<name>.js` and `.d.ts` a `.ts` entry does.
- `buildLibrary` compiles with `vibelang` whenever the package's `src`, or the
  `src` of a linked package it depends on, holds a `.vibe` module, since a
  workspace package's exports name its source and tsc cannot read it.
  `packageCompiler` and `compilePackage` expose that choice to hand-written
  build programs.
