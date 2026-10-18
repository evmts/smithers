/**
 * The directory a `bun test` run writes its JUnit report into.
 *
 * `bunfig.toml` declares `[test.reporter] junit` as a path relative to the
 * run's working directory, and Bun does not create that directory: on a fresh
 * checkout every run prints `JUnitReportFailed … ENOENT` and loses its report.
 * `apps/app/test-results/` only exists once Playwright's default `outputDir`
 * has been written, so the browser tier's four `bun test` preflight steps run
 * before anything makes it (scripts/run-pr-e2e.mjs) — all three shards of
 * release 38710688411 lost their preflight receipts that way, and only the
 * shard that also runs the unit gate escaped, because that CI step alone holds
 * a `mkdir -p apps/app/test-results`. The package that declares the report
 * owns its directory, so the test preload makes it.
 */
import { mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

/**
 * The `[test.reporter] junit` path a bunfig declares, or undefined when it
 * declares none. A `junit` key under any other table is not that path.
 */
export const junitReportPath = (bunfig: string): string | undefined => {
  const section = /^[ \t]*\[test\.reporter\][ \t]*$/m.exec(bunfig)
  if (section === null) return undefined
  const after = bunfig.slice(section.index + section[0].length)
  const table = after.split(/^[ \t]*\[/m)[0] ?? ""
  const declared = /^[ \t]*junit[ \t]*=[ \t]*"([^"]+)"/m.exec(table)
  return declared === null ? undefined : declared[1]
}

/**
 * Creates the directory of the report the bunfig in `cwd` declares, and
 * answers it. Undefined when there is no bunfig, no declared report, or a
 * working directory that refuses the write: a missing report directory is
 * Bun's own one-line warning, never a reason to fail the run that preloads
 * this.
 */
export const ensureJunitReportDir = (cwd: string = process.cwd()): string | undefined => {
  let bunfig: string
  try { bunfig = readFileSync(resolve(cwd, "bunfig.toml"), "utf8") } catch { return undefined }
  const declared = junitReportPath(bunfig)
  if (declared === undefined) return undefined
  const directory = resolve(cwd, dirname(declared))
  try { mkdirSync(directory, { recursive: true }) } catch { return undefined }
  return directory
}
