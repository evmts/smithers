import { expect, test } from "bun:test"
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureJunitReportDir, junitReportPath } from "./junit-report-dir.ts"
import { runSync } from "./test-child"

/*
 * The JUnit report of a `bun test` run lands where `bunfig.toml` says, in a
 * directory Bun does not create. These are the two halves: the declaration is
 * read from the real bunfig, and a real run in a working directory with no
 * report directory keeps its report.
 */

const PRELOAD = join(import.meta.dir, "require-toolchain.mjs")

/*
 * A stalled child answers as itself. The run goes through the supervisor every
 * other script test uses (test-child.ts): it bounds the child at
 * CHILD_TIMEOUT, publishes its real status and stderr, and raises the child's
 * own ETIMEDOUT with the supervisor's trail by CHILD_TIMEOUT + 10 s. The case
 * allows more than that, so a stall reads as the child's error rather than as
 * Bun's anonymous test timeout — and more than the 5 s default, because
 * spawning Node and a second `bun test` is more than that on a shared runner.
 */
const CHILD_TIMEOUT = 30_000
const CASE_TIMEOUT = 45_000

/*
 * One disposable working directory per run, and this test owns its lifetime:
 * the child's status, its stderr and the report it wrote are read out while
 * the directory still stands, and the directory goes in `finally`, so a failed
 * assertion or a throwing read leaves nothing behind either.
 */
const run = (preloaded: boolean) => {
  const cwd = mkdtempSync(join(tmpdir(), "smithers-junit-report-"))
  try {
    writeFileSync(join(cwd, "bunfig.toml"), `${preloaded ? `[test]\npreload = ["${PRELOAD}"]\n\n` : ""}[test.reporter]\njunit = "test-results/unit-tests.xml"\n`)
    writeFileSync(join(cwd, "report.test.ts"), 'import { expect, test } from "bun:test"\ntest("a run reports", () => { expect(1).toBe(1) })\n')
    const result = runSync([process.execPath, "test", "report.test.ts"], { cwd, timeout: CHILD_TIMEOUT })
    const report = join(cwd, "test-results/unit-tests.xml")
    const written = existsSync(report)
    return {
      cwd,
      status: result.exitCode,
      stderr: new TextDecoder().decode(result.stderr),
      written,
      report: written ? readFileSync(report, "utf8") : ""
    }
  } finally { rmSync(cwd, { recursive: true, force: true }) }
}

test("the declared report path is this package's own, and a junit key under another table is not it", () => {
  expect(junitReportPath(readFileSync(join(import.meta.dir, "../bunfig.toml"), "utf8"))).toBe("test-results/unit-tests.xml")
  expect(junitReportPath('[test]\npreload = ["./scripts/require-toolchain.mjs"]\n')).toBeUndefined()
  expect(junitReportPath('[install]\njunit = "elsewhere/report.xml"\n\n[test.reporter]\njunit = "test-results/unit-tests.xml"\n')).toBe("test-results/unit-tests.xml")
  expect(junitReportPath('[test.reporter]\n\n[install]\njunit = "elsewhere/report.xml"\n')).toBeUndefined()
})

test("a bunfig that declares no report, and a working directory with no bunfig, leave the filesystem alone", () => {
  const cwd = mkdtempSync(join(tmpdir(), "smithers-junit-report-"))
  try {
    expect(ensureJunitReportDir(cwd)).toBeUndefined()
    writeFileSync(join(cwd, "bunfig.toml"), "[test]\npreload = []\n")
    expect(ensureJunitReportDir(cwd)).toBeUndefined()
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test("the preload keeps the report of a run whose report directory does not exist yet", () => {
  const { cwd, status, stderr, written, report } = run(true)
  expect(status).toBe(0)
  expect(stderr).not.toContain("JUnitReportFailed")
  expect(written).toBe(true)
  expect(report).toContain("a run reports")
  // The fixture is the run's own and outlives nothing: a suite of these leaves no directory in the temporary one.
  expect(existsSync(cwd)).toBe(false)
}, CASE_TIMEOUT)

/* The defect the preload answers: Bun alone writes no report and says so. Delete the preload line and this is every run on a fresh checkout. */
test("without the preload the same run loses its report to ENOENT", () => {
  const { status, stderr, written } = run(false)
  expect(status).toBe(0)
  expect(stderr).toContain("JUnitReportFailed")
  expect(written).toBe(false)
}, CASE_TIMEOUT)
