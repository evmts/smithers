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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)))

/** Relative import extensions differ by design (.vibe and .ts both emit .js). */
export const normalizeDts = (text) =>
  text
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
  for (const name of new Set([...tsLocals.keys(), ...vbLocals.keys()])) {
    if (!new RegExp(`(?<![\\w$.])${name.replaceAll("$", "\\$")}(?![\\w$])`).test(exportText)) continue
    if (tsLocals.get(name) !== vbLocals.get(name)) return false
  }
  return true
}

export const parseDts = (text) => {
  const byName = new Map()
  for (const statement of statementsOf(text)) {
    const body = bodyOf(statement)
    if (!body.startsWith("export ") || /^export \{\s*\};?$/.test(body)) continue
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

/** The twin's compiled module for a resolved `src/` file, or undefined. */
export const twinFor = (resolved, pkg) => {
  const file = resolved.split("?")[0]
  const src = join(pkg, sourceRoot(pkg)) + sep
  if (!file.startsWith(src) || !/\.(?:ts|tsx|mts)$/.test(file) || file.endsWith(".d.ts")) return undefined
  const rel = file.slice(src.length).replace(/\.(?:ts|tsx|mts)$/, "")
  if (!twinModules(pkg).has(rel)) return undefined
  return join(pkg, ".vibe-twin", "out", "src-vibe", `${rel}.js`)
}

/** The src/ modules (relative, no extension) that have a real twin; a stub is not one. */
const twinModules = (pkg) => {
  const manifest = join(pkg, ".vibe-twin", "out", "src-vibe", MANIFEST)
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
  const out = join(work, "out", "src-vibe")
  const twinned = srcModules(pkg).filter(({ rel }) =>
    ["vibe", "ts", "tsx"].some((x) => existsSync(join(pkg, "src-vibe", `${rel}.${x}`)))
  )
  const names = new Set(twinned.map(({ rel }) => rel))
  mkdirSync(out, { recursive: true })
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
  const twinRoot = join(pkg, ".vibe-twin", "out", "src-vibe") + sep
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

/** Folders that never hold API modules, skipped in a flat package. */
const notSources = new Set(["node_modules", "test", "tests", "e2e", "fixtures", "__tests__", "dist", "src-vibe", ".vibe-twin", "scripts"])

/** Every file under a source root, without the folders that are never sources. */
const walkSources = (dir, base = dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? (e.name.startsWith(".") || notSources.has(e.name) ? [] : walkSources(join(dir, e.name), base))
        : [relative(base, join(dir, e.name))]
    )
    : []

/** A module file: TypeScript, not a declaration, test or config. */
const isModule = (rel) =>
  /\.(?:ts|tsx|mts)$/.test(rel) && !/\.d\.ts$|\.(?:test|spec)\.tsx?$|(?:^|\/)__tests__\/|(?:^|\/)[\w.-]+\.config\.[cm]?ts$|^PACKAGE\.ts$/.test(rel)

/** A tool from the package's own node_modules, else the workspace root's. */
const bin = (pkg, name) => [join(pkg, "node_modules", ".bin", name), join(root, "node_modules", ".bin", name)].find(existsSync)

const tsconfig = (pkg, file, compilerOptions, include, exclude = []) => {
  const base = existsSync(join(pkg, "tsconfig.json")) ? "../tsconfig.json" : undefined
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
  // package that isn't twinned yet is a plain call (no EK4401) whose exceptions are defects.
  get vibelang() {
    return atLeast([0, 0, 2]) ? { trustedPackages: ["@smthrs/*", "@smithers/*"] } : undefined
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
  const inTypeScript = (line) => /^(?!src-vibe\/|\.vibe-twin\/)[^(]*\.(?:ts|tsx|mts)\(\d+,\d+\)/.test(line)
  return { twin: errors.filter((l) => !inTypeScript(l)), typescript: errors.filter(inTypeScript) }
}

const vitest = (pkg, config, outputFile) => {
  const args = ["run", "--root", pkg, "--reporter=json", `--outputFile=${outputFile}`, "--coverage.enabled=false"]
  if (config) args.push("--config", config)
  const vitestBin = bin(pkg, "vitest")
  if (!vitestBin) return { ran: false, pass: 0, fail: 0, skip: 0, failed: ["(no vitest in the package or the root)"] }
  const child = spawnSync(vitestBin, args, { cwd: pkg, encoding: "utf8", env: { ...process.env, CI: "1" }, maxBuffer: 64 * 1024 * 1024 })
  if (!existsSync(outputFile)) return { ran: false, pass: 0, fail: 0, skip: 0, failed: [] }
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

const NOMINAL = [
  "Two different types with this name exist, but they are unrelated",
  "separate declarations of a private property",
  "separate declarations of a protected property"
]

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
  const { output } = compile(join(work, "tsconfig.detail.json"), pkg)
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
  // No error either way: the two types are mutually assignable. Identity (Eq) is stricter
  // than any caller can observe (optional vs undefined, overload order); that is equivalent.
  return new Map(failed.map(([l]) => {
    const text = (blocks.get(l) ?? []).join("\n")
    const kind = text === "" ? "assignable"
      : NOMINAL.some((phrase) => text.includes(phrase)) || sameNamedPair(pkg, work, text) ? "nominal"
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
  if (pairs.length === 0 || !/unique symbol|private|protected/.test(text)) return false
  return pairs.every(([rel, name]) => {
    const read = (dir) => existsSync(join(dir, `${rel}.d.ts`)) ? parseDts(readFileSync(join(dir, `${rel}.d.ts`), "utf8")) : []
    const a = read(join(work, "ts-dts")).find((e) => e.name === name)
    const b = read(join(work, "out", "src-vibe")).find((e) => e.name === name)
    return a !== undefined && b !== undefined && normalizeDts(a.text) === normalizeDts(b.text)
  })
}

/**
 * Compares the API of every module that src/ and the twin both declare. Export
 * names must match. A type declaration must keep its text or, when it is not
 * generic, be the identical type. A value's type, and a class's constructor and
 * instance types, must be identical (checked by the compiler).
 */
const apiCheck = (pkg, work) => {
  const twinOut = join(work, "out", "src-vibe")
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
      if (normalizeDts(e.text) === normalizeDts(v.text) && (sameLocals || e.kind === "reexport")) continue
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
 * tagged template called by hand, which the rules forbid.
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
  const vibeLines = lines(twin, /\.vibe$/)
  const hatchLines = lines(twin, anyTs)
  return {
    vibeLines,
    hatchLines,
    hatchShare: vibeLines + hatchLines === 0 ? 0 : Math.round((1000 * hatchLines) / (vibeLines + hatchLines)) / 1000,
    castsAdded: count(twin, casts, /\.(?:vibe|ts|tsx)$/) - count(src, casts, anyTs),
    suppressionsAdded: count(twin, suppress, /\.(?:vibe|ts|tsx)$/) - count(src, suppress, anyTs),
    heldCalls: count(twin, /`\s*\)\s*\(\s*\)/g, /\.vibe$/)
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

/** `bun test <args>`, with an optional preload, read from its JUnit report. */
const bunTest = (pkg, args, preload, outputFile) => {
  const argv = ["test", ...(preload ? ["--preload", preload] : []), "--reporter=junit", `--reporter-outfile=${outputFile}`, ...args]
  const child = spawnSync("bun", argv, { cwd: pkg, encoding: "utf8", env: { ...process.env, CI: "1" }, maxBuffer: 64 * 1024 * 1024 })
  return existsSync(outputFile)
    ? { ...parseJunit(readFileSync(outputFile, "utf8"), pkg), status: child.status, signal: child.signal, error: child.error?.message }
    : { ran: false, pass: 0, fail: 0, skip: 0, failed: ["(bun test wrote no report)"] }
}

/** `node <flags> --test <files>`, with an optional --import, read from its JUnit report. */
const nodeTest = (pkg, args, register, outputFile) => {
  const argv = [...(register ? ["--import", register] : []), "--test-reporter=junit", `--test-reporter-destination=${outputFile}`, ...args]
  // Suites that spawn `node src/x.ts` reach the twin only if their child processes load the
  // hook too (E-8), so it also goes in NODE_OPTIONS.
  const nodeOptions = register ? [process.env.NODE_OPTIONS, `--import=${register}`].filter(Boolean).join(" ") : process.env.NODE_OPTIONS
  const env = { ...process.env, CI: "1", ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}) }
  const child = spawnSync(process.execPath, argv, { cwd: pkg, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 })
  return existsSync(outputFile)
    ? { ...parseJunit(readFileSync(outputFile, "utf8"), pkg), status: child.status, signal: child.signal, error: child.error?.message }
    : { ran: false, pass: 0, fail: 0, skip: 0, failed: ["(node --test wrote no report)"] }
}

/** The package's test runner: Bun for `bun test`, Node for `node ... --test`, else Vitest. */
export const runner = (pkg) => {
  // suites.json names the suite where the package.json test script isn't the package's real
  // suite (PACKAGE.ts declares another, or the script never imports src/).
  const suitesFile = fileURLToPath(new URL("./suites.json", import.meta.url))
  const suites = existsSync(suitesFile) ? JSON.parse(readFileSync(suitesFile, "utf8")) : {}
  const declared = suites[relative(root, pkg)]
  if (declared) return { kind: declared.kind, args: declared.args, unverifiable: declared.unverifiable ? declared.why : undefined }
  const script = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).scripts?.test ?? ""
  const words = (text) => text.trim().split(/\s+/).filter(Boolean)
  const bunArgs = script.match(/\bbun test\b(.*)$/)
  if (bunArgs) return { kind: "bun", args: words(bunArgs[1]) }
  const nodeArgs = script.match(/^\s*node\s+(.*--test\b.*)$/)
  if (nodeArgs) return { kind: "node", args: words(nodeArgs[1]) }
  return { kind: "vitest" }
}

export const run = (pkgArg) => {
  const pkg = resolve(pkgArg)
  if (!existsSync(join(pkg, "src-vibe"))) throw new Error(`${pkg}: no src-vibe/ twin`)
  const work = join(pkg, ".vibe-twin")
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })

  tsconfig(pkg, join(work, "tsconfig.twin.json"), {
    ...common,
    rootDir: "..",
    rootDirs: [join("..", sourceRoot(pkg)), "../src-vibe"],
    outDir: "out",
    declaration: true,
    emitDeclarationOnly: false,
    allowImportingTsExtensions: true,
    rewriteRelativeImportExtensions: true,
    sourceMap: true
  }, ["../src-vibe/**/*"])
  // The module list is explicit: tests, configs and test folders are not API modules.
  tsconfig(pkg, join(work, "tsconfig.ts.json"), {
    ...common,
    rootDir: join("..", sourceRoot(pkg)),
    outDir: "ts-dts",
    declaration: true,
    emitDeclarationOnly: true
  }, srcModules(pkg).map(({ file }) => relative(work, file)))
  const compiled = compile(join(work, "tsconfig.twin.json"), pkg)
  const split = splitTwinErrors(compiled.errors)
  const twin = { ...compiled, errors: split.twin, typescriptErrors: split.typescript }
  const twinned = linkPartialTwin(pkg, work)
  const ts = compile(join(work, "tsconfig.ts.json"), pkg)
  const missingOutputs = twinned.flatMap((rel) => ["js", "d.ts"].map((ext) => join(work, "out", "src-vibe", `${rel}.${ext}`))).filter((file) => !existsSync(file))
  const missingDeclarations = srcModules(pkg).map(({ rel }) => join(work, "ts-dts", `${rel}.d.ts`)).filter((file) => !existsSync(file))
  // C-3: a VibeLang error in unchanged TypeScript exits non-zero but is a finding; a crash
  // or a missing output is not.
  // TypeScript itself emits no .d.ts for some modules (E-6: an exported anonymous class with
  // private fields). Their API can't be compared; the tests still run, and the receipt lists them.
  const compileOk = !compiled.crash && !ts.crash && missingOutputs.length === 0

  const api = apiCheck(pkg, work)

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
      if (!importer || importer.includes("/node_modules/") || !importer.startsWith(pkg)) return null
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
  const preload = join(work, "bun-preload.mjs")
  if (tests.kind === "bun") {
    writeFileSync(
      preload,
      `import { mock } from "bun:test"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const pairs = ${JSON.stringify(twinned.map((rel) => [
        ["ts", "tsx", "mts"].map((x) => join(pkg, sourceRoot(pkg), `${rel}.${x}`)).find(existsSync),
        join(work, "out", "src-vibe", `${rel}.js`)
      ]))}
for (const [src, twin] of pairs) mock.module(src, () => require(twin))
`
    )
  }
  const register = join(work, "node-register.mjs")
  if (tests.kind === "node") {
    writeFileSync(join(work, "node-hooks.mjs"), `import { fileURLToPath, pathToFileURL } from "node:url"
import { fallbackFor, twinFor } from ${JSON.stringify(fileURLToPath(import.meta.url))}
const pkg = ${JSON.stringify(pkg)}
export async function resolve(specifier, context, next) {
  const parent = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL) : undefined
  if (parent === undefined) {
    // An entry point, such as a spawned \`node src/x.ts\`: run its twin instead.
    const resolved = await next(specifier, context)
    const twin = resolved.url.startsWith("file:") ? twinFor(fileURLToPath(resolved.url), pkg) : undefined
    return twin ? { ...resolved, url: pathToFileURL(twin).href, shortCircuit: true } : resolved
  }
  if (!parent.startsWith(pkg) || parent.includes("/node_modules/")) return next(specifier, context)
  if (parent.includes("/.vibe-twin/out/")) {
    const fallback = fallbackFor(specifier, parent, pkg)
    return fallback ? next(pathToFileURL(fallback).href, context) : next(specifier, context)
  }
  const resolved = await next(specifier, context)
  const twin = resolved.url.startsWith("file:") ? twinFor(fileURLToPath(resolved.url), pkg) : undefined
  return twin ? { ...resolved, url: pathToFileURL(twin).href, shortCircuit: true } : resolved
}
`)
    writeFileSync(register, `import { register } from "node:module"\nregister(${JSON.stringify(pathToFileURL(join(work, "node-hooks.mjs")).href)})\n`)
  }
  const notRun = { ran: false, pass: 0, fail: 0, skip: 0, failed: [] }
  const baseline = tests.kind === "bun"
    ? bunTest(pkg, tests.args, undefined, join(work, "ts.xml"))
    : tests.kind === "node"
    ? nodeTest(pkg, tests.args, undefined, join(work, "ts.xml"))
    : vitest(pkg, undefined, join(work, "ts.json"))
  const vibe = !compileOk || twin.errors.length > 0
    ? notRun
    : tests.kind === "bun"
    ? bunTest(pkg, tests.args, preload, join(work, "vibe.xml"))
    : tests.kind === "node"
    ? nodeTest(pkg, tests.args, register, join(work, "vibe.xml"))
    : vitest(pkg, config, join(work, "vibe.json"))
  // A regression is a test that passed on the TypeScript and did not pass on the
  // twin: it failed, or its file never loaded (Bun's JUnit report omits those).
  // The B-1 workaround (a held tagged template called by hand) hides a VibeLang bug: it fails.
  const heldCalls = quality(pkg).heldCalls
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
    twinFiles: walk(join(pkg, "src-vibe")).length,
    compile: { twinStatus: compiled.status, tsStatus: ts.status, missingOutputs, missingDeclarations, twinErrors: twin.errors, twinWarnings: twin.warnings, vibelangErrorsInTypeScript: twin.typescriptErrors, tsErrors: ts.errors.length },
    api,
    tests: { ts: { ...baseline, failed: undefined, passed: undefined }, vibe: { ...vibe, failed: undefined, passed: undefined } },
    regressions,
    unverifiableApi: missingDeclarations.map((file) => relative(join(work, "ts-dts"), file)),
    quality: quality(pkg),
    unverifiable: tests.unverifiable,
    ok: tests.unverifiable === undefined && compileOk && twin.errors.length === 0 && apiOk(api) && baseline.ran && baseline.pass > 0 && !baseline.signal && !baseline.error && vibe.ran
      && regressions.length === 0 && vibe.pass >= baseline.pass && heldCalls === 0,
    complete: false
  }
  // W46 covers the Effect code: a module that never imports effect may stay TypeScript.
  const importsEffect = (dts) => {
    const mod = dts.replace(/\.d\.ts$/, "")
    const file = ["ts", "tsx", "mts"].map((x) => join(pkg, sourceRoot(pkg), `${mod}.${x}`)).find(existsSync)
    return file !== undefined && /from\s+["'](?:effect|@effect\/)/.test(readFileSync(file, "utf8"))
  }
  receipt.api.missingEffectModules = api.missingModules.filter(importsEffect)
  // A suite whose own process fails (an unhandled rejection, a crash) verifies nothing, even
  // when the twin matches it (guardian-review): COMPLETE needs a clean TypeScript run.
  receipt.baselineClean = baseline.ran && baseline.status === 0 && !baseline.signal && !baseline.error
  receipt.complete = receipt.ok && receipt.baselineClean && receipt.api.missingEffectModules.length === 0
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
        `  quality: ${receipt.quality.vibeLines} VibeLang lines, hatch share ${receipt.quality.hatchShare}, casts added ${receipt.quality.castsAdded}, suppressions added ${receipt.quality.suppressionsAdded}${receipt.quality.heldCalls ? `, ${receipt.quality.heldCalls} held-template calls (B-1 workaround)` : ""}`,
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
