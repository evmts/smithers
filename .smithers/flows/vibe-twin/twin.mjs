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
import { fileURLToPath } from "node:url"

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
export const parseDts = (text) => {
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
  const byName = new Map()
  for (const statement of statements.map((s) => s.trim()).filter(Boolean)) {
    const body = statement.replace(/^(?:\/\*[\s\S]*?\*\/\s*)+/, "")
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
  const src = join(pkg, "src") + sep
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
  walk(join(pkg, "src"))
    .filter((f) => /\.(?:ts|tsx|mts)$/.test(f) && !/\.d\.ts$|\.(?:test|spec)\.tsx?$|(?:^|\/)__tests__\//.test(f))
    .map((f) => ({ rel: f.replace(/\.(?:ts|tsx|mts)$/, ""), file: join(pkg, "src", f) }))

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
  if ([target, `${base}.js`, join(target, "index.js")].some((f) => f.startsWith(twinRoot) && existsSync(f))) return undefined
  const rel = base.slice(twinRoot.length)
  return [".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"].map((x) => join(pkg, "src", rel + x)).find(existsSync)
}

const walk = (dir, base = dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name))]
    )
    : []

/** A tool from the package's own node_modules, else the workspace root's. */
const bin = (pkg, name) => [join(pkg, "node_modules", ".bin", name), join(root, "node_modules", ".bin", name)].find(existsSync)

const tsconfig = (pkg, file, compilerOptions, include, exclude = []) => {
  const base = existsSync(join(pkg, "tsconfig.json")) ? "../tsconfig.json" : undefined
  writeFileSync(
    file,
    JSON.stringify({ ...(base ? { extends: base } : {}), compilerOptions, include, exclude }, null, 2) + "\n"
  )
}

/** Tests colocated in src/ are not modules of the API (apps/server keeps its tests there). */
const testGlobs = ["../src/**/*.test.ts", "../src/**/*.test.tsx", "../src/**/*.spec.ts", "../src/**/__tests__/**"]

const common = {
  noEmit: false,
  noEmitOnError: false,
  composite: false,
  incremental: false,
  declarationMap: false,
  plugins: []
}

/** vibelang -p, returning its diagnostics split by category. */
const compile = (project, cwd) => {
  const run = spawnSync(process.execPath, [join(root, "node_modules/vibelang/bin/vibelang"), "-p", project, "--pretty", "false"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  })
  const lines = `${run.stdout}${run.stderr}`.split("\n")
  const errors = lines.filter((l) => /\berror (?:TS|EK)\d+:/.test(l))
  const warnings = lines.filter((l) => /\bwarning (?:TS|EK)\d+:/.test(l))
  return { status: run.status, errors, warnings }
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
  spawnSync(vitestBin, args, { cwd: pkg, encoding: "utf8", env: { ...process.env, CI: "1" }, maxBuffer: 64 * 1024 * 1024 })
  if (!existsSync(outputFile)) return { ran: false, pass: 0, fail: 0, skip: 0, failed: [] }
  const report = JSON.parse(readFileSync(outputFile, "utf8"))
  const tests = report.testResults.flatMap((file) =>
    file.assertionResults.map((t) => ({ name: `${relative(pkg, file.name)} > ${t.fullName}`, status: t.status }))
  )
  const suiteErrors = report.testResults.filter((f) => f.status === "failed" && f.assertionResults.length === 0)
    .map((f) => `${relative(pkg, f.name)} > (suite) ${f.message.split("\n")[0]}`)
  return {
    ran: true,
    pass: tests.filter((t) => t.status === "passed").length,
    fail: tests.filter((t) => t.status === "failed").length + suiteErrors.length,
    skip: tests.filter((t) => t.status === "skipped" || t.status === "pending" || t.status === "todo").length,
    failed: [...tests.filter((t) => t.status === "failed").map((t) => t.name), ...suiteErrors],
    passed: tests.filter((t) => t.status === "passed").map((t) => t.name)
  }
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
    typeDiffers: [], valueDiffers: [], errors: []
  }
  const lines = ["type Eq<A, B> = (<G>() => G extends A ? 1 : 2) extends (<G>() => G extends B ? 1 : 2) ? true : false"]
  const checks = new Map()
  const check = (label, left, right) => {
    lines.push(`export const _${checks.size}: Eq<${left}, ${right}> = true`)
    checks.set(lines.length, label)
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
    for (const name of vb.keys()) if (!ts.has(name)) api.extraExports.push(`${file}: ${name}`)
    const mod = file.replace(/\.d\.ts$/, "")
    const srcFile = ["ts", "tsx", "mts"].map((x) => `${mod}.${x}`).find((f) => existsSync(join(pkg, "src", f)))
    const vbFile = ["vibe", "ts", "tsx"].map((x) => `${mod}.${x}`).find((f) => existsSync(join(pkg, "src-vibe", f)))
    let imported = false
    const need = () => {
      if (imported) return
      lines.push(`import type * as T${i} from ${JSON.stringify(`../src/${srcFile}`)}`)
      lines.push(`import type * as V${i} from ${JSON.stringify(`../src-vibe/${vbFile}`)}`)
      imported = true
    }
    for (const [name, e] of ts) {
      const v = vb.get(name)
      if (v === undefined) {
        api.missingExports.push(`${file}: ${name}`)
        continue
      }
      if (normalizeDts(e.text) === normalizeDts(v.text)) continue
      if (e.kind === "type") {
        if (e.generic) api.typeDiffers.push(`${file}: ${name} (generic: keep its text)`)
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
      ...common, noEmit: true, rootDir: "..", rootDirs: ["../src", "../src-vibe"], allowImportingTsExtensions: true,
      declaration: false
    }, ["api-check.ts"])
    for (const line of splitTwinErrors(compile(join(work, "tsconfig.api.json"), pkg).errors).twin) {
      const at = line.match(/api-check\.ts\((\d+),\d+\)/)
      const label = at ? checks.get(Number(at[1])) : undefined
      if (label === undefined) api.errors.push(line)
      else if (label.includes(": type ")) api.typeDiffers.push(label)
      else api.valueDiffers.push(label)
    }
  }
  return api
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
  spawnSync("bun", argv, { cwd: pkg, encoding: "utf8", env: { ...process.env, CI: "1" }, maxBuffer: 64 * 1024 * 1024 })
  return existsSync(outputFile)
    ? parseJunit(readFileSync(outputFile, "utf8"), pkg)
    : { ran: false, pass: 0, fail: 0, skip: 0, failed: ["(bun test wrote no report)"] }
}

/** The package's test runner: Bun when its test script runs `bun test`, else Vitest. */
const runner = (pkg) => {
  const script = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).scripts?.test ?? ""
  const bunArgs = script.match(/\bbun test\b(.*)$/)
  return bunArgs ? { kind: "bun", args: bunArgs[1].trim().split(/\s+/).filter(Boolean) } : { kind: "vitest" }
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
    rootDirs: ["../src", "../src-vibe"],
    outDir: "out",
    declaration: true,
    emitDeclarationOnly: false,
    allowImportingTsExtensions: true,
    rewriteRelativeImportExtensions: true,
    sourceMap: true
  }, ["../src-vibe/**/*"])
  tsconfig(pkg, join(work, "tsconfig.ts.json"), {
    ...common,
    rootDir: "../src",
    outDir: "ts-dts",
    declaration: true,
    emitDeclarationOnly: true
  }, ["../src/**/*"], testGlobs)
  const compiled = compile(join(work, "tsconfig.twin.json"), pkg)
  const split = splitTwinErrors(compiled.errors)
  const twin = { ...compiled, errors: split.twin, typescriptErrors: split.typescript }
  const twinned = linkPartialTwin(pkg, work)
  const ts = compile(join(work, "tsconfig.ts.json"))

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
        ["ts", "tsx", "mts"].map((x) => join(pkg, "src", `${rel}.${x}`)).find(existsSync),
        join(work, "out", "src-vibe", `${rel}.js`)
      ]))}
for (const [src, twin] of pairs) mock.module(src, () => require(twin))
`
    )
  }
  const notRun = { ran: false, pass: 0, fail: 0, skip: 0, failed: [] }
  const baseline = tests.kind === "bun" ? bunTest(pkg, tests.args, undefined, join(work, "ts.xml")) : vitest(pkg, undefined, join(work, "ts.json"))
  const vibe = twin.errors.length > 0
    ? notRun
    : tests.kind === "bun"
    ? bunTest(pkg, tests.args, preload, join(work, "vibe.xml"))
    : vitest(pkg, config, join(work, "vibe.json"))
  // A regression is a test that passed on the TypeScript and did not pass on the
  // twin: it failed, or its file never loaded (Bun's JUnit report omits those).
  const vibePassed = new Set((vibe.passed ?? []).map(stableName))
  const regressions = (baseline.passed ?? []).filter((name) => !vibePassed.has(stableName(name)))
  const receipt = {
    package: relative(root, pkg),
    runner: tests.kind,
    twinFiles: walk(join(pkg, "src-vibe")).length,
    compile: { twinErrors: twin.errors, twinWarnings: twin.warnings, vibelangErrorsInTypeScript: twin.typescriptErrors, tsErrors: ts.errors.length },
    api,
    tests: { ts: { ...baseline, failed: undefined, passed: undefined }, vibe: { ...vibe, failed: undefined, passed: undefined } },
    regressions,
    ok: twin.errors.length === 0 && apiOk(api) && vibe.ran && regressions.length === 0 && vibe.pass >= baseline.pass,
    complete: false
  }
  // W46 covers the Effect code: a module that never imports effect may stay TypeScript.
  const importsEffect = (dts) => {
    const mod = dts.replace(/\.d\.ts$/, "")
    const file = ["ts", "tsx", "mts"].map((x) => join(pkg, "src", `${mod}.${x}`)).find(existsSync)
    return file !== undefined && /from\s+["'](?:effect|@effect\/)/.test(readFileSync(file, "utf8"))
  }
  receipt.api.missingEffectModules = api.missingModules.filter(importsEffect)
  receipt.complete = receipt.ok && receipt.api.missingEffectModules.length === 0
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
        `${receipt.package}: ${receipt.complete ? "COMPLETE" : receipt.ok ? "OK (partial)" : "NOT OK"}`,
        `  compile: ${receipt.compile.twinErrors.length} errors, ${receipt.compile.twinWarnings.length} warnings, ${receipt.compile.vibelangErrorsInTypeScript.length} VibeLang errors in unchanged TypeScript (findings, not blocking)`,
        ...receipt.compile.vibelangErrorsInTypeScript.slice(0, 5).map((e) => `  finding: ${e}`),
        `  api: ${receipt.api.modules} modules twinned (${receipt.api.identicalFiles} with identical .d.ts), ${receipt.api.missingEffectModules.length} Effect modules not yet (${receipt.api.missingModules.length} in all), ${receipt.api.checked} type checks`,
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
