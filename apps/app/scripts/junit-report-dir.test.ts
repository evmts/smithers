import { expect, test } from "bun:test"
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureJunitReportDir, junitReportPath } from "./junit-report-dir.ts"

/*
 * The JUnit report of a `bun test` run lands where `bunfig.toml` says, in a
 * directory Bun does not create. These are the two halves: the declaration is
 * read from the real bunfig, and a real run in a working directory with no
 * report directory keeps its report.
 */

const PRELOAD = join(import.meta.dir, "require-toolchain.mjs")

const run = (preloaded: boolean) => {
  const cwd = mkdtempSync(join(tmpdir(), "smithers-junit-report-"))
  writeFileSync(join(cwd, "bunfig.toml"), `${preloaded ? `[test]\npreload = ["${PRELOAD}"]\n\n` : ""}[test.reporter]\njunit = "test-results/unit-tests.xml"\n`)
  writeFileSync(join(cwd, "report.test.ts"), 'import { expect, test } from "bun:test"\ntest("a run reports", () => { expect(1).toBe(1) })\n')
  const result = Bun.spawnSync([process.execPath, "test", "report.test.ts"], { cwd, stdout: "pipe", stderr: "pipe" })
  return { cwd, status: result.exitCode, stderr: result.stderr.toString() }
}

test("the declared report path is this package's own, and a junit key under another table is not it", () => {
  expect(junitReportPath(readFileSync(join(import.meta.dir, "../bunfig.toml"), "utf8"))).toBe("test-results/unit-tests.xml")
  expect(junitReportPath('[test]\npreload = ["./scripts/require-toolchain.mjs"]\n')).toBeUndefined()
  expect(junitReportPath('[install]\njunit = "elsewhere/report.xml"\n\n[test.reporter]\njunit = "test-results/unit-tests.xml"\n')).toBe("test-results/unit-tests.xml")
  expect(junitReportPath('[test.reporter]\n\n[install]\njunit = "elsewhere/report.xml"\n')).toBeUndefined()
})

test("a bunfig that declares no report, and a working directory with no bunfig, leave the filesystem alone", () => {
  const cwd = mkdtempSync(join(tmpdir(), "smithers-junit-report-"))
  expect(ensureJunitReportDir(cwd)).toBeUndefined()
  writeFileSync(join(cwd, "bunfig.toml"), "[test]\npreload = []\n")
  expect(ensureJunitReportDir(cwd)).toBeUndefined()
})

test("the preload keeps the report of a run whose report directory does not exist yet", () => {
  const { cwd, status, stderr } = run(true)
  expect(status).toBe(0)
  expect(stderr).not.toContain("JUnitReportFailed")
  expect(existsSync(join(cwd, "test-results/unit-tests.xml"))).toBe(true)
  expect(readFileSync(join(cwd, "test-results/unit-tests.xml"), "utf8")).toContain("a run reports")
})

/* The defect the preload answers: Bun alone writes no report and says so. Delete the preload line and this is every run on a fresh checkout. */
test("without the preload the same run loses its report to ENOENT", () => {
  const { cwd, status, stderr } = run(false)
  expect(status).toBe(0)
  expect(stderr).toContain("JUnitReportFailed")
  expect(existsSync(join(cwd, "test-results/unit-tests.xml"))).toBe(false)
})
