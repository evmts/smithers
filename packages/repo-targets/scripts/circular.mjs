// The shared circular-dependency guard for a conventional package. It runs
// from the package directory, which is where `pnpm run circular` and the
// `circular` target start it.
//
// The compiler resolves the module graph: `projectImports` from
// `vibelang/project` lists the package's `tsconfig.json` program and every
// import its `.ts` and `.vibe` files write, each with the file it resolved to,
// without type-checking. An import is an edge when it loads at run time, which
// `analyze` decides from the importing file's syntax: `import type`,
// `export type` and `import()` types are not edges. A file of another package
// or of `node_modules` is not a node, so a cycle is one package's own. madge
// finds the cycles in that graph.
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve, sep } from "node:path"
import { findCompiler, formatDiagnostic, projectImports } from "vibelang/project"
import { analyze } from "../src/ImportAnalysis.ts"
import { isMain, repoRoot } from "./workspace-packages.mjs"

/** The specifiers a source names only as types: every reference to each is type-only. */
export const typeOnlySpecifiers = (file, text) => {
  const loads = new Map()
  for (const reference of analyze(file, text).references) {
    loads.set(reference.specifier, loads.get(reference.specifier) === true || !reference.typeOnly)
  }
  return new Set([...loads].filter(([, runs]) => !runs).map(([specifier]) => specifier))
}

/** Whether a file belongs to the package at `directory`: inside it, outside `node_modules` and every nested package. */
const ownedBy = (directory) => {
  const owned = new Map()
  const ownsDirectory = (path) => {
    if (path === directory) return true
    let answer = owned.get(path)
    if (answer === undefined) {
      const parent = dirname(path)
      answer = parent !== path && !existsSync(join(path, "package.json")) && ownsDirectory(parent)
      owned.set(path, answer)
    }
    return answer
  }
  return (file) => {
    const path = relative(directory, file)
    return path !== "" && !path.startsWith("..") && !path.split(sep).includes("node_modules") &&
      ownsDirectory(dirname(file))
  }
}

/**
 * The package's run-time module graph: each of its program's files, by
 * package-relative path, to the files of the package it loads.
 */
export const moduleGraph = ({ directory, tsconfig = "tsconfig.json", compiler = findCompiler(repoRoot) }) => {
  const root = resolve(directory)
  const { files, imports, errors } = projectImports({ project: resolve(root, tsconfig), root, compiler })
  if (errors.length > 0) {
    throw new Error(`The compiler could not read ${tsconfig}:\n${errors.map(formatDiagnostic).join("\n")}`)
  }
  const owns = ownedBy(root)
  const name = (file) => relative(root, file).split(sep).join("/")
  const graph = Object.fromEntries(files.filter(owns).map((file) => [name(file), []]))
  const typeOnly = new Map()
  for (const { importer, specifier, file } of imports) {
    if (!owns(importer) || !owns(file)) continue
    if (!typeOnly.has(importer)) typeOnly.set(importer, typeOnlySpecifiers(importer, readFileSync(importer, "utf8")))
    if (typeOnly.get(importer).has(specifier)) continue
    const edges = graph[name(importer)] ??= []
    if (!edges.includes(name(file))) edges.push(name(file))
  }
  return graph
}

/** The package's import cycles, each a list of package-relative paths. */
export const circular = async (directory, options = {}) => {
  const madge = createRequire(join(resolve(directory), "package.json"))("madge")
  return (await madge(moduleGraph({ directory, ...options }))).circular()
}

/** The guard's report: nothing for no cycles, else one line per cycle. */
export const report = (cycles) =>
  cycles.length === 0 ? undefined : [
    `Circular dependencies found: ${cycles.length}`,
    ...cycles.map((cycle) => `  ${[...cycle, cycle[0]].join(" > ")}`)
  ].join("\n")

if (isMain(import.meta)) {
  try {
    const failure = report(await circular(process.cwd()))
    if (failure !== undefined) {
      console.error(failure)
      process.exitCode = 1
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  }
}
