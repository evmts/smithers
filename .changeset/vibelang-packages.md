---
"@smthrs/targets": minor
"@smthrs/repo-targets": minor
---

Builds and checks packages whose sources are VibeLang `.vibe` files.

- `Typecheck` takes an optional `compiler`, `"tsc"` or `"vibelang"`. An omitted
  compiler is `tsc`, and the target keeps its key.
- `BuildAndCheckTypeScriptPackage` passes its new `compiler` option to `check`.
- `buildLibrary` compiles a package whose `src` holds a `.vibe` file with
  `vibelang`, which also compiles its TypeScript, and builds that package's
  CommonJS from its ESM output.

```ts
BuildAndCheckTypeScriptPackage({
  sources: Input.glob("{src,examples}/**/*.{ts,vibe}"),
  tests: Input.glob("test/**/*.test.{ts,vibe}"),
  testSources: Input.glob("test/**/*.{ts,vibe}"),
  compiler: "vibelang",
  cwd: "packages/smithers/agent/fs"
})
```
