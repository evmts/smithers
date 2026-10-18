import { execFileSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { GitHubReader, firstParentCommits, safeReason } from "./github.mjs"
import { auditSample, deliveredRequests, makeSnapshot, paperworkShare, window26 } from "./metrics.mjs"
import { computeMainRedTime } from "./red-time.mjs"
import { auditCsv, renderTrend } from "./output.mjs"

export async function run({ now = new Date().toISOString(), root = resolve(fileURLToPath(new URL("../../..", import.meta.url))), log = console.log } = {}) {
  const repo = "smithersai/smithers"
  const { from, to } = window26(now)
  const date = to.slice(0, 10)
  const out = join(root, ".flows/quality", date)
  await mkdir(out, { recursive: true, mode: 0o700 })
  const progress = (stage) => log(JSON.stringify({ stage, at: new Date().toISOString() }))
  progress("main_commits")
  const mainSource = { name: "main_commits", from, to, complete: true, count: 0, revision: null, gaps: [] }
  let commits = []
  try {
    const raw = execFileSync("jj", ["log", "-r", "ancestors(main@origin)", "--no-graph", "-T", 'json(self) ++ "\\n"'], { cwd: root, encoding: "utf8", maxBuffer: 128 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })
    const head = execFileSync("jj", ["log", "-r", "main@origin", "--no-graph", "-T", "commit_id"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
    mainSource.revision = head
    await writeFile(join(out, "main-history.jsonl"), raw, { mode: 0o600 })
    commits = firstParentCommits(raw.trim().split("\n").map(JSON.parse), head).filter((c) => Date.parse(c.landedAt) < Date.parse(to))
    mainSource.count = commits.length
  } catch (error) { mainSource.complete = false; mainSource.reason = safeReason(error) }
  const reader = new GitHubReader({ repo, from, to, cacheDir: join(out, "raw"), progress })
  progress("request_sources")
  const records = await reader.readRequests()
  const input = { ...records, repo, from, to, generatedAt: to, commits, sources: [...records.sources, mainSource] }
  // This decision and its diagnostic precede both weekly computation and Actions reads.
  const paperwork = paperworkShare(input)
  log(`30-day paperwork: ${paperwork.share === null ? paperwork.status : `${(paperwork.share * 100).toFixed(2)}% (${paperwork.paperwork}/${paperwork.requests})`}`)
  await writeFile(join(out, "paperwork.json"), JSON.stringify(paperwork, null, 2), { mode: 0o600 })
  let red
  if (paperwork.status === "ready" && paperwork.share > 0.4) {
    progress("main_red_time_fallback")
    const actions = await reader.readActions()
    input.sources.push(...actions.sources)
    red = computeMainRedTime({ ...input, ...actions, sources: input.sources })
  }
  input.generatedAt = new Date().toISOString()
  const snapshot = makeSnapshot(input, red)
  const audit = auditSample(deliveredRequests(input).requests, from, to)
  snapshot.coverage.audit = { count: audit.length, requested: 30, method: "deterministic round-robin across UTC closure weeks; paperwork first then issue number ascending within week", handAudited: false }
  const paths = { snapshot: join(out, "snapshot.json"), trend: join(out, "trend.html"), audit: join(out, "audit.csv") }
  await writeFile(paths.snapshot, JSON.stringify(snapshot, null, 2) + "\n", { mode: 0o600 })
  await writeFile(paths.trend, renderTrend(snapshot), { mode: 0o600 })
  await writeFile(paths.audit, auditCsv(audit), { mode: 0o600 })
  log(JSON.stringify({ selectedMetric: snapshot.selectedMetric, coverage: snapshot.coverage, paths }, null, 2))
  return { snapshot, paths }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error("quality takes no arguments")
  try { await run() } catch (error) { console.error(`quality: ${safeReason(error)}`); process.exitCode = 1 }
}
