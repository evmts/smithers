/** Installed CLI compatibility probe. Run on Linux via vm-run, never in the workspace HOME.
 * Usage: node test/node-runtime-matrix.mjs [package-spec-or-tarball]
 * Defaults to the published next candidate; accepts a locally packed CLI.
 * Retains downloads, clean homes, command output and JSON receipts in MATRIX_OUTPUT.
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

const root = process.env.MATRIX_OUTPUT ?? mkdtempSync(join(tmpdir(), "smthrs-node-matrix-"))
mkdirSync(root, { recursive: true })
const spec = process.argv[2] ?? "@smthrs/cli@next"
const results = []
const loader = join(root, "trace-loader.mjs")
writeFileSync(loader, `import { appendFileSync } from "node:fs"
export async function load(url, context, next) {
  const result = await next(url, context)
  if (url.startsWith("file:")) appendFileSync(process.env.MATRIX_TRACE_FILE, JSON.stringify(url) + "\\n")
  return result
}
`)
const graph = new Set()
const run = (command, args, options = {}) => spawnSync(command, args, { encoding: "utf8", timeout: 180_000, ...options })
const must = (command, args, options) => {
  const r = run(command, args, options)
  if (r.status !== 0) throw new Error(`${command} ${args.join(" ")}: ${r.error ?? r.stderr}`)
  return r.stdout
}
console.log(`MATRIX_OUTPUT=${root}`)
for (const version of ["22.4.1", "22.15.0", "22.19.0", "24.19.0", "26.4.0"]) {
  const directory = join(root, version)
  mkdirSync(directory, { recursive: true })
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const archive = `node-v${version}-linux-${arch}.tar.xz`
  must("curl", ["--fail", "--location", "--retry", "3", "-o", join(directory, archive), `https://nodejs.org/dist/v${version}/${archive}`])
  const sums = must("curl", ["--fail", "--location", `https://nodejs.org/dist/v${version}/SHASUMS256.txt`])
  const digest = createHash("sha256").update(readFileSync(join(directory, archive))).digest("hex")
  if (!sums.split("\n").some(line => line.trim() === `${digest}  ${archive}`)) throw new Error("Node archive checksum mismatch")
  must("tar", ["xf", join(directory, archive), "-C", directory])
  const bin = join(directory, `node-v${version}-linux-${arch}`, "bin")
  const home = join(directory, "home")
  const consumer = join(directory, "consumer")
  mkdirSync(home); mkdirSync(consumer)
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, npm_config_cache: join(home, "npm-cache"), NO_COLOR: "1" }
  delete env.NODE_OPTIONS
  writeFileSync(join(consumer, "package.json"), '{"private":true,"type":"module"}\n')
  const installed = run(join(bin, "npm"), ["install", "--ignore-scripts", "--no-audit", "--no-fund", spec], { cwd: consumer, env })
  writeFileSync(join(directory, "install.log"), `${installed.stdout}\n${installed.stderr}`)
  if (installed.status !== 0) {
    results.push({ version, command: "install", status: installed.status, error: String(installed.error ?? installed.stderr) })
    console.log(JSON.stringify(results.at(-1)))
    continue
  }
  const cli = join(consumer, "node_modules/@smthrs/cli/bin/smithers.mjs")
  // Research only: remove the installed copy's policy guard to expose the
  // actual dependency link failure. Never modifies the package under test.
  if (process.env.MATRIX_DISCOVER === "1") {
    const guard = join(consumer, "node_modules/@smthrs/cli/dist/esm/internal/NodeVersion.js")
    writeFileSync(guard, readFileSync(guard, "utf8").replace(/minimum = "[^"]+"/, 'minimum = "0.0.0"'))
  }
  const apis = run(join(bin, "node"), ["--input-type=module", "-e", `
    const m = await import("node:module");
    let sqlite; try { sqlite = await import("node:sqlite") } catch {}
    console.log(JSON.stringify({ node: process.version, registerHooks: typeof m.registerHooks,
      sqlite: typeof sqlite?.DatabaseSync, backup: typeof sqlite?.backup,
      getBuiltinModule: typeof process.getBuiltinModule, URLPattern: typeof globalThis.URLPattern,
      regexpEscape: typeof RegExp.escape, float16: typeof globalThis.Float16Array,
      promiseTry: typeof Promise.try, errorIsError: typeof Error.isError,
      iterator: typeof globalThis.Iterator, arrayToSorted: typeof [].toSorted }))
  `], { env })
  writeFileSync(join(directory, "apis.log"), `${apis.stdout}\n${apis.stderr}`)
  console.log(apis.stdout.trim())
  for (const [name, args] of [["version", ["--version"]], ["help", ["--help"]], ["init", ["init"]], ["generate", ["generate", "flow", "coding"]]]) {
    const cwd = join(directory, name); mkdirSync(cwd)
    const trace = join(directory, `${name}.imports.jsonl`)
    const r = run(join(bin, "node"), ["--experimental-loader", loader, cli, ...args], {
      cwd, env: { ...env, MATRIX_TRACE_FILE: trace }
    })
    if (existsSync(trace)) for (const line of readFileSync(trace, "utf8").trim().split("\n")) {
      if (line) graph.add(JSON.parse(line))
    }
    writeFileSync(join(directory, `${name}.log`), `${r.stdout}\n${r.stderr}`)
    const row = { version, command: `smthrs ${args.join(" ")}`, status: r.status, signal: r.signal, output: `${r.stdout}\n${r.stderr}`.slice(0, 4000) }
    results.push(row); console.log(JSON.stringify(row))
  }
  // These resolve npm next, independently of a supplied local tarball. Never call
  // these a candidate receipt until that candidate has actually reached next.
  for (const runner of ["npx", "bunx"]) {
    const cwd = join(directory, runner); mkdirSync(cwd)
    const runnerHome = join(directory, `${runner}-home`); mkdirSync(runnerHome)
    const r = run(runner === "npx" ? join(bin, "npx") : "bunx", ["smthrs@next", "generate", "flow", "coding"], {
      cwd, env: { ...env, HOME: runnerHome, npm_config_cache: join(runnerHome, "npm-cache"), npm_config_yes: "true" }
    })
    writeFileSync(join(directory, `${runner}.log`), `${r.stdout}\n${r.stderr}`)
    const row = { version, command: `${runner} smthrs@next generate flow coding`, status: r.status, error: String(r.error ?? ""), output: `${r.stdout}\n${r.stderr}`.slice(-4000) }
    results.push(row); console.log(JSON.stringify(row))
  }
}
const packages = new Map()
const newer = []
for (const url of graph) {
  const path = new URL(url)
  const source = readFileSync(path, "utf8")
  const lines = source.split("\n")
  for (let i = 0; i < lines.length; i++) {
    if (/registerHooks|node:sqlite|node:ffi|RegExp\.escape|Float16Array|Promise\.try|Error\.isError|URLPattern|getBuiltinModule|\.toArray\(|\.toSorted\(|\.toReversed\(|\b(?:await )?using \w/.test(lines[i])) {
      newer.push({ file: path.pathname, line: i + 1, source: lines[i].slice(0, 500) })
    }
  }
  let directory = dirname(path.pathname)
  while (directory !== dirname(directory)) {
    const manifest = join(directory, "package.json")
    if (existsSync(manifest)) {
      const p = JSON.parse(readFileSync(manifest, "utf8"))
      if (p.name) { packages.set(`${p.name}@${p.version}`, { name: p.name, version: p.version, engines: p.engines, manifest }); break }
    }
    directory = dirname(directory)
  }
}
writeFileSync(join(root, "import-audit.json"), JSON.stringify({ files: [...graph], packages: [...packages.values()], newer }, null, 2) + "\n")
console.log(`AUDIT ${graph.size} modules, ${packages.size} packages; ${root}/import-audit.json`)
writeFileSync(join(root, "results.json"), JSON.stringify({ spec, results }, null, 2) + "\n")
if (results.some(r => r.status !== 0)) process.exitCode = 1
