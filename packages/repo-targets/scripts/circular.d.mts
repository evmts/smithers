/** The specifiers a source names only as types: every reference to each is type-only. */
export declare const typeOnlySpecifiers: (file: string, text: string) => ReadonlySet<string>
/**
 * The package's run-time module graph: each of its program's files, by
 * package-relative path, to the files of the package it loads.
 */
export declare const moduleGraph: (options: {
  readonly directory: string
  readonly tsconfig?: string
  readonly compiler?: string
}) => Record<string, Array<string>>
/** The package's import cycles, each a list of package-relative paths. */
export declare const circular: (
  directory: string,
  options?: { readonly tsconfig?: string; readonly compiler?: string }
) => Promise<Array<Array<string>>>
/** The guard's report: nothing for no cycles, else one line per cycle. */
export declare const report: (cycles: ReadonlyArray<ReadonlyArray<string>>) => string | undefined
