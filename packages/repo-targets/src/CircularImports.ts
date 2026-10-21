/**
 * The circular-import guard as a declared target.
 *
 * Every package runs one guard, `scripts/circular.mjs` in this package. It
 * reads the module graph the compiler resolves for the package's
 * `tsconfig.json`, `.vibe` modules included, and fails on a cycle of run-time
 * imports among the package's own files. See the package README.
 *
 * @since 0.1.0
 */

import * as Input from "@smthrs/targets/Input"
import { entrypoint, NodeTest } from "@smthrs/targets/NodeTest"
import type * as Runtime from "@smthrs/targets/Runtime"

/** The shared guard program. */
const guard: Input.File = Input.file("//packages/repo-targets/scripts/circular.mjs")

/** The guard's own modules, which key every guard target beside its entry point. */
const guardModules: ReadonlyArray<Input.File> = [
  Input.file("//packages/repo-targets/src/ImportAnalysis.ts"),
  Input.file("//packages/repo-targets/scripts/workspace-packages.mjs")
]

/**
 * Options accepted by {@link CircularImports}.
 *
 * @category models
 * @since 0.1.0
 */
export interface Options {
  /** The workspace-relative package directory the guard runs in. */
  readonly cwd: string
  /** The package's sources; an edit to one re-keys the target, as does one to its `tsconfig.json`. */
  readonly sources: ReadonlyArray<Input.Glob | Input.File>
  /**
   * The guard program, for a package that keeps its own.
   *
   * @default //packages/repo-targets/scripts/circular.mjs
   */
  readonly script?: Input.File | undefined
  /** The interpreter; omitted, the executor uses the workspace runtime. */
  readonly runtime?: Runtime.Runtime | undefined
}

/**
 * A `test`-kind target that fails when the package's own modules import each
 * other in a cycle.
 *
 * The guard reads the graph the VibeLang compiler resolves for the package's
 * `tsconfig.json`, so `.vibe` modules, and `.ts` modules that import them, are
 * in it. An import is an edge when it loads at run time: `import type`,
 * `export type` and `import()` types are not. Files of `node_modules` and of
 * nested packages are not nodes.
 *
 * @category macros
 * @since 0.1.0
 */
export const CircularImports = (options: Options): ReturnType<typeof NodeTest> =>
  NodeTest({
    ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
    runner: entrypoint(options.script ?? guard),
    srcs: [...options.sources, Input.file("tsconfig.json"), ...(options.script === undefined ? guardModules : [])],
    deps: [],
    cwd: options.cwd
  })
