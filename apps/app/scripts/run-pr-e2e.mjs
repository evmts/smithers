/**
 * Required PR browser tier; package-local Playwright owns its matching browser.
 *
 * The steps run serially. T1 and the flow-graph tier each rebuild
 * apps/app/dist (vite empties it); the showcase serves T1's dist
 * (SMITHERS_SKIP_SPA_BUILD) and keeps its own outputDir; T1, site and graph
 * write Playwright's default test-results/; site builds apps/site/dist. As
 * concurrent targets they would race. A failed test step
 * does not stop the later ones, so one run reports every red tier; the exit
 * code is the first failure's. Each step prints its duration.
 *
 * Because the later steps still run, and because T1, site and graph each clear
 * Playwright's default test-results/ as they start — the same directory the
 * four Bun preflight steps write their JUnit report into (bunfig.toml,
 * scripts/junit-report-dir.ts) — a failed earlier step's report was gone by
 * the time CI collected artifacts. Release 38710688411's shard 3 failed in the
 * probes step, ran four green steps after it, and uploaded nothing at all:
 * "No files were found with the provided path. No artifacts will be uploaded."
 * Shard 3 loses the most, because it alone runs the showcase, site and graph
 * steps. So each failed step's report directories are copied into
 * stage-evidence/<step>/ before the next step starts, and a red run writes
 * stage-evidence/stages.json after every step: the step that failed, its exit
 * status, its duration and what was retained. A failure that produced no
 * report at all still leaves that manifest, so the artifact is never empty and
 * never silent. Only the listed report directories are copied, and only for a
 * failed step; a green step is copied nowhere and a green run writes nothing.
 *
 * The destinations are fixed names, so what they hold is this run's alone only
 * where the checkout is: CI, which starts each job from a fresh clone. Run
 * locally, twice, a step's directory can hold the earlier run's files beside
 * this one's, because this runner keeps what it finds rather than clearing a
 * directory it did not write. stages.json is the one file always rewritten, so
 * it names this invocation and nothing else; read it first.
 *
 * Measured on ubuntu-latest (runs 36364540459 and 36369423415): install
 * 0.4 min, T1 11.7, showcase 3.7, site 1.2; the whole run crossed 20 min at
 * graph test 16 of 20 (the graph step alone: 1.5 min on a 16-core Mac), so
 * ~22 min. By run 37987394687 (2026-10-09) T1 had grown to 585 tests and
 * ~33 min, so the unsharded run is ~40 min. CI now runs three isolated
 * T1 shards; shard 3 also runs showcase/site/graph (about 6 min combined).
 * Expected browser time is ~12/~12/~18 min against 45m, leaving >40%
 * headroom. These estimates need confirmation on GitHub runners. A shard's
 * showcase rebuilds dist because T1 may have no tests to start its web server.
 */
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs"
import { constants } from "node:os"
import { join } from "node:path"

const install = ["exec", "playwright", "install", "--with-deps", "chromium"]
const shard = process.argv[2]
if (shard && !/^[123]$/.test(shard)) throw new Error("Browser shard must be 1, 2 or 3")
// Each step's name is this file's own word for it, never a command line: the
// manifest below carries it, and only the auxiliary three are shard-3-only.
const steps = [
  { stage: "install", args: install },
  { stage: "auth", args: ["run", "test:e2e:auth"] },
  { stage: "probes", args: ["run", "test:e2e:probes"] },
  { stage: "graph-lifecycle", args: ["run", "test:e2e:graph-lifecycle"] },
  { stage: "t1", args: ["exec", "playwright", "test", ...(shard ? [`--shard=${shard}/3`] : [])] },
  // The showcase cases as plain assertion tests (no recording). It reuses the dist/ the
  // T1 step above builds, so it must stay after that step.
  { stage: "showcase", args: ["exec", "playwright", "test", "--config", "playwright.showcase.config.ts"] },
  { stage: "site", args: ["exec", "playwright", "test", "--config", "playwright.site.config.ts"] },
  { stage: "graph", args: ["exec", "playwright", "test", "--config", "playwright.graph.config.ts"] }
]
const auxiliary = ["showcase", "site", "graph"]

/** The report directories a step writes, relative to this package. */
const reportDirs = ["test-results", "playwright-report", "test-results-showcase"]
const evidenceDir = "stage-evidence"

/** A path this runner will copy: a real file or directory, never a link. */
const copyable = (path) => {
  try { return !lstatSync(path).isSymbolicLink() } catch { return false }
}

/**
 * Whether the evidence root may be written: absent, or a directory in this
 * package. A link there would put every copy below it wherever it points.
 */
const evidenceRootUsable = () => {
  try { return lstatSync(evidenceDir).isDirectory() } catch { return true }
}

/** A launch failure's errno, as Node's own table spells it, or "other". */
const errnoName = (code) => typeof code === "string" && code in constants.errno ? code : "other"

/**
 * Copies a failed step's reports out of the directories the next step clears,
 * and answers what that left. Links are skipped rather than copied, in the
 * directory itself and at every depth: a copied link would still name its
 * target, and the artifact uploader resolves one, so keeping a link is how a
 * path outside these directories would reach an artifact. A directory the
 * runner cannot copy is named as refused; losing a copy never fails the run
 * that made it.
 */
const retain = (stage) => {
  if (!evidenceRootUsable()) return { retained: [], reason: "evidence-root-refused" }
  const retained = [], refused = []
  for (const dir of reportDirs) {
    if (!existsSync(dir) || !copyable(dir)) continue
    try {
      cpSync(dir, join(evidenceDir, stage, dir), { recursive: true, dereference: false, filter: copyable })
      retained.push(dir)
    } catch { refused.push(dir) }
  }
  return { retained, ...(refused.length > 0 ? { refused } : {}),
    ...(retained.length === 0 && refused.length === 0 ? { reason: "no-known-output-paths" } : {}) }
}

const progress = []
let failure = 0

/**
 * What this run has reached. Written after every step once a step is red. The
 * exit code stays the tiers' own verdict, so a receipt this run cannot write
 * is one printed line, never a changed status.
 */
const publish = (complete) => {
  const manifest = { runner: "run-pr-e2e", shard: shard ?? "local", stages: progress, exit: failure, complete }
  try {
    if (!evidenceRootUsable()) throw new Error(evidenceDir)
    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(join(evidenceDir, "stages.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  } catch { console.log(`[run-pr-e2e] ${evidenceDir}/stages.json: write-refused`) }
}

for (const { stage, args } of steps) {
  if (shard && shard !== "3" && auxiliary.includes(stage)) continue
  const showcase = stage === "showcase"
  const started = Date.now()
  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: { ...process.env, SMITHERS_CHAT_STUB: "1", SMITHERS_PR_E2E: "1", ...(showcase && !shard ? { SMITHERS_SKIP_SPA_BUILD: "1" } : {}) }
  })
  const minutes = Number(((Date.now() - started) / 60_000).toFixed(1))
  // The child never started, so there is no tier status to report and nothing
  // later can run. Record that and stop, rather than throwing past the
  // manifest that is this run's only artifact.
  if (result.error) {
    const errno = errnoName(result.error.code)
    console.log(`[run-pr-e2e] pnpm ${args.join(" ")}: launch failed (${errno}) in ${minutes.toFixed(1)} min`)
    progress.push({ stage, status: 1, minutes, reason: "launch-failed", errno })
    if (failure === 0) failure = 1
    publish(true)
    process.exit(failure)
  }
  const status = result.status ?? 1
  console.log(`[run-pr-e2e] pnpm ${args.join(" ")}: exit ${status} in ${minutes.toFixed(1)} min`)
  progress.push({ stage, status, minutes, ...(status === 0 ? {} : retain(stage)) })
  if (status !== 0 && failure === 0) failure = status
  if (failure !== 0) publish(false)
  // A failed install leaves no tier to report, so this run stops here.
  if (status !== 0 && stage === "install") break
}
if (failure !== 0) publish(true)
process.exit(failure)
