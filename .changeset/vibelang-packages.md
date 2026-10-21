---
"@smthrs/targets": minor
"@smthrs/build-cli": minor
"@smthrs/repo-targets": minor
---

Builds and checks packages whose sources are VibeLang `.vibe` files.

- `Typecheck` checks with `vibelang`, VibeLang's compiler, in plain and build
  mode, with the arguments it gave `tsc`. On TypeScript it is TypeScript 7's
  checker, and it also reads the `.vibe` source of the workspace packages a
  package imports. A workspace that declares `Typecheck` installs `vibelang`.
- `Markdown.CodeBlocks` compiles its fenced blocks with `vibelang
  --ignoreConfig`.
- `BuildAndCheckTypeScriptPackage`'s default `sources`, `tests`, and
  `testSources` globs name `.vibe` files beside `.ts` ones, so `check`, `test`,
  `lint`, and `fmt` are keyed on a package's VibeLang modules.
- `buildLibrary` compiles each package with `vibelang`, which reads the
  VibeLang sources it imports, and builds a package's CommonJS from its ESM
  output when its `src` holds a `.vibe` file.

```ts
BuildAndCheckTypeScriptPackage({
  sources: Input.glob("{src,examples}/**/*.{ts,vibe}"),
  cwd: "packages/smithers/agent/fs"
})
```
