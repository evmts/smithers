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
  for (const line of text.split("\n")) {
    const opens = depth === 0 && quote === "" && current.trim() !== "" && !current.trimEnd().endsWith("*/")
      && /^(?:\/\*\*|export |declare |import |interface |type )/.test(line)
    if (opens) {
      statements.push(current)
      current = ""
    }
    current += `${line}\n`
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (quote) {
        if (c === "\\") i++
        else if (c === quote) quote = ""
      } else if (c === "\"" || c === "'" || c === "`") quote = c
      else if (c === "{" || c === "(" || c === "[") depth++
      else if (c === "}" || c === ")" || c === "]") depth--
    }
  }
  statements.push(current)
  const byName = new Map()
  for (const statement of statements.map((s) => s.trim()).filter(Boolean)) {
    const body = statement.replace(/^\/\*\*[\s\S]*?\*\/\s*/, "")
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
  const out = join(pkg, ".vibe-twin", "out", file.slice(src.length).replace(/\.(?:ts|tsx|mts)$/, ".js"))
  return existsSync(out) ? out : undefined
}

const walk = (dir, base = dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name))]
    )
    : []

/** A tool from the package's own node_modules, else the workspace root's. */
const bin = (pkg, name) => [join(pkg, "node_modules", ".bin", name), join(root, "node_modules", ".bin", name)].find(existsSync)

const tsconfig = (pkg, file, compilerOptions, include) => {
  const base = existsSync(join(pkg, "tsconfig.json")) ? "../tsconfig.json" : undefined
  writeFileSync(
    file,
    JSON.stringify({ ...(base ? { extends: base } : {}), compilerOptions, include }, null, 2) + "\n"
  )
}

const common = {
  noEmit: false,
  noEmitOnError: false,
  composite: false,
  incremental: false,
  declarationMap: false,
  plugins: []
}

/** vibelang -p, returning its diagnostics split by category. */
const compile = (project) => {
  const run = spawnSync(process.execPath, [join(root, "node_modules/vibelang/bin/vibelang"), "-p", project, "--pretty", "false"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  })
  const lines = `${run.stdout}${run.stderr}`.split("\n")
  const errors = lines.filter((l) => /\berror (?:TS|EK)\d+:/.test(l))
  const warnings = lines.filter((l) => /\bwarning (?:TS|EK)\d+:/.test(l))
  return { status: run.status, errors, warnings }
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
    failed: [...tests.filter((t) => t.status === "failed").map((t) => t.name), ...suiteErrors]
  }
}

/**
 * Compares the API of every module that src/ and the twin both declare. Export
 * names must match. A type declaration must keep its text or, when it is not
 * generic, be the identical type. A value's type, and a class's constructor and
 * instance types, must be identical (checked by the compiler).
 */
const apiCheck = (pkg, work) => {
  const twinDts = new Set(walk(join(work, "out")).filter((f) => f.endsWith(".d.ts")))
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
    const vbText = readFileSync(join(work, "out", file), "utf8")
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
      ...common, noEmit: true, rootDir: "..", allowImportingTsExtensions: true, declaration: false
    }, ["api-check.ts"])
    for (const line of compile(join(work, "tsconfig.api.json")).errors) {
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

export const run = (pkgArg) => {
  const pkg = resolve(pkgArg)
  if (!existsSync(join(pkg, "src-vibe"))) throw new Error(`${pkg}: no src-vibe/ twin`)
  const work = join(pkg, ".vibe-twin")
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })

  tsconfig(pkg, join(work, "tsconfig.twin.json"), {
    ...common,
    rootDir: "../src-vibe",
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
  }, ["../src/**/*"])
  const twin = compile(join(work, "tsconfig.twin.json"))
  const ts = compile(join(work, "tsconfig.ts.json"))

  const api = apiCheck(pkg, work)

  const baseConfig = ["vitest.config.ts", "vitest.config.mts", "vitest.config.js", "vitest.config.mjs"]
    .map((f) => join(pkg, f)).find(existsSync)
  const config = join(work, "vitest.twin.config.mjs")
  writeFileSync(
    config,
    `import { mergeConfig } from "vitest/config"
import { twinFor } from ${JSON.stringify(fileURLToPath(import.meta.url))}
${baseConfig ? `import base from ${JSON.stringify(baseConfig)}` : "const base = {}"}
const pkg = ${JSON.stringify(pkg)}
export default mergeConfig(base, {
  root: pkg,
  plugins: [{
    name: "vibe-twin",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (importer && importer.includes("/.vibe-twin/out/")) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      return resolved && twinFor(resolved.id, pkg) ? twinFor(resolved.id, pkg) : null
    }
  }],
  test: { coverage: { enabled: false } }
})
`
  )
  const baseline = vitest(pkg, undefined, join(work, "ts.json"))
  const vibe = twin.errors.length === 0 ? vitest(pkg, config, join(work, "vibe.json")) : { ran: false, pass: 0, fail: 0, skip: 0, failed: [] }
  const tsFailed = new Set(baseline.failed)
  const regressions = vibe.failed.filter((name) => !tsFailed.has(name))
  const receipt = {
    package: relative(root, pkg),
    twinFiles: walk(join(pkg, "src-vibe")).length,
    compile: { twinErrors: twin.errors, twinWarnings: twin.warnings, tsErrors: ts.errors.length },
    api,
    tests: { ts: { ...baseline, failed: undefined }, vibe: { ...vibe, failed: undefined } },
    regressions,
    ok: twin.errors.length === 0 && apiOk(api) && vibe.ran && regressions.length === 0 && vibe.pass >= baseline.pass,
    complete: false
  }
  receipt.complete = receipt.ok && api.missingModules.length === 0
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
        `  compile: ${receipt.compile.twinErrors.length} errors, ${receipt.compile.twinWarnings.length} warnings`,
        `  api: ${receipt.api.modules} modules twinned (${receipt.api.identicalFiles} with identical .d.ts), ${receipt.api.missingModules.length} not yet, ${receipt.api.checked} type checks`,
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
