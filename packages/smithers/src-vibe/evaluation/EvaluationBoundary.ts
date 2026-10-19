// E-7 (EK4402): process.env, node:fs/promises, node:path, node:crypto and
// node:url are platform APIs that VibeLang code does not call directly.
// A-2/E-4 (D38): async functions (EK1003), the dynamic import, and the runner
// boundaries that hand a Promise to TypeScript callers stay TypeScript.
// `list`, `suiteFile`, `load`, `writeJson`, `readRun` and `readBaseline` are
// Evaluation.ts's own, verbatim; `readRun` takes the module's `runPath` and
// `RunArtifact`, which a hatch cannot import from the .vibe module that
// rebinds it without a cycle.
import type { RuntimeConfig } from "@smthrs/build-cli/Cli"
import { CaseExecutor, Suite } from "@smthrs/evals"
import { Effect } from "effect"
import { randomUUID } from "node:crypto"
import { link, mkdir, open, readdir, readFile, realpath, rename, unlink } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import * as CliError from "../CliError.vibe"
import type * as Environment from "../Environment.ts"
import type { EvaluationModule, RunArtifact } from "./Evaluation.vibe"

/** The host process environment. */
export const hostEnvironment = (): Environment.Source => process.env

/** `path.join`. */
export const joinPath = (...parts: ReadonlyArray<string>): string => join(...parts)

/** Runs a program for an async TypeScript caller, as `async () => Effect.runPromise(program())`. */
export const runAsync = async <A, E>(program: () => Effect.Effect<A, E>, options?: Effect.RunOptions): Promise<A> =>
  Effect.runPromise(program(), options)

/** File suffixes recognized as executable evaluation suites. */
const modulePattern = /\.eval\.(?:ts|mts|js|mjs)$/

/**
 * Discovery does not import modules or run any suite/executor code.
 * @category constructors
 * @since 1.0.0
 */
export const list = async (root: string) => {
  const directory = join(root, "evals")
  const found: Array<{ name: string; file: string }> = []
  const visit = async (path: string, prefix: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(path, { withFileTypes: true })
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code
      if (code === "ENOENT" && path === directory) return
      if (code === "ENOTDIR" || code === "EACCES" || code === "EPERM") {
        throw new CliError.Refused({
          fault: "user",
          code: "eval_directory_unreadable",
          message: `Cannot read ${path} as a directory`
        })
      }
      throw cause
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue
      const name = prefix + entry.name
      if (entry.isDirectory()) await visit(join(path, entry.name), `${name}/`)
      else if (entry.isFile() && modulePattern.test(name)) {
        found.push({ name: name.replace(modulePattern, ""), file: join(path, entry.name) })
      }
    }
  }
  await visit(directory, "")
  return found
}

/**
 * Resolves an explicit file selector inside the project's evals directory.
 * Loading imports the module, so an escaping selector would execute arbitrary
 * local code; refuse it before the import rather than after validating the
 * exports of a module whose top level already ran.
 */
const suiteFile = async (root: string, selector: string): Promise<string> => {
  const directory = join(root, "evals")
  const file = resolve(root, selector)
  const refusal = () =>
    new CliError.UsageError({
      message: `${selector} is not a suite module under ${directory}; list the selectable suites first`
    })
  if (!modulePattern.test(file)) throw refusal()
  let contained: boolean
  try {
    // Compare real paths so a link inside evals cannot select code outside it.
    const [real, base] = await Promise.all([realpath(file), realpath(directory)])
    contained = real.startsWith(base + sep)
  } catch {
    throw refusal()
  }
  if (!contained) throw refusal()
  return file
}

/**
 * Loads and validates one discovered evaluation module.
 * @category constructors
 * @since 1.0.0
 */
export const load = async (root: string, selector: string, runtime: RuntimeConfig = {}): Promise<{
  readonly file: string
  readonly suite: Suite.Suite
  readonly executor: CaseExecutor.Service
}> => {
  runtime.signal?.throwIfAborted()
  const files = await list(root)
  const matches = files.filter((entry) => entry.name === selector)
  if (matches.length > 1) {
    throw new CliError.UsageError({ message: `Ambiguous evaluation suite ${selector}; specify its file` })
  }
  const file = matches[0]?.file ?? await suiteFile(root, selector)
  runtime.signal?.throwIfAborted()
  let imported: unknown
  try {
    imported = await import(pathToFileURL(file).href)
  } catch {
    // The module's own error text is the author's code, not a sentence for
    // this command; running the file directly shows it.
    throw new CliError.Refused({
      fault: "user",
      code: "eval_module_failed",
      message: `Could not import ${file}; run it directly to see why`
    })
  }
  runtime.signal?.throwIfAborted()
  const exports = imported as Record<string, unknown>
  const candidate = (exports.default ?? exports) as Partial<EvaluationModule>
  if (candidate.suite === undefined || typeof candidate.executor?.run !== "function") {
    throw new CliError.Refused({
      fault: "user",
      code: "eval_module_invalid",
      message: `${file} must export { suite, executor }, where executor is a CaseExecutor.Service`
    })
  }
  const declaration = candidate.suite
  const resolvedSuite = await Effect.runPromise(
    Effect.isEffect(declaration) ? declaration : Effect.promise(() => Promise.resolve(declaration)),
    { signal: runtime.signal }
  )
  const suite = await Effect.runPromise(Suite.make(resolvedSuite), { signal: runtime.signal })
  return { file, suite, executor: candidate.executor }
}

/**
 * Writes a JSON artifact atomically and refuses replacement by default.
 * @category constructors
 * @since 1.0.0
 */
export const writeJson = async (
  file: string,
  source: string,
  overwrite = false,
  signal?: AbortSignal
): Promise<void> => {
  signal?.throwIfAborted()
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  // Enter cleanup only after exclusive creation proves we own this path.
  // A colliding file or symlink belongs to another writer and must survive.
  const handle = await open(temporary, "wx", 0o600)
  try {
    try {
      await handle.writeFile(source, { encoding: "utf8" })
    } finally {
      await handle.close()
    }
    signal?.throwIfAborted()
    // link is an atomic no-replace publication; a crash never exposes partial JSON.
    if (overwrite) await rename(temporary, file)
    else await link(temporary, file)
  } finally {
    await unlink(temporary).catch((cause: NodeJS.ErrnoException) => {
      if (cause.code !== "ENOENT") throw cause
    })
  }
}

/**
 * Reads a saved run by identity or path.
 * @category constructors
 * @since 1.0.0
 */
export const makeReadRun = (deps: {
  readonly runPath: (root: string, runId: string) => string
  readonly RunArtifact: typeof RunArtifact
}) =>
async (root: string, selector: string): Promise<RunArtifact> => {
  const { runPath, RunArtifact } = deps
  const file = isAbsolute(selector) || selector.includes("/") || selector.endsWith(".json")
    ? resolve(root, selector)
    : runPath(root, selector)
  let source: string
  try {
    source = await readFile(file, "utf8")
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause
    throw new CliError.Refused({
      fault: "user",
      code: "eval_run_not_found",
      message: `No saved evaluation run at ${file}; run the suite first`
    })
  }
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    value = undefined
  }
  const parsed = RunArtifact.safeParse(value)
  if (!parsed.success) {
    throw new CliError.Refused({
      fault: "user",
      code: "eval_run_invalid",
      message: `${file} is not a saved evaluation run`
    })
  }
  return parsed.data
}

/**
 * Reads a committed baseline file.
 * @category constructors
 * @since 1.0.0
 */
export const readBaseline = async (file: string): Promise<string> => {
  try {
    return await readFile(file, "utf8")
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause
    throw new CliError.Refused({
      fault: "user",
      code: "eval_baseline_not_found",
      message: `No baseline at ${file}; write one with eval baseline`
    })
  }
}

