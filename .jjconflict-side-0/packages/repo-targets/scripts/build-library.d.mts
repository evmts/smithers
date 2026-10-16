/** Copies every `.d.ts` under `source` to the same relative path under `destination`. */
export declare const copyInputDeclarations: (source: string, destination: string) => void
/** Copies `dist/esm` declarations and their maps to `dist/cjs` and marks `dist/cjs` as CommonJS. */
export declare const copyCommonJsDeclarations: (packageRoot: string) => void
/** Builds `dist/esm` declarations with `tsc` and `dist/cjs` with esbuild, from the package's own toolchain. */
export declare const buildLibrary: (
  packageRoot: string,
  options?: { readonly esmOnly?: ReadonlyArray<string>; readonly declarationTimeoutMs?: number }
) => Promise<void>
