#!/usr/bin/env node
/**
 * Runs a package's unchanged TypeScript test suite against its VibeLang twin
 * (Will's goal W46: Smithers' Effect code moves to VibeLang through API-identical
 * twins). The twin lives in `<package>/src-vibe/`, mirroring `src/`.
 *
 *   node .smithers/flows/vibe-twin/twin.mjs <package dir> [--json]
 *
 * Steps, all written under `<package>/.vibe-twin/` (ignored):
 * 1. compile the twin with the vibelang CLI into `out/` (JavaScript and .d.ts);
 * 2. emit the TypeScript's .d.ts into `ts-dts/` and diff every module both have;
 * 3. run the package's Vitest suite twice, on `src/` and on the twin, where a
 *    resolver sends any import that resolves into `src/` to the twin's output.
 * Exit 0 only when the twin compiles without errors, every shared .d.ts matches,
 * and the twin run has no failure the TypeScript run lacks.
 */
import { spawnSync } from "node:child_process"
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)))

/** Relative import extensions differ by design (.vibe and .ts both emit .js). */
/**
 * Drops trailing `never` arguments of `Effect.Effect<A, E = never, R = never>`: the
 * VibeLang emitter writes `Effect.Effect<A, E, never>` where TypeScript writes
 * `Effect.Effect<A, E>`, the same type (D-3, plugin Resolve.resolve).
 */
export const dropDefaultNever = (text) => {
  const head = "Effect.Effect<"
  let out = ""
  let i = 0
  while (i < text.length) {
    const at = text.indexOf(head, i)
    if (at < 0 || (at > 0 && /[\w$.]/.test(text[at - 1]))) {
      if (at < 0) return out + text.slice(i)
      out += text.slice(i, at + 1)
      i = at + 1
      continue
    }
    const args = []
    let depth = 0
    let start = at + head.length
    let j = start
    for (; j < text.length; j++) {
      const c = text[j]
      if (c === '"' || c === "'" || c === "`") {
        for (j++; j < text.length && text[j] !== c; j++) if (text[j] === "\\") j++
      } else if ("<([{".includes(c)) depth++
      else if (c === ">" && text[j - 1] === "=") continue
      else if (">)]}".includes(c)) {
        if (depth === 0) break
        depth--
      } else if (c === "," && depth === 0) {
        args.push(text.slice(start, j))
        start = j + 1
      }
    }
    if (j >= text.length) return out + text.slice(i)
    args.push(text.slice(start, j))
    const inner = args.map(dropDefaultNever)
    while (inner.length > 1 && inner[inner.length - 1].trim() === "never") inner.pop()
    out += text.slice(i, at) + head + inner.join(",") + ">"
    i = j + 1
  }
  return out
}

export const normalizeDts = (text) =>
  dropDefaultNever(text)
    .replaceAll(/(from\s+["']\.{1,2}\/[^"']*?)\.(?:vibe|ts|tsx|js)(["'])/g, "$1.js$2")
    .replaceAll(/(import\(["']\.{1,2}\/[^"']*?)\.(?:vibe|ts|tsx|js)(["'])/g, "$1.js$2")
    .replaceAll(/^\/\/# sourceMappingURL=.*$/gm, "")
    .trim()

/**
 * The exports of a compiler-emitted .d.ts, one entry per name: `value` (const,
 * function, let, default), `class`, `type` (interface, type alias, enum,
 * namespace) or `reexport` (keyed by its normalized text). Overloads group under
 * one name. Each entry carries its text, with the JSDoc above it.
 */
/** A compiler-emitted .d.ts as its top-level statements, each with the JSDoc above it. */
const statementsOf = (text) => {
  const statements = []
  let current = ""
  let depth = 0
  let quote = ""
  let comment = false
  for (const line of text.split("\n")) {
    const opens = depth === 0 && quote === "" && !comment && current.trim() !== "" && !current.trimEnd().endsWith("*/")
      && /^(?:\/\*\*|export |declare |import |interface |type )/.test(line)
    if (opens) {
      statements.push(current)
      current = ""
    }
    current += `${line}\n`
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (comment) {
        if (c === "*" && line[i + 1] === "/") {
          comment = false
          i++
        }
      } else if (quote) {
        if (c === "\\") i++
        else if (c === quote) quote = ""
      } else if (c === "/" && line[i + 1] === "*") {
        comment = true
        i++
      } else if (c === "/" && line[i + 1] === "/") break
      else if (c === "\"" || c === "'" || c === "`") quote = c
      else if (c === "{" || c === "(" || c === "[") depth++
      else if (c === "}" || c === ")" || c === "]") depth--
    }
  }
  statements.push(current)
  return statements.map((s) => s.trim()).filter(Boolean)
}

/** The body of a statement, without its leading comments. */
const bodyOf = (statement) => statement.replace(/^(?:\/\*[\s\S]*?\*\/\s*)+/, "")

/**
 * The statements a module's exports depend on without exporting them: imports,
 * private declarations and helper consts, normalized and sorted. When two
 * modules' sets differ, identical export text can still mean different types.
 */
export const localDeclarations = (text) =>
  statementsOf(text)
    .map(bodyOf)
    .filter((body) => !body.startsWith("export "))
    .map((body) => normalizeDts(body).replaceAll(/, \{ with: \{ "resolution-mode": "import" \} \}/g, ""))
    .sort()

/**
 * A module's private names and the normalized text that defines each: imported
 * bindings and non-exported declarations. An export's meaning depends only on
 * the private names its own text mentions (B-5).
 */
export const localNames = (text) => {
  const names = new Map()
  for (const body of localDeclarations(text)) {
    const imp = body.match(/^import\s+(?:type\s+)?([\s\S]*?)\s+from\s+(["'][^"']+["'])/)
    if (imp) {
      const [, clause, from] = imp
      const ns = clause.match(/\*\s+as\s+([\w$]+)/)
      if (ns) names.set(ns[1], `* from ${from}`)
      const def = clause.match(/^([\w$]+)\s*(?:,|$)/)
      if (def) names.set(def[1], `default from ${from}`)
      for (const part of (clause.match(/\{([\s\S]*)\}/)?.[1] ?? "").split(",")) {
        const m = part.trim().replace(/^type\s+/, "").match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/)
        if (m) names.set(m[2] ?? m[1], `${m[1]} from ${from}`)
      }
      continue
    }
    const decl = body.match(/^(?:declare\s+)?(?:abstract\s+)?(?:const|let|var|function|class|interface|type|enum|namespace)\s+([\w$]+)/)
    if (decl) names.set(decl[1], [names.get(decl[1]), body].filter(Boolean).join("\n"))
  }
  return names
}

/** Whether every private name an export's text mentions means the same in both modules. */
export const sameReferencedLocals = (exportText, tsLocals, vbLocals) => {
  const names = new Set([...tsLocals.keys(), ...vbLocals.keys()])
  const visited = new Set()
  const pending = [exportText]
  while (pending.length > 0) {
    const text = pending.pop()
    for (const name of names) {
      if (visited.has(name)) continue
      if (!new RegExp(`(?<![\\w$.])${name.replaceAll("$", "\\$")}(?![\\w$])`).test(text)) continue
      visited.add(name)
      const left = tsLocals.get(name)
      if (left !== vbLocals.get(name)) return false
      if (left !== undefined) pending.push(left)
    }
  }
  return true
}

export const parseDts = (text) => {
  const byName = new Map()
  for (const statement of statementsOf(text)) {
    const body = bodyOf(statement)
    if (!body.startsWith("export ") || /^export \{\s*\};?$/.test(body)) continue
    // A named re-export is one entry per name, so a twin that re-exports the same names from a
    // differently spelled path is compared by type, not by path text (E-14).
    // A local export list (export { a, b as c };) is per name too: each is checked by type (E-14).
    const named = body.match(/^export\s+(type\s+)?\{([^}]*)\}(?:\s*from\s*["'][^"']+["'])?;?$/)
    if (named) {
      for (const part of named[2].split(",").map((x) => x.trim()).filter(Boolean)) {
        const m = part.match(/^(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/)
        if (!m) continue
        const name = m[3] ?? m[2]
        const kind = named[1] || m[1] ? "type" : "value"
        byName.set(name, { name, kind, generic: false, text: `export { ${part} } from <re-export>` })
      }
      continue
    }
    const m = body.match(/^export (?:declare )?(?:abstract )?(const|let|var|function|class|interface|type|enum|namespace|default)\b\s*([A-Za-z_$][\w$]*)?/)
    const entry = m === null
      ? { name: normalizeDts(body), kind: "reexport" }
      : m[1] === "default"
      ? { name: "default", kind: "value" }
      : { name: m[2], kind: m[1] === "class" ? "class" : ["interface", "type", "enum", "namespace"].includes(m[1]) ? "type" : "value" }
    const generic = entry.kind === "type" && new RegExp(`^export (?:declare )?(?:interface|type) ${entry.name}<`).test(body)
    const previous = byName.get(entry.name)
    byName.set(entry.name, previous ? { ...previous, text: `${previous.text}\n${statement}` } : { ...entry, generic, text: statement })
  }
  return [...byName.values()]
}

/**
 * Where the twin's compiled modules land. The twin compiles with the repository as rootDir,
 * because a module may import TypeScript outside its package (apps/app imports
 * .smithers/flows/coding schemas, F-2); every output then stays under .vibe-twin/out/.
 */
export const twinOutDir = (pkg) => join(pkg, ".vibe-twin", "out", relative(repoRoot(pkg), pkg), "src-vibe")

/** The repository root: the nearest folder above the package with a pnpm workspace or .jj. */
const repoRoot = (pkg) => {
  for (let dir = pkg; dir !== dirname(dir); dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml")) || existsSync(join(dir, ".jj"))) return dir
  }
  return pkg
}

/** The twin's compiled module for a resolved `src/` file, or undefined. */
export const twinFor = (resolved, pkg) => {
  const file = resolved.split("?")[0]
  const src = join(pkg, sourceRoot(pkg)) + sep
  if (!file.startsWith(src) || !/\.(?:ts|tsx|mts)$/.test(file) || file.endsWith(".d.ts")) return undefined
  const rel = file.slice(src.length).replace(/\.(?:ts|tsx|mts)$/, "")
  if (!twinModules(pkg).has(rel)) return undefined
  return join(twinOutDir(pkg), `${rel}.js`)
}

/** The src/ modules (relative, no extension) that have a real twin; a stub is not one. */
const twinModules = (pkg) => {
  const manifest = join(twinOutDir(pkg), MANIFEST)
  if (!existsSync(manifest)) return new Set()
  return new Set(JSON.parse(readFileSync(manifest, "utf8")))
}

const MANIFEST = ".vibe-twin-modules.json"

/** A src/ module without a twin yet: its path relative to src/, without extension. */
const srcModules = (pkg) =>
  walkSources(join(pkg, sourceRoot(pkg)))
    .filter(isModule)
    .map((f) => ({ rel: f.replace(/\.(?:ts|tsx|mts)$/, ""), file: join(pkg, sourceRoot(pkg), f) }))

/**
 * After the twin compiles: record which src/ modules it twins, and give every
 * other src/ module a stub in the output that re-exports the TypeScript, so a
 * partial twin's imports of modules not twinned yet still run.
 */
const linkPartialTwin = (pkg, work) => {
  const out = twinOutDir(pkg)
  const twinned = srcModules(pkg).filter(({ rel }) =>
    ["vibe", "ts", "tsx"].some((x) => existsSync(join(pkg, "src-vibe", `${rel}.${x}`)))
  )
  const names = new Set(twinned.map(({ rel }) => rel))
  mkdirSync(out, { recursive: true })
  // The twin compile also emits every TypeScript module the twin imports (rootDir is the
  // repository), and the twin's relative imports reach those copies: a second instance of the
  // module, so a test's spy on the real one never fires (E-16). Each copy becomes a re-export
  // of the real source file: one instance, live bindings.
  const outRoot = join(work, "out")
  const repo = repoRoot(pkg)
  for (const f of walk(outRoot).filter((x) => x.endsWith(".js"))) {
    const emitted = join(outRoot, f)
    if (emitted.startsWith(out + sep)) continue
    const base = join(repo, f.replace(/\.js$/, ""))
    const real = [".ts", ".tsx", ".mts"].map((x) => base + x).find(existsSync)
    if (real === undefined) continue
    const hasDefault = /^\s*export\s+default\b/m.test(readFileSync(real, "utf8"))
    writeFileSync(emitted, `// vibe-twin: the real module, not a compiled copy\nexport * from ${JSON.stringify(real)}\n${hasDefault ? `export { default } from ${JSON.stringify(real)}\n` : ""}`)
  }
  // A module may read a resource beside it (new URL("./x.ndjson", import.meta.url)); its twin
  // runs from the output folder, so non-code files are copied there too (F-6).
  for (const f of walkSources(join(pkg, sourceRoot(pkg)))) {
    if (/\.(?:ts|tsx|mts|cts|js|mjs|cjs|vibe|map)$/.test(f)) continue
    const dest = join(out, f)
    if (existsSync(dest)) continue
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(pkg, sourceRoot(pkg), f), dest)
  }
  writeFileSync(join(out, MANIFEST), JSON.stringify([...names]) + "\n")
  for (const { rel, file } of srcModules(pkg)) {
    if (names.has(rel)) continue
    const stub = join(out, `${rel}.js`)
    mkdirSync(dirname(stub), { recursive: true })
    const hasDefault = /^\s*export\s+default\b/m.test(readFileSync(file, "utf8"))
    writeFileSync(stub, `// vibe-twin stub: not twinned yet\nexport * from ${JSON.stringify(file)}\n${hasDefault ? `export { default } from ${JSON.stringify(file)}\n` : ""}`)
  }
  return [...names]
}

/**
 * For an import made by compiled twin code: undefined when the twin has the
 * target, else the src/ module it falls back to. A partial twin imports modules
 * that are not twinned yet with the TypeScript's own specifiers (rootDirs).
 */
export const fallbackFor = (source, importer, pkg) => {
  const twinRoot = twinOutDir(pkg) + sep
  if (!importer.startsWith(twinRoot) || !source.startsWith(".")) return undefined
  const target = resolve(dirname(importer), source.split("?")[0])
  const base = target.replace(/\.(?:js|mjs|ts|tsx|vibe)$/, "")
  if (!base.startsWith(twinRoot)) return undefined
  const rel = base.slice(twinRoot.length)
  // A real twin, or a twin-only file such as a hatch, stays. A module not twinned yet goes to
  // its src/ file itself, not the stub, so it has one namespace identity (A-9).
  const twins = twinModules(pkg)
  if (twins.has(rel) || twins.has(`${rel}/index`)) return undefined
  return [".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"].map((x) => join(pkg, sourceRoot(pkg), rel + x)).find(existsSync)
}

const walk = (dir, base = dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name))]
    )
    : []

/**
 * Where a package's sources are: `src/`, or the package root for a flat package
 * such as `.smithers/flows`, whose flows sit in folders beside `test/`.
 */
export const sourceRoot = (pkg) => (existsSync(join(pkg, "src")) ? "src" : ".")

/** Folders that never hold API modules anywhere. */
const neverSources = new Set(["node_modules", "__tests__", "src-vibe", ".vibe-twin"])
/**
 * Folders a flat package keeps beside its modules at its root. Inside src/, a test/ folder
 * holds public modules (kernel's src/test/HostContract.ts is a shipped subpath, B-7).
 */
const rootOnlyNonSources = new Set(["test", "tests", "e2e", "fixtures", "dist", "scripts"])

/** Every file under a source root, without the folders that are never sources. */
const walkSources = (dir, base = dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (!e.isDirectory()) return [relative(base, join(dir, e.name))]
      const flatRoot = dir === base && basename(base) !== "src" && basename(base) !== "src-vibe"
      // A folder with its own package.json is another package (.smithers/flows/coding, E-13).
      const nestedPackage = existsSync(join(dir, e.name, "package.json"))
      const skip = e.name.startsWith(".") || neverSources.has(e.name) || nestedPackage || (flatRoot && rootOnlyNonSources.has(e.name))
      return skip ? [] : walkSources(join(dir, e.name), base)
    })
    : []

/** A module file: TypeScript, not a declaration, test or config. */
const isModule = (rel) =>
  /\.(?:ts|tsx|mts)$/.test(rel) && !/\.d\.ts$|\.(?:test|spec)\.tsx?$|(?:^|\/)__tests__\/|(?:^|\/)[\w.-]+\.config\.[cm]?ts$|^PACKAGE\.ts$/.test(rel)

/** A tool from the package's own node_modules, else the workspace root's. */
const bin = (pkg, name) => [join(pkg, "node_modules", ".bin", name), join(root, "node_modules", ".bin", name)].find(existsSync)

/** The package's tsconfig.json, or the nearest one above it (.smithers/flows/coding has none, E-15). */
const nearestTsconfig = (pkg) => {
  for (let dir = pkg; dir !== dirname(dir); dir = dirname(dir)) {
    if (existsSync(join(dir, "tsconfig.json"))) return join(dir, "tsconfig.json")
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return undefined
  }
  return undefined
}

const tsconfig = (pkg, file, compilerOptions, include, exclude = []) => {
  // The twin compiles with the same options as the TypeScript it mirrors (E-15).
  const found = nearestTsconfig(pkg)
  const base = found === undefined ? undefined : relative(dirname(file), found)
  writeFileSync(
    file,
    JSON.stringify({ ...(base ? { extends: base } : {}), compilerOptions, include, exclude }, null, 2) + "\n"
  )
}

/** The compiler's version, as [major, minor, patch]; VibeLang 0.0.1 knows no vibelang options. */
let compilerVersion
const version = () => {
  if (compilerVersion) return compilerVersion
  const out = spawnSync(process.execPath, [join(root, "node_modules/vibelang/bin/vibelang"), "--version"], { encoding: "utf8" }).stdout ?? ""
  compilerVersion = (out.match(/VibeLang (\d+)\.(\d+)\.(\d+)/) ?? [0, 0, 0, 0]).slice(1).map(Number)
  return compilerVersion
}
const atLeast = ([a, b, c]) => {
  const [x, y, z] = version()
  return x !== a ? x > a : y !== b ? y > b : z >= c
}

const common = {
  // D261 (VibeLang 0.0.2): Smithers' own TypeScript packages are trusted, so a call into a sibling
  // package, or a module of its own package, that isn't twinned yet is a plain call (no EK4401)
  // whose exceptions are defects. The apps are smithers-app, smithers-server, smithers-tui (F-3).
  get vibelang() {
    // EK4403 (a clock or randomness read) is adjustable (D34): Smithers' plain helpers read
    // Date.now(), so the twin keeps them and the receipt lists the warnings.
    return atLeast([0, 0, 2])
      ? { trustedPackages: ["@smthrs/*", "@smithers/*", "smithers-*"], diagnostics: { EK4403: "warning" } }
      : undefined
  },
  noEmit: false,
  noEmitOnError: false,
  composite: false,
  incremental: false,
  declarationMap: false,
  plugins: []
}

/** A process that died, failed to spawn, or failed without printing a diagnostic. */
const crashed = (run) => Boolean(run.signal || run.error || (run.status !== 0 && run.errors.length === 0))

/** vibelang -p, returning its diagnostics split by category. */
const compile = (project, cwd) => {
  const run = spawnSync(process.execPath, [join(root, "node_modules/vibelang/bin/vibelang"), "-p", project, "--pretty", "false"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  })
  const output = `${run.stdout}${run.stderr}`
  const lines = output.split("\n")
  const errors = lines.filter((l) => /\berror (?:TS|EK)\d+:/.test(l))
  const warnings = lines.filter((l) => /\bwarning (?:TS|EK)\d+:/.test(l))
  // A crash prints no diagnostic (guardian-review): a failed process with no error line, a
  // signal or a spawn error is an error. A non-zero exit with diagnostics is just those diagnostics.
  const crash = crashed({ status: run.status, signal: run.signal, error: run.error?.message, errors })
  if (crash) {
    errors.push(`compiler process failed (status ${run.status}, signal ${run.signal ?? "none"}): ${run.error?.message ?? output.trim().slice(-2000)}`)
  }
  return { status: run.status, signal: run.signal, error: run.error?.message, crash, errors, warnings, output }
}

/**
 * Splits the twin compile's errors: those in the twin (src-vibe/, or the
 * harness's own files) block it; those in unchanged TypeScript that tsc accepts
 * are VibeLang findings (C-3: EK4820 on a .ts generator) and do not stop the run.
 */
export const splitTwinErrors = (errors) => {
  // Unchanged TypeScript, or a dependency's declarations: zod's .d.cts reports TS5115 (circular
  // instantiation) while the twin is checked (E-14), a finding about the checker, not the twin.
  const inTypeScript = (line) =>
    /^(?!src-vibe\/|\.vibe-twin\/)[^(]*\.(?:ts|tsx|mts|cts)\(\d+,\d+\)/.test(line) || /^[^(]*\/node_modules\/[^(]*\(\d+,\d+\)/.test(line)
  return { twin: errors.filter((l) => !inTypeScript(l)), typescript: errors.filter(inTypeScript) }
}

const vitest = (pkg, config, outputFile, files = []) => {
  // files: an affected-test subset (suites.json affectedOnly); empty runs the whole suite.
  const args = ["run", ...files, "--root", pkg, "--reporter=json", `--outputFile=${outputFile}`, "--coverage.enabled=false"]
  if (config) args.push("--config", config)
  const vitestBin = bin(pkg, "vitest")
  if (!vitestBin) return { ran: false, pass: 0, fail: 0, skip: 0, failed: ["(no vitest in the package or the root)"] }
  const child = spawnLogged(vitestBin, args, { cwd: pkg, env: { ...process.env, CI: "1" } }, outputFile)
  if (!existsSync(outputFile)) return noReport(child, "vitest")
  const report = JSON.parse(readFileSync(outputFile, "utf8"))
  const tests = report.testResults.flatMap((file) =>
    file.assertionResults.map((t) => ({ name: `${relative(pkg, file.name)} > ${t.fullName}`, status: t.status }))
  )
  const suiteErrors = report.testResults.filter((f) => f.status === "failed" && f.assertionResults.length === 0)
    .map((f) => `${relative(pkg, f.name)} > (suite) ${f.message.split("\n")[0]}`)
  return {
    ran: true,
    status: child.status, signal: child.signal, error: child.error?.message,
    pass: tests.filter((t) => t.status === "passed").length,
    fail: tests.filter((t) => t.status === "failed").length + suiteErrors.length,
    skip: tests.filter((t) => t.status === "skipped" || t.status === "pending" || t.status === "todo").length,
    failed: [...tests.filter((t) => t.status === "failed").map((t) => t.name), ...suiteErrors],
    passed: tests.filter((t) => t.status === "passed").map((t) => t.name)
  }
}

/**
 * For labels whose identity check failed: "assignable" when the types are assignable both
 * ways, "nominal" when they differ only by same-named nominal declarations; absent otherwise.
 */
const nominalOnly = (pkg, work, imports, failed) => {
  if (failed.length === 0) return new Map()
  const header = imports.filter((l) => l.startsWith("import "))
  const body = []
  const at = new Map()
  for (const [label, left, right] of failed) {
    body.push(`export const _n${at.size}: ${left} = null as unknown as ${right}`)
    at.set(header.length + body.length, label)
    body.push(`export const _n${at.size}: ${right} = null as unknown as ${left}`)
    at.set(header.length + body.length, label)
  }
  writeFileSync(join(work, "api-detail.ts"), [...header, ...body].join("\n") + "\n")
  tsconfig(pkg, join(work, "tsconfig.detail.json"), {
    ...common, noEmit: true, rootDir: "..", rootDirs: [join("..", sourceRoot(pkg)), "../src-vibe"], allowImportingTsExtensions: true,
    declaration: false, emitDeclarationOnly: false
  }, ["api-detail.ts"])
  const detail = compile(join(work, "tsconfig.detail.json"), pkg)
  if (detail.crash) return new Map()
  const { output } = detail
  const blocks = new Map()
  let label
  for (const line of output.split("\n")) {
    const m = line.match(/api-detail\.ts\((\d+),\d+\): error/)
    if (m) {
      label = at.get(Number(m[1]))
      if (label !== undefined) blocks.set(label, [...(blocks.get(label) ?? []), line])
    } else if (label !== undefined && /^\s/.test(line)) blocks.get(label).push(line)
    else label = undefined
  }
  // A failed Eq check is not discharged by mutual assignability: any is assignable
  // both ways while erasing the original API. Only proven nominal differences qualify.
  return new Map(failed.map(([l]) => {
    const text = (blocks.get(l) ?? []).join("\n")
    const kind = text === "" ? undefined
      : sameNamedPair(pkg, work, text) ? "nominal"
      : undefined
    return [l, kind]
  }).filter(([, kind]) => kind !== undefined))
}

/**
 * Whether an error names the same declaration in corresponding src/ and src-vibe/
 * modules (TypeScript 7 prints a unique symbol mismatch that way), and that
 * declaration has the same text in both: the mismatch is nominal, not real.
 */
const sameNamedPair = (pkg, work, text) => {
  const src = join(pkg, sourceRoot(pkg)) + sep
  const twin = join(pkg, "src-vibe") + sep
  const seen = new Map()
  for (const m of text.matchAll(/import\("([^"]+)"\)\.([A-Za-z_$][\w$]*)/g)) {
    const [, path, name] = m
    const side = path.startsWith(twin) ? "twin" : path.startsWith(src) ? "ts" : undefined
    if (side === undefined) continue
    const rel = path.slice(side === "twin" ? twin.length : src.length).replace(/\.(?:ts|tsx|mts|vibe|js)$/, "")
    const key = `${rel}#${name}`
    seen.set(key, new Set([...(seen.get(key) ?? []), side]))
  }
  const pairs = [...seen].filter(([, sides]) => sides.size === 2).map(([key]) => key.split("#"))
  if (pairs.length === 0) return false
  // A private brand keyed by a module-local unique symbol reports as "Property '[Brand]' is
  // missing", never naming the symbol (S1-2). That is nominal too when the key is a private
  // declaration with identical text in both modules.
  const brandKeys = [...text.matchAll(/Property '\[([A-Za-z_$][\w$]*)\]' is missing/g)].map((m) => m[1])
  if (!/unique symbol|private|protected/.test(text) && brandKeys.length === 0) return false
  const dts = (dir, rel) => (existsSync(join(dir, `${rel}.d.ts`)) ? readFileSync(join(dir, `${rel}.d.ts`), "utf8") : "")
  return pairs.every(([rel, name]) => {
    const tsText = dts(join(work, "ts-dts"), rel)
    const vbText = dts(twinOutDir(pkg), rel)
    const a = parseDts(tsText).find((e) => e.name === name)
    const b = parseDts(vbText).find((e) => e.name === name)
    if (a === undefined || b === undefined || normalizeDts(a.text) !== normalizeDts(b.text)) return false
    const tsLocals = localNames(tsText)
    const vbLocals = localNames(vbText)
    return brandKeys.every((key) => !tsLocals.has(key) && !vbLocals.has(key) ? true : tsLocals.get(key) === vbLocals.get(key) && tsLocals.has(key))
  })
}

/**
 * Compares the API of every module that src/ and the twin both declare. Export
 * names must match. A type declaration must keep its text or, when it is not
 * generic, be the identical type. A value's type, and a class's constructor and
 * instance types, must be identical (checked by the compiler).
 */
/**
 * The exports a source file declares, for a module TypeScript can't emit a .d.ts for (E-6):
 * values, classes and types, with generic types marked. Re-exports from other modules are
 * listed separately; they are checked where they are declared.
 */
export const sourceExports = (text) => {
  const out = new Map()
  const add = (name, kind, generic = false) => out.set(name, { name, kind, generic })
  const body = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  for (const m of body.matchAll(/^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) add(m[1], "class")
  for (const m of body.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/gm)) add(m[1], "value")
  for (const m of body.matchAll(/^export\s+(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) add(m[1], "value")
  for (const m of body.matchAll(/^export\s+(?:declare\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/gm)) add(m[1], "value")
  for (const m of body.matchAll(/^export\s+(?:declare\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)(\s*<)?/gm)) add(m[1], "type", Boolean(m[2]))
  if (/^export\s+default\b/m.test(body)) add("default", "value")
  for (const m of body.matchAll(/^export\s+(type\s+)?\{([^}]*)\}(?!\s*from)/gm)) {
    for (const part of m[2].split(",").map((p) => p.trim()).filter(Boolean)) {
      const t = part.match(/^(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/)
      if (t) add(t[3] ?? t[2], m[1] || t[1] ? "type" : "value")
    }
  }
  return out
}

const apiCheck = (pkg, work, twinned = []) => {
  const twinOut = twinOutDir(pkg)
  const twinDts = new Set(walk(twinOut).filter((f) => f.endsWith(".d.ts")))
  const api = {
    modules: 0, identicalFiles: 0, checked: 0, missingModules: [], missingExports: [], extraExports: [],
    typeDiffers: [], valueDiffers: [], nominal: [], assignable: [], errors: []
  }
  const lines = ["type Eq<A, B> = (<G>() => G extends A ? 1 : 2) extends (<G>() => G extends B ? 1 : 2) ? true : false"]
  const checks = new Map()
  const pairs = new Map()
  const check = (label, left, right) => {
    lines.push(`export const _${checks.size}: Eq<${left}, ${right}> = true`)
    checks.set(lines.length, label)
    pairs.set(label, [left, right])
  }
  walk(join(work, "ts-dts")).filter((f) => f.endsWith(".d.ts")).forEach((file, i) => {
    if (!twinDts.has(file)) {
      api.missingModules.push(file)
      return
    }
    api.modules++
    const tsText = readFileSync(join(work, "ts-dts", file), "utf8")
    const vbText = readFileSync(join(twinOut, file), "utf8")
    if (normalizeDts(tsText) === normalizeDts(vbText)) {
      api.identicalFiles++
      return
    }
    const ts = new Map(parseDts(tsText).map((e) => [e.name, e]))
    const vb = new Map(parseDts(vbText).map((e) => [e.name, e]))
    const tsLocals = localNames(tsText)
    const vbLocals = localNames(vbText)
    for (const name of vb.keys()) if (!ts.has(name)) api.extraExports.push(`${file}: ${name}`)
    const mod = file.replace(/\.d\.ts$/, "")
    const srcFile = ["ts", "tsx", "mts"].map((x) => `${mod}.${x}`).find((f) => existsSync(join(pkg, sourceRoot(pkg), f)))
    const vbFile = ["vibe", "ts", "tsx"].map((x) => `${mod}.${x}`).find((f) => existsSync(join(pkg, "src-vibe", f)))
    let imported = false
    const need = () => {
      if (imported) return
      lines.push(`import type * as T${i} from ${JSON.stringify(`../${join(sourceRoot(pkg), srcFile)}`)}`)
      lines.push(`import type * as V${i} from ${JSON.stringify(`../src-vibe/${vbFile}`)}`)
      imported = true
    }
    for (const [name, e] of ts) {
      const v = vb.get(name)
      if (v === undefined) {
        api.missingExports.push(`${file}: ${name}`)
        continue
      }
      // Equal export text may refer to different private aliases or imports (guardian-review):
      // it is proof only when the module's private context matches too.
      const sameLocals = sameReferencedLocals(e.text, tsLocals, vbLocals)
      if (normalizeDts(e.text) === normalizeDts(v.text) && sameLocals) continue
      if (e.kind === "reexport") {
        api.errors.push(`${file}: ${name} (changed export context requires semantic verification)`)
        continue
      }
      if (e.kind === "type") {
        if (e.generic) api.typeDiffers.push(`${file}: ${name} (generic: keep its text${sameLocals ? "" : " and its module's private declarations"})`)
        else {
          need()
          check(`${file}: type ${name}`, `T${i}.${name}`, `V${i}.${name}`)
        }
        continue
      }
      need()
      check(`${file}: ${name}`, `typeof T${i}.${name}`, `typeof V${i}.${name}`)
      if (e.kind === "class") check(`${file}: instances of ${name}`, `(typeof T${i}.${name})["prototype"]`, `(typeof V${i}.${name})["prototype"]`)
    }
  })
  // Modules TypeScript can't declare: compare the exports both sources declare (E-6, b-3ksbt4).
  api.sourceChecked = []
  twinned.forEach((rel, j) => {
    if (existsSync(join(work, "ts-dts", `${rel}.d.ts`))) return
    const srcFile = ["ts", "tsx", "mts"].map((x) => `${rel}.${x}`).find((f) => existsSync(join(pkg, sourceRoot(pkg), f)))
    const vbFile = ["vibe", "ts", "tsx"].map((x) => `${rel}.${x}`).find((f) => existsSync(join(pkg, "src-vibe", f)))
    if (srcFile === undefined || vbFile === undefined) return
    const ts = sourceExports(readFileSync(join(pkg, sourceRoot(pkg), srcFile), "utf8"))
    const vbDts = join(twinOut, `${rel}.d.ts`)
    const vb = existsSync(vbDts)
      ? new Map(parseDts(readFileSync(vbDts, "utf8")).filter((e) => e.kind !== "reexport").map((e) => [e.name, e]))
      : sourceExports(readFileSync(join(pkg, "src-vibe", vbFile), "utf8"))
    const i = `S${j}`
    lines.push(`import type * as T${i} from ${JSON.stringify(`../${join(sourceRoot(pkg), srcFile)}`)}`)
    lines.push(`import type * as V${i} from ${JSON.stringify(`../src-vibe/${vbFile}`)}`)
    for (const name of vb.keys()) if (!ts.has(name)) api.extraExports.push(`${rel} (source): ${name}`)
    for (const [name, e] of ts) {
      if (!vb.has(name)) {
        api.missingExports.push(`${rel} (source): ${name}`)
        continue
      }
      if (e.kind === "type") {
        if (e.generic) api.typeDiffers.push(`${rel} (source): ${name} (generic, and TypeScript emits no declaration: review)`)
        else check(`${rel} (source): type ${name}`, `T${i}.${name}`, `V${i}.${name}`)
        continue
      }
      check(`${rel} (source): ${name}`, `typeof T${i}.${name}`, `typeof V${i}.${name}`)
      if (e.kind === "class") check(`${rel} (source): instances of ${name}`, `(typeof T${i}.${name})["prototype"]`, `(typeof V${i}.${name})["prototype"]`)
    }
    api.sourceChecked.push(rel)
  })
  api.checked = checks.size
  if (checks.size > 0) {
    writeFileSync(join(work, "api-check.ts"), lines.join("\n") + "\n")
    tsconfig(pkg, join(work, "tsconfig.api.json"), {
      ...common, noEmit: true, rootDir: "..", rootDirs: [join("..", sourceRoot(pkg)), "../src-vibe"], allowImportingTsExtensions: true,
      declaration: false, emitDeclarationOnly: false
    }, ["api-check.ts"])
    const failed = []
    for (const line of splitTwinErrors(compile(join(work, "tsconfig.api.json"), pkg).errors).twin) {
      const at = line.match(/api-check\.ts\((\d+),\d+\)/)
      const label = at ? checks.get(Number(at[1])) : undefined
      if (label === undefined) api.errors.push(line)
      else failed.push(label)
    }
    // D-3: a twin that declares the same unique symbol or private member as the
    // TypeScript has a nominally distinct type. When every incompatibility, both
    // ways, is such a same-named pair, the API matches once only one module exists.
    const nominal = nominalOnly(pkg, work, lines, failed.map((label) => [label, ...pairs.get(label)]))
    for (const label of failed) {
      if (nominal.get(label) === "assignable") api.assignable.push(label)
      else if (nominal.get(label) === "nominal") api.nominal.push(label)
      else if (label.includes(": type ")) api.typeDiffers.push(label)
      else api.valueDiffers.push(label)
    }
  }
  return api
}

/**
 * Translation quality, report-only: how much of the twin is real VibeLang, and
 * what it adds that the TypeScript lacks. Casts and suppressions are counted
 * net of the TypeScript's own; `heldCalls` counts the B-1 workaround, a held
 * tagged template called by hand, which the rules forbid. `constantConditionsAdded`
 * counts `if (false)`-style guards beyond the TypeScript's own: the shape of an
 * unrestored mutation check, which once disabled wiki-output's boundary check.
 */
export const quality = (pkg) => {
  const count = (dir, re, ext) =>
    walkSources(dir).filter((f) => ext.test(f)).reduce((n, f) => n + (readFileSync(join(dir, f), "utf8").match(re) ?? []).length, 0)
  const lines = (dir, ext) =>
    walkSources(dir).filter((f) => ext.test(f)).reduce((n, f) => n + readFileSync(join(dir, f), "utf8").split("\n").length, 0)
  const twin = join(pkg, "src-vibe")
  const src = join(pkg, sourceRoot(pkg))
  const anyTs = /\.(?:ts|tsx|mts)$/
  const casts = /\bas unknown as\b|\bas any\b/g
  const suppress = /@ts-(?:ignore|expect-error|nocheck)|eslint-disable/g
  // while (true) is an ordinary loop; only always-taken or never-taken guards count.
  const constant = /\bif\s*\(\s*(?:true|false)\s*\)|\bwhile\s*\(\s*false\s*\)/g
  const vibeLines = lines(twin, /\.vibe$/)
  const hatchLines = lines(twin, anyTs)
  return {
    vibeLines,
    hatchLines,
    hatchShare: vibeLines + hatchLines === 0 ? 0 : Math.round((1000 * hatchLines) / (vibeLines + hatchLines)) / 1000,
    castsAdded: count(twin, casts, /\.(?:vibe|ts|tsx)$/) - count(src, casts, anyTs),
    suppressionsAdded: count(twin, suppress, /\.(?:vibe|ts|tsx)$/) - count(src, suppress, anyTs),
    heldCalls: count(twin, /`\s*\)\s*\(\s*\)/g, /\.vibe$/),
    constantConditionsAdded: count(twin, constant, /\.(?:vibe|ts|tsx)$/) - count(src, constant, anyTs)
  }
}

const apiOk = (api) =>
  api.missingExports.length + api.extraExports.length + api.typeDiffers.length + api.valueDiffers.length + api.errors.length === 0

/** A test name without the run-dependent parts some suites put in it: dates, times, long numbers. */
export const stableName = (name) =>
  name
    .replaceAll(/\b[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4}(?: \([^)]*\))?/g, "<date>")
    .replaceAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "<date>")
    .replaceAll(/\d{6,}/g, "<n>")

/** Results from a JUnit XML report: Bun's `--reporter=junit`. */
export const parseJunit = (xml, pkg) => {
  const tests = [...xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)].map((m) => {
    const attr = (k) => (m[1].match(new RegExp(`\\b${k}="([^"]*)"`)) ?? [])[1] ?? ""
    const body = m[3] ?? ""
    const status = /<(failure|error)\b/.test(body) ? "failed" : /<skipped\b/.test(body) ? "skipped" : "passed"
    return { name: `${relative(pkg, attr("file") || attr("classname"))} > ${attr("name")}`, status }
  })
  return {
    ran: true,
    pass: tests.filter((t) => t.status === "passed").length,
    fail: tests.filter((t) => t.status === "failed").length,
    skip: tests.filter((t) => t.status === "skipped").length,
    failed: tests.filter((t) => t.status === "failed").map((t) => t.name),
    passed: tests.filter((t) => t.status === "passed").map((t) => t.name)
  }
}

/**
 * For a package whose whole suite is too heavy to run twice (apps/app: 17K tests): the test
 * files under the suite's folders whose relative imports reach a twinned module. Both runs
 * use the same files, so the comparison stays like for like.
 */
export const affectedTests = (pkg, folders, twinned, mode = "transitive") => {
  const root = join(pkg, sourceRoot(pkg))
  const strip = (f) => f.replace(/\.(?:ts|tsx|mts|js|mjs)$/, "").replace(/\/index$/, "")
  // Both sides drop /index, or a twinned index module never selects its importers.
  const targets = new Set(twinned.map((rel) => strip(join(root, rel))))
  const files = (dir) => (existsSync(dir) ? (/\.(?:ts|tsx)$/.test(dir) ? [dir] : walk(dir).map((f) => join(dir, f))) : [])
  const imports = new Map()
  // Tests also import their package by name (@smthrs/migrate/flow/Command): resolve those
  // through the package's own exports map, or 23 of migrate's 55 test files go unseen (S2-1).
  const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"))
  const selfExport = (specifier) => {
    if (!manifest.name || (specifier !== manifest.name && !specifier.startsWith(`${manifest.name}/`))) return undefined
    const key = specifier === manifest.name ? "." : `./${specifier.slice(manifest.name.length + 1)}`
    const exportsMap = typeof manifest.exports === "string" ? { ".": manifest.exports } : manifest.exports ?? {}
    const pick = (value) => (typeof value === "string" ? value : value && typeof value === "object" ? pick(value.import ?? value.default ?? value.types) : undefined)
    if (key in exportsMap) return pick(exportsMap[key]) && join(pkg, pick(exportsMap[key]))
    for (const [pattern, value] of Object.entries(exportsMap)) {
      const star = pattern.indexOf("*")
      if (star < 0 || !key.startsWith(pattern.slice(0, star)) || !key.endsWith(pattern.slice(star + 1))) continue
      const target = pick(value)
      if (target === undefined) return undefined
      return join(pkg, target.replace("*", key.slice(star, key.length - (pattern.length - star - 1))))
    }
    return undefined
  }
  const importsOf = (file) => {
    if (!imports.has(file)) {
      const found = []
      if (existsSync(file)) {
        for (const m of readFileSync(file, "utf8").matchAll(/(?:from\s+|import\(\s*)["']([^"']+)["']/g)) {
          const target = m[1].startsWith(".") ? resolve(dirname(file), m[1]) : selfExport(m[1])
          if (target === undefined) continue
          const base = target.replace(/\.(?:ts|tsx|mts|js|mjs)$/, "")
          const real = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find(existsSync)
          if (real) found.push(real)
        }
      }
      imports.set(file, found)
    }
    return imports.get(file)
  }
  // A test is affected when its relative import graph inside the package reaches a twinned module.
  const reaches = (file) => {
    const seen = new Set([file])
    const queue = [file]
    while (queue.length > 0) {
      const next = queue.pop()
      if (next !== file && targets.has(strip(next))) return true
      if (mode === "direct" && next !== file) continue
      for (const dep of importsOf(next)) {
        if (dep.startsWith(pkg) && !seen.has(dep)) {
          seen.add(dep)
          queue.push(dep)
        }
      }
    }
    return false
  }
  return folders.flatMap((folder) => files(join(pkg, folder)))
    .filter((f) => /\.(?:test|spec)\.tsx?$/.test(f))
    .filter(reaches)
    .map((file) => relative(pkg, file))
}

/**
 * Runs a test process with its output in a log file beside the report, not in memory: a large
 * suite's output overflowed spawnSync's buffer and killed it (ENOBUFS, apps/app).
 */
const spawnLogged = (command, args, options, outputFile) => {
  const log = `${outputFile}.log`
  const fd = openSync(log, "w")
  let child
  try {
    // A test run that never ends becomes a result instead of a hang: 20 minutes, then SIGKILL.
    child = spawnSync(command, args, { ...options, stdio: ["ignore", fd, fd], timeout: 20 * 60 * 1000, killSignal: "SIGKILL" })
  } finally {
    closeSync(fd)
  }
  // Keep only the tail: apps/app's suite writes hundreds of megabytes.
  const size = statSync(log).size
  const tail = Buffer.alloc(Math.min(size, 4000))
  const read = openSync(log, "r")
  try {
    readSync(read, tail, 0, tail.length, size - tail.length)
  } finally {
    closeSync(read)
  }
  rmSync(log, { force: true })
  return { ...child, stdout: tail.toString("utf8"), stderr: "" }
}

/** A regular expression source that matches exactly one of these paths. */
export const exactPathPattern = (paths) =>
  `^(?:${paths.map((path) => path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})$`

/** A test process that wrote no report: keep its status, signal and output tail as evidence (F-4). */
const noReport = (child, tool) => ({
  ran: false,
  pass: 0,
  fail: 0,
  skip: 0,
  failed: [`(${tool} wrote no report; exit ${child.signal ?? child.status ?? child.error?.message ?? "unknown"})`],
  status: child.status ?? -1,
  signal: child.signal ?? null,
  error: child.error?.message,
  outputTail: `${child.stdout ?? ""}${child.stderr ?? ""}`.trim().slice(-1500)
})

/** `bun test <args>`, with an optional preload, read from its JUnit report. */
const bunTest = (pkg, args, preload, outputFile) => {
  const argv = ["test", ...(preload ? ["--preload", preload] : []), "--reporter=junit", `--reporter-outfile=${outputFile}`, ...args]
  const child = spawnLogged("bun", argv, { cwd: pkg, env: { ...process.env, CI: "1" } }, outputFile)
  // A bunfig.toml [test.reporter] junit path wins over --reporter-outfile (apps/app, F-1).
  const bunfig = join(pkg, "bunfig.toml")
  const configured = existsSync(bunfig) ? readFileSync(bunfig, "utf8").match(/^\s*junit\s*=\s*"([^"]+)"/m)?.[1] : undefined
  if (!existsSync(outputFile) && configured && existsSync(join(pkg, configured))) renameSync(join(pkg, configured), outputFile)
  return existsSync(outputFile)
    ? { ...parseJunit(readFileSync(outputFile, "utf8"), pkg), status: child.status, signal: child.signal, error: child.error?.message }
    : noReport(child, "bun test")
}

/** `node <flags> --test <files>`, with an optional --import, read from its JUnit report. */
const nodeTest = (pkg, args, register, outputFile) => {
  const argv = [...(register ? ["--import", register] : []), "--test-reporter=junit", `--test-reporter-destination=${outputFile}`, ...args]
  // Suites that spawn `node src/x.ts` reach the twin only if their child processes load the
  // hook too (E-8), so it also goes in NODE_OPTIONS.
  const nodeOptions = register ? [process.env.NODE_OPTIONS, `--import=${register}`].filter(Boolean).join(" ") : process.env.NODE_OPTIONS
  const env = { ...process.env, CI: "1", ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}) }
  const child = spawnLogged(process.execPath, argv, { cwd: pkg, env }, outputFile)
  return existsSync(outputFile)
    ? { ...parseJunit(readFileSync(outputFile, "utf8"), pkg), status: child.status, signal: child.signal, error: child.error?.message }
    : noReport(child, "node --test")
}

/** The package's test runner: Bun for `bun test`, Node for `node ... --test`, else Vitest. */
export const runner = (pkg) => {
  // suites.json names the suite where the package.json test script isn't the package's real
  // suite (PACKAGE.ts declares another, or the script never imports src/).
  const suitesFile = fileURLToPath(new URL("./suites.json", import.meta.url))
  const suites = existsSync(suitesFile) ? JSON.parse(readFileSync(suitesFile, "utf8")) : {}
  const declared = suites[relative(root, pkg)]
  if (declared) {
    // A package whose folders use different runners (.smithers/flows: node:test and bun:test,
    // E-9) lists several suites; their results are merged.
    const suites = (declared.suites ?? [declared]).map((suite) => ({ kind: suite.kind, args: suite.args ?? [] }))
    return { ...suites[0], suites, affectedOnly: declared.affectedOnly, unverifiable: declared.unverifiable ? declared.why : undefined }
  }
  const script = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).scripts?.test ?? ""
  const words = (text) => text.trim().split(/\s+/).filter(Boolean)
  const bunArgs = script.match(/\bbun test\b(.*)$/)
  if (bunArgs) return { kind: "bun", args: words(bunArgs[1]) }
  const nodeArgs = script.match(/^\s*node\s+(.*--test\b.*)$/)
  if (nodeArgs) return { kind: "node", args: words(nodeArgs[1]) }
  return { kind: "vitest" }
}

/**
 * One harness run per package at a time (E-10): concurrent runs share .vibe-twin/ and would
 * overwrite each other's reports. A lock left by a dead process is taken over.
 */
const withLock = (pkg, body) => {
  const lock = join(pkg, ".vibe-twin.lock")
  const deadline = Date.now() + 30 * 60 * 1000
  for (;;) {
    try {
      mkdirSync(lock)
      writeFileSync(join(lock, "pid"), String(process.pid))
      break
    } catch {
      // The holder writes its pid just after mkdir: a lock without one is being taken right now,
      // unless it is old (its holder died between the two steps). E-10 recurred through that gap.
      const pidFile = join(lock, "pid")
      const holder = Number(existsSync(pidFile) ? readFileSync(pidFile, "utf8") : 0)
      let alive = false
      try {
        alive = holder > 0 ? process.kill(holder, 0) : Date.now() - statSync(lock).mtimeMs < 30_000
      } catch {
        alive = false
      }
      if (!alive) {
        rmSync(lock, { recursive: true, force: true })
        continue
      }
      if (Date.now() > deadline) throw new Error(`${pkg}: another harness run (pid ${holder}) holds ${lock}`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000)
    }
  }
  try {
    return body()
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

export const run = (pkgArg) => withLock(resolve(pkgArg), () => runUnlocked(pkgArg))

const runUnlocked = (pkgArg) => {
  const pkg = resolve(pkgArg)
  if (!existsSync(join(pkg, "src-vibe"))) throw new Error(`${pkg}: no src-vibe/ twin`)
  const work = join(pkg, ".vibe-twin")
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })

  tsconfig(pkg, join(work, "tsconfig.twin.json"), {
    ...common,
    rootDir: relative(work, repoRoot(pkg)) || ".",
    rootDirs: [join("..", sourceRoot(pkg)), "../src-vibe"],
    outDir: "out",
    declaration: true,
    emitDeclarationOnly: false,
    allowImportingTsExtensions: true,
    rewriteRelativeImportExtensions: true,
    sourceMap: true
  }, ["../src-vibe/**/*"])
  // The module list is explicit: tests, configs and test folders are not API modules.
  // rootDir is the repository root: with the package's src as rootDir, declarations of the
  // sibling-package sources the program imports resolve outside outDir, and tsc wrote 360 of
  // them into other packages' src/. ts-dts links to this package's subtree.
  tsconfig(pkg, join(work, "tsconfig.ts.json"), {
    ...common,
    rootDir: relative(work, repoRoot(pkg)) || ".",
    outDir: "ts-dts-root",
    declaration: true,
    emitDeclarationOnly: true
  }, srcModules(pkg).map(({ file }) => relative(work, file)))
  const compiled = compile(join(work, "tsconfig.twin.json"), pkg)
  const split = splitTwinErrors(compiled.errors)
  const twin = { ...compiled, errors: split.twin, typescriptErrors: split.typescript }
  const twinned = linkPartialTwin(pkg, work)
  for (const dir of ["ts-dts", "ts-dts-root"]) rmSync(join(work, dir), { recursive: true, force: true })
  const ts = compile(join(work, "tsconfig.ts.json"), pkg)
  const ownDts = join(work, "ts-dts-root", relative(repoRoot(pkg), join(pkg, sourceRoot(pkg))))
  mkdirSync(ownDts, { recursive: true })
  symlinkSync(ownDts, join(work, "ts-dts"), "dir")
  const missingOutputs = twinned.flatMap((rel) => ["js", "d.ts"].map((ext) => join(twinOutDir(pkg), `${rel}.${ext}`))).filter((file) => !existsSync(file))
  const missingDeclarations = srcModules(pkg).map(({ rel }) => join(work, "ts-dts", `${rel}.d.ts`)).filter((file) => !existsSync(file))
  // C-3: a VibeLang error in unchanged TypeScript exits non-zero but is a finding; a crash
  // or a missing output is not.
  // TypeScript itself emits no .d.ts for some modules (E-6: an exported anonymous class with
  // private fields). Their API can't be compared; the tests still run, and the receipt lists them.
  const compileOk = !compiled.crash && !ts.crash && missingOutputs.length === 0

  const api = apiCheck(pkg, work, twinned)

  const baseConfig = ["vitest.config.ts", "vitest.config.mts", "vitest.config.js", "vitest.config.mjs"]
    .map((f) => join(pkg, f)).find(existsSync)
  const config = join(work, "vitest.twin.config.mjs")
  writeFileSync(
    config,
    `import { mergeConfig } from "vitest/config"
import { fallbackFor, twinFor } from ${JSON.stringify(fileURLToPath(import.meta.url))}
${baseConfig ? `import base from ${JSON.stringify(baseConfig)}` : "const base = {}"}
const pkg = ${JSON.stringify(pkg)}
export default mergeConfig(base, {
  root: pkg,
  plugins: [{
    name: "vibe-twin",
    enforce: "pre",
    async resolveId(source, importer, options) {
      // Any importer outside node_modules gets the twin: a package's tests may live beside it
      // (.smithers/flows/coding is tested from .smithers/flows/test).
      if (!importer || importer.includes("/node_modules/")) return null
      if (importer.includes("/.vibe-twin/out/")) return fallbackFor(source, importer, pkg) ?? null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      return resolved && twinFor(resolved.id, pkg) ? twinFor(resolved.id, pkg) : null
    }
  }],
  test: { coverage: { enabled: false } }
})
`
  )
  const tests = runner(pkg)
  const suiteList = tests.suites ?? [tests]
  const preload = join(work, "bun-preload.mjs")
  if (suiteList.some((suite) => suite.kind === "bun")) {
    writeFileSync(
      preload,
      `import { plugin } from "bun"
// Each twinned src/ file loads as a re-export of its twin. mock.module snapshotted a twin's
// exports while an import cycle back through its src/ path was still evaluating it, so later
// exports were missing (apps/app); an ES re-export keeps live bindings, so cycles resolve.
const twins = new Map(${JSON.stringify(twinned.map((rel) => {
        const src = ["ts", "tsx", "mts"].map((x) => join(pkg, sourceRoot(pkg), `${rel}.${x}`)).find(existsSync)
        const hasDefault = src !== undefined && /^\s*export\s+default\b/m.test(readFileSync(src, "utf8"))
        return [src, { twin: join(twinOutDir(pkg), `${rel}.js`), hasDefault }]
      }).filter(([src]) => src !== undefined))})
plugin({
  name: "vibe-twin",
  setup(build) {
    if (twins.size === 0) return
    build.onLoad({ filter: new RegExp(${JSON.stringify(exactPathPattern(twinned.map((rel) => ["ts", "tsx", "mts"].map((x) => join(pkg, sourceRoot(pkg), `${rel}.${x}`)).find(existsSync)).filter(Boolean)))}) }, (args) => {
      const { twin, hasDefault } = twins.get(args.path)
      const from = JSON.stringify(twin)
      return { contents: \`export * from \${from}\\n\${hasDefault ? \`export { default } from \${from}\\n\` : ""}\`, loader: "js" }
    })
  }
})
`
    )
  }
  const register = join(work, "node-register.mjs")
  if (suiteList.some((suite) => suite.kind === "node")) {
    // module.registerHooks runs in-thread and prints nothing; module.register is deprecated in
    // Node 26 and writes DEP0205 to stderr, which changes what subprocess tests see (E-11).
    writeFileSync(register, `import { registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { fallbackFor, twinFor } from ${JSON.stringify(fileURLToPath(import.meta.url))}
const pkg = ${JSON.stringify(pkg)}
registerHooks({
  resolve(specifier, context, next) {
    const parent = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL) : undefined
    if (parent === undefined) {
      // An entry point, such as a spawned node src/x.ts: run its twin instead.
      const resolved = next(specifier, context)
      const twin = resolved.url.startsWith("file:") ? twinFor(fileURLToPath(resolved.url), pkg) : undefined
      return twin ? { ...resolved, url: pathToFileURL(twin).href, shortCircuit: true } : resolved
    }
    if (parent.includes("/node_modules/")) return next(specifier, context)
    if (parent.includes("/.vibe-twin/out/")) {
      const fallback = fallbackFor(specifier, parent, pkg)
      return fallback ? next(pathToFileURL(fallback).href, context) : next(specifier, context)
    }
    const resolved = next(specifier, context)
    const twin = resolved.url.startsWith("file:") ? twinFor(fileURLToPath(resolved.url), pkg) : undefined
    return twin ? { ...resolved, url: pathToFileURL(twin).href, shortCircuit: true } : resolved
  }
})
`)
  }
  if (tests.affectedOnly) {
    tests.affected = 0
    for (const suite of suiteList) {
      const files = affectedTests(pkg, suite.args.filter((a) => !a.startsWith("-")), twinned, tests.affectedOnly === "direct" ? "direct" : "transitive")
      suite.args = [...suite.args.filter((a) => a.startsWith("-")), ...files]
      tests.affected += files.length
    }
  }
  const notRun = { ran: false, pass: 0, fail: 0, skip: 0, failed: [] }
  const runSuite = (suite, i, twinRun) => {
    // An affected subset with no files would run the whole heavy suite: run nothing instead.
    if (tests.affectedOnly && suite.args.filter((a) => !a.startsWith("-")).length === 0) {
      return { ran: false, pass: 0, fail: 0, skip: 0, failed: ["(no affected tests yet: twin a module that tests import)"], passed: [], status: -1 }
    }
    const out = join(work, `${twinRun ? "vibe" : "ts"}-${i}.${suite.kind === "vitest" ? "json" : "xml"}`)
    return suite.kind === "bun"
      ? bunTest(pkg, suite.args, twinRun ? preload : undefined, out)
      : suite.kind === "node"
      ? nodeTest(pkg, suite.args, twinRun ? register : undefined, out)
      : vitest(pkg, twinRun ? config : undefined, out, suite.args)
  }
  const merge = (results) => ({
    ran: results.every((r) => r.ran),
    pass: results.reduce((n, r) => n + r.pass, 0),
    fail: results.reduce((n, r) => n + r.fail, 0),
    skip: results.reduce((n, r) => n + r.skip, 0),
    failed: results.flatMap((r) => r.failed ?? []),
    passed: results.flatMap((r) => r.passed ?? []),
    // A run without a status (no report, no process) is not a clean exit (F-4).
    status: results.find((r) => r.status !== 0)?.status ?? 0,
    signal: results.find((r) => r.signal)?.signal ?? null,
    error: results.find((r) => r.error)?.error
  })
  const baseline = merge(suiteList.map((suite, i) => runSuite(suite, i, false)))
  const vibe = !compileOk || twin.errors.length > 0 ? notRun : merge(suiteList.map((suite, i) => runSuite(suite, i, true)))
  // A regression is a test that passed on the TypeScript and did not pass on the
  // twin: it failed, or its file never loaded (Bun's JUnit report omits those).
  // The B-1 workaround (a held tagged template called by hand) hides a VibeLang bug: it fails.
  const { heldCalls, constantConditionsAdded } = quality(pkg)
  const vibePassed = new Set((vibe.passed ?? []).map(stableName))
  const regressions = (baseline.passed ?? []).filter((name) => !vibePassed.has(stableName(name)))
  // A twin's unhandled rejection can fail the process while every test passes (guardian-review):
  // the twin's test process must exit no worse than the TypeScript's.
  if (vibe.ran && (vibe.signal || vibe.error || (vibe.status !== 0 && baseline.status === 0))) {
    regressions.push(`(the twin's test process exited ${vibe.signal ?? vibe.error ?? vibe.status}; the TypeScript's exited ${baseline.signal ?? baseline.status})`)
  }
  const receipt = {
    package: relative(root, pkg),
    runner: tests.kind,
    affectedTestFiles: tests.affected,
    ...(tests.affectedOnly ? { suiteSubset: `${tests.affectedOnly} importers of twinned modules; the full suite still needs one run before cutover` } : {}),
    twinFiles: walk(join(pkg, "src-vibe")).length,
    compile: { twinStatus: compiled.status, tsStatus: ts.status, missingOutputs, missingDeclarations, twinErrors: twin.errors, twinWarnings: twin.warnings, vibelangErrorsInTypeScript: twin.typescriptErrors, tsErrors: ts.errors.length },
    api,
    tests: { ts: { ...baseline, failed: undefined, passed: undefined }, vibe: { ...vibe, failed: undefined, passed: undefined } },
    regressions,
    // A twinned module whose API could be compared neither by declaration nor by source.
    unverifiableApi: twinned.filter((rel) => !existsSync(join(work, "ts-dts", `${rel}.d.ts`)) && !(api.sourceChecked ?? []).includes(rel)).map((rel) => `${rel}.d.ts`),
    quality: quality(pkg),
    unverifiable: tests.unverifiable,
    ok: tests.unverifiable === undefined && compileOk && twin.errors.length === 0 && apiOk(api) && baseline.ran && baseline.pass > 0 && !baseline.signal && !baseline.error && vibe.ran
      && regressions.length === 0 && vibe.pass >= baseline.pass && heldCalls === 0 && constantConditionsAdded <= 0,
    complete: false
  }
  // W46 covers the Effect code: a module that never imports effect may stay TypeScript.
  // Completeness counts source modules, not declarations: a module TypeScript can't declare
  // (no .d.ts) must still have a twin (E-6, lane E: 14 such modules in .smithers/flows).
  const twinnedSet = new Set(twinned)
  // A React component stays .tsx: VibeLang has no JSX, and components call their .vibe logic
  // through its TypeScript API (D63; effectscript-4a d-q7gqcv, finding F-5).
  const isComponent = (file) => file.endsWith(".tsx") && /<[A-Za-z][\w.]*[\s/>]|<\/|<>/.test(readFileSync(file, "utf8"))
  receipt.api.missingEffectModules = srcModules(pkg)
    .filter(({ rel, file }) => !twinnedSet.has(rel) && !isComponent(file) && /from\s+["'](?:effect|@effect\/)/.test(readFileSync(file, "utf8")))
    .map(({ rel }) => `${rel}.d.ts`)
  receipt.api.componentsOutOfScope = srcModules(pkg).filter(({ rel, file }) => !twinnedSet.has(rel) && isComponent(file)).length
  // A suite whose own process fails (an unhandled rejection, a crash) verifies nothing, even
  // when the twin matches it (guardian-review): COMPLETE needs a clean TypeScript run.
  receipt.baselineClean = baseline.ran && baseline.status === 0 && !baseline.signal && !baseline.error
  receipt.complete = receipt.ok && receipt.baselineClean && receipt.api.missingEffectModules.length === 0 && receipt.unverifiableApi.length === 0
  writeFileSync(join(work, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n")
  return receipt
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const receipt = run(args.find((a) => !a.startsWith("--")) ?? ".")
  if (args.includes("--json")) process.stdout.write(JSON.stringify(receipt, null, 2) + "\n")
  else {
    const t = receipt.tests
    process.stdout.write(
      [
        `${receipt.package}: ${receipt.unverifiable ? `UNVERIFIABLE (${receipt.unverifiable})` : receipt.complete ? "COMPLETE" : !receipt.ok ? "NOT OK" : !receipt.baselineClean ? "OK (baseline not clean: the TypeScript suite's own process failed)" : "OK (partial)"}`,
        `  compile: ${receipt.compile.twinErrors.length} errors, ${receipt.compile.twinWarnings.length} warnings, ${receipt.compile.vibelangErrorsInTypeScript.length} VibeLang errors in unchanged TypeScript (findings, not blocking)`,
        ...receipt.compile.vibelangErrorsInTypeScript.slice(0, 5).map((e) => `  finding: ${e}`),
        `  api: ${receipt.api.modules} modules twinned (${receipt.api.identicalFiles} with identical .d.ts), ${receipt.api.missingEffectModules.length} Effect modules not yet (${receipt.api.missingModules.length} in all), ${receipt.api.checked} type checks`,
        `  quality: ${receipt.quality.vibeLines} VibeLang lines, hatch share ${receipt.quality.hatchShare}, casts added ${receipt.quality.castsAdded}, suppressions added ${receipt.quality.suppressionsAdded}${receipt.quality.heldCalls ? `, ${receipt.quality.heldCalls} held-template calls (B-1 workaround)` : ""}${receipt.quality.constantConditionsAdded > 0 ? `, ${receipt.quality.constantConditionsAdded} constant conditions added (an unrestored mutation?)` : ""}`,
        `  tests: ts ${t.ts.pass} pass ${t.ts.fail} fail ${t.ts.skip} skip | vibe ${t.vibe.pass} pass ${t.vibe.fail} fail ${t.vibe.skip} skip`,
        ...receipt.compile.twinErrors.slice(0, 20).map((e) => `  ${e}`),
        ...["missingExports", "extraExports", "typeDiffers", "valueDiffers", "errors"].flatMap((k) =>
          receipt.api[k].slice(0, 30).map((x) => `  api ${k}: ${x}`)
        ),
        ...receipt.regressions.slice(0, 40).map((r) => `  regression: ${r}`)
      ].join("\n") + "\n"
    )
  }
  process.exit(receipt.complete ? 0 : receipt.ok ? 3 : 1)
}
