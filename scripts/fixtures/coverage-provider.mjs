import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const owner = join(repository, "packages/smithers/control")
const require = createRequire(join(owner, "package.json"))
const cli = join(dirname(realpathSync(require.resolve("vitest/package.json"))), "vitest.mjs")

// Actual Vitest subprocesses own instrumentation and source-map remapping.
// No Istanbul counters, V8 ranges, or synthetic coverage reports are injected.
export function measure({ source, test, provider = "istanbul", thresholds = 0 }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "control-provider-")))
  try {
    mkdirSync(join(root, "home"))
    symlinkSync(join(owner, "node_modules"), join(root, "node_modules"), "dir")
    writeFileSync(join(root, "package.json"), "{\"type\":\"module\"}\n")
    writeFileSync(join(root, "fixture.ts"), source)
    writeFileSync(join(root, "fixture.test.ts"), test)
    writeFileSync(
      join(root, "vitest.config.ts"),
      `import { defineConfig } from 'vitest/config';
export default defineConfig({test:{testTimeout:30000,hookTimeout:30000,maxWorkers:1,pool:'threads',
coverage:{enabled:true,provider:${JSON.stringify(provider)},include:['fixture.ts'],reporter:['json'],
reportsDirectory:'coverage',thresholds:{branches:${thresholds},functions:${thresholds},lines:${thresholds},statements:${thresholds}}}}});`
    )
    const result = spawnSync(process.execPath, [cli, "run", "--root", root], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...Object.fromEntries(
          ["PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SystemRoot"].flatMap((key) =>
            process.env[key] === undefined ? [] : [[key, process.env[key]]]
          )
        ),
        HOME: join(root, "home"),
        NO_COLOR: "1"
      }
    })
    assert.equal(result.error, undefined)
    const report = JSON.parse(readFileSync(join(root, "coverage/coverage-final.json"), "utf8"))
    assert.deepEqual(Object.keys(report), [join(root, "fixture.ts")])
    return { status: result.status, output: result.stdout + result.stderr, coverage: report[join(root, "fixture.ts")] }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

export function ifCounts(coverage, source, marker) {
  assert.notEqual(source.indexOf(marker), -1, marker)
  const line = source.slice(0, source.indexOf(marker)).split("\n").length
  const matching = Object.entries(coverage.branchMap).filter(([, branch]) =>
    branch.type === "if" && branch.loc.start.line === line
  )
  assert.equal(matching.length, 1, marker)
  return coverage.b[matching[0][0]]
}
