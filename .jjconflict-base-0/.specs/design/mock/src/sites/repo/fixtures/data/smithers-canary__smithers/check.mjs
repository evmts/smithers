#!/usr/bin/env node
/** Fixture validation against pinned, read-only jj file show sources; no browser. */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { auditCasts } from "../../cast-audit.mjs"

const here = dirname(fileURLToPath(import.meta.url))
// The facts export is machine-local: MOCK_FACTS names the folder holding smithers-{commits,issues,pulls}.json.
const factsRoot = process.env.MOCK_FACTS
if (!factsRoot) { console.error("Set MOCK_FACTS to the folder holding the smithers-{commits,issues,pulls}.json facts export."); process.exit(1) }
// SMITHERS_SOURCE names a read-only smithers checkout; by default, the repository that holds this mock.
const repoRoot = resolve(here, "../../../../../../../../..")
const sourceRoot = process.env.SMITHERS_SOURCE || repoRoot
const subjects = ["MOCK_NOW", "repo", "people", "tree", "files", "blame", "commits", "omittedCommits", "branches", "tags", "labels", "issues", "pulls", "stack", "runs", "approvals", "flows", "agents", "wiki", "docs", "releases", "settings", "ask", "evals"]
const data = Object.fromEntries(subjects.map(name => [name, JSON.parse(readFileSync(resolve(here, name + ".json"), "utf8"))]))
let checks = 0
const check = (ok, reason) => { checks++; assert.ok(ok, reason) }
const castFiles = auditCasts(check)
const exists = (name, key, value, where) => check(data[name].some(item => item[key] === value), `${where}: missing ${name}.${key}=${value}`)
const person = (value, where) => exists("people", "login", value, where)
const run = (value, where) => exists("runs", "id", value, where)
const commit = (value, where) => exists("commits", "sha", value, where)
const timestamp = (value, where) => check(Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.parse(data.MOCK_NOW), `${where}: invalid or future date ${value}`)
const keys = { people: "login", tree: "path", files: "path", commits: "sha", branches: "name", tags: "name", labels: "name", issues: "n", pulls: "n", stack: "id", runs: "id", approvals: "id", flows: "name", agents: "id", wiki: "slug", docs: "slug", releases: "tag", ask: "view" }
for (const [name, key] of Object.entries(keys)) check(new Set(data[name].map(x => x[key])).size === data[name].length, `${name}: duplicate ${key}`)

// Check the entire literal against the current contract, without a generated
// file or an unchecked JSON cast. TypeScript is already a workspace dependency.
let ts
try { ts = createRequire(resolve(repoRoot, "package.json"))("typescript") } catch { ts = createRequire(resolve(sourceRoot, "package.json"))("typescript") }
const virtual = resolve(here, "__fixture_schema_check__.ts")
const source = `const dataset: Omit<import("../../types").Dataset, "evals"> & { evals: Array<import("../../types").EvalSuite & { note?: string; runnable?: boolean; unavailable?: string; unexecuted?: boolean; sourceFile?: string; importedSnapshot?: boolean }> } = ${JSON.stringify(data)};\nvoid dataset;\n`
const options = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] }
const host = ts.createCompilerHost(options)
const getSourceFile = host.getSourceFile.bind(host)
host.getSourceFile = (file, ...args) => file === virtual ? ts.createSourceFile(file, source, options.target, true) : getSourceFile(file, ...args)
const program = ts.createProgram([virtual], options, host)
const diagnostics = ts.getPreEmitDiagnostics(program)
check(diagnostics.length === 0, diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"))

// All 37 repository blobs match this revision before the Effect 4.0.5 upgrade.
// It is the newest matching revision in the exported main history; SOURCES.md
// records the pin and the four files whose versions drift from the newest export.
const sourceRevision = "e75952e77560b6a4b0a5ae529d4f690a5332d11c"
const readSource = path => execFileSync("jj", ["--ignore-working-copy", "file", "show", "-r", sourceRevision, `root-file:${path}`], { cwd: sourceRoot, encoding: "utf8", maxBuffer: 2 ** 21 })
// Exactly two copy exceptions, pending the PM's upstream decision (principle 7;
// PM d-7oejn2). Smithers' own words must not claim an agent reviewed the change.
// Match the complete sentence/description field once; all other bytes must match.
const sourceDescription = "Smithers maintains your codebase. It turns issues into reviewed, tested changes and, when enabled, keeps the project wiki current. Flows beside your code define how."
const mockDescription = "Smithers maintains your codebase. It turns issues into tested changes for you to review and, when enabled, keeps the project wiki current. Flows beside your code define how."
const copyExceptions = {
  "README.md": [sourceDescription, mockDescription],
  "package.json": [`"description": "${sourceDescription}"`, `"description": "${mockDescription}"`],
}
// Neither scorecard exists at any of the 88 revisions returned by the documented
// SWE-bench history query. Preserve their imported bytes, never as repo blobs.
// These hashes are snapshot identities, not proof of a repository revision.
const importedSnapshots = {
  "evals/swebench/fixtures/scorecard.json": ["imports/swebench-scorecard.json", "9cc90a2ee25b00faaec72ec1659257a293c4e27d5aeab03a3c284d3b2372d531"],
  "evals/swebench/fixtures/scorecard.md": ["imports/swebench-scorecard.md", "45011b14021df31ebe89ef1dc3b66627d70f802103c6bb21664f98543749b451"],
}
for (const [path, [snapshot, digest]] of Object.entries(importedSnapshots)) {
  check(createHash("sha256").update(readFileSync(resolve(here, snapshot))).digest("hex") === digest, `${path}: imported snapshot changed`)
  for (const name of ["files", "tree", "blame"]) check(!data[name].some(f => f.path === path), `${path}: imported snapshot is not a repository ${name} subject`)
}
const facts = name => JSON.parse(readFileSync(resolve(factsRoot, `smithers-${name}.json`), "utf8"))
const originalCommits = facts("commits")
// Exclude source records whose quoted copy names an operator machine path; never rewrite them.
// A left-out commit keeps only its real identity and parents (omittedCommits.json), so history stays connected.
const excludedCommits = new Set([
  "36b672172b8f16bfffce15eb10fab751dbb29913", // Message quotes a local gate script path.
])
const keptCommits = originalCommits.filter(raw => !excludedCommits.has(raw.sha))
check(data.commits.length === keptCommits.length + 1, "Preserve the 100-commit export minus explicit exclusions, plus one explicit mock review scenario")
check(JSON.stringify(data.omittedCommits) === JSON.stringify(originalCommits.filter(raw => excludedCommits.has(raw.sha)).map(raw => ({ sha: raw.sha, parents: raw.parents }))), "Left-out commits keep only their real identity and parents")
for (const [i, raw] of keptCommits.entries()) {
  const c = data.commits.filter(commit => commit.pull !== 9001)[i]
  check(c.sha === raw.sha && c.date === raw.date && JSON.stringify(c.parents) === JSON.stringify(raw.parents), `${raw.sha}: identity/date/parents changed`)
  check(c.title === raw.message.split("\n")[0] && c.body === raw.message.slice(raw.message.indexOf("\n") + 1).replace(/^\n+/, ""), `${raw.sha}: message changed`)
  check(c.author === (raw.author === "William Cory" ? "maya" : "smithers-agent"), `${raw.sha}: author mapping`)
  if (/Co-Authored-By:\s*(Claude|Codex)/i.test(raw.message)) check(Boolean(c.agent), `${raw.sha}: missing agent mark`)
}
const allowed = a => a === "roninjin10" || a.startsWith("app/") || a.endsWith("[bot]")
// Exclude source records whose quoted copy violates the claim gate; never rewrite them.
const excludedIssues = new Set([
  4232, // Reporter's historical site quote contains a forbidden review claim.
  // Bug-bash reports that quote operator machine paths (screenshots, logs, lane workspaces).
  4262, 4260, 4259, 4258, 4257, 4256, 4239, 4237, 4236,
  // Reports that name the private ops vault or quote home-relative machine paths.
  4264, 4263, 4252, 4247, 4246, 4244, 4243, 4242, 4241, 4231,
])
for (const name of ["issues", "pulls"]) {
  const expected = facts(name).filter(x => allowed(x.author) && !(name === "issues" && excludedIssues.has(x.number)))
  check(data[name].length === expected.length + Number(name === "pulls"), `${name}: source count differs after author filtering and explicit exclusions`)
  for (const raw of expected) {
    const item = data[name].find(x => x.n === raw.number)
    check(Boolean(item) && item.title === raw.title && item.state === raw.state.toLowerCase(), `${name} #${raw.number}: source identity changed`)
    check(item.body === (raw.body ?? "").slice(0, 1500), `${name} #${raw.number}: body changed`)
  }
}
check(data.people.map(x => x.login).sort().join() === "lander,maya,smithers-agent", "Only the assigned cast and configured landing user")
check(data.people.find(x => x.login === "lander").kind === "human", "Lander is a configured landing user")
check(data.repo.slug === "smithers-canary/smithers" && data.repo.defaultBranch === "main", "Repository identity")
check(data.MOCK_NOW === "2026-10-18T05:00:00Z", "Review clock")
check(data.files.length === 37, "37 complete repository blobs; two scorecards are imported snapshots")
check(data.files.filter(x => x.symbols?.length).length === 2, "Symbols on two files")
for (const f of data.files) {
  exists("tree", "path", f.path, "blob")
  let original = readSource(f.path)
  if (Object.hasOwn(copyExceptions, f.path)) {
    const [from, to] = copyExceptions[f.path]
    check(original.split(from).length === 2, `${f.path}: expected exactly one source description`)
    original = original.replace(from, to)
  }
  if (f.path === ".smithers/home.json") {
    const home = JSON.parse(original)
    home.blocks.find(block => block.type === "prompt").title = "Ask about Smithers"
    home.blocks.push({ type: "links", links: [{ label: "Install Smithers", url: "/" }, { label: "Docs", url: "smithers.sh/docs" }, { label: "Report a bug", url: "bug" }, { label: "Fixed by agents", url: "issues?q=is:fixed-by-agents" }] })
    original = JSON.stringify(home, null, 2) + "\n"
  }
  check(f.content === original, `${f.path}: full source content changed or truncated`)
  check(data.tree.find(x => x.path === f.path).size === Buffer.byteLength(f.content), `${f.path}: byte size`)
  if ((f.path.startsWith("packages/smithers/src/") || f.path.startsWith("apps/app/src/"))) check(f.content.split("\n").length < 400, `${f.path}: source exceeds 400 lines`)
  const ranges = data.blame.filter(x => x.path === f.path).sort((a, b) => a.start - b.start)
  let next = 1
  for (const b of ranges) { check(b.start === next && b.end >= b.start, `${f.path}: blame gap or overlap`); commit(b.sha, f.path); next = b.end + 1 }
  check(next === f.content.split("\n").length + 1, `${f.path}: incomplete blame`)
  for (const symbol of f.symbols ?? []) check(symbol.line >= 1 && symbol.line <= f.content.split("\n").length && f.content.split("\n")[symbol.line - 1].includes(symbol.name), `${f.path}: symbol location`)
}
const omitted = sha => data.omittedCommits.some(x => x.sha === sha)
for (const o of data.omittedCommits) for (const p of o.parents) commit(p, `${o.sha}: omitted commit parent`)
for (const t of data.tree) {
  // A tree row keeps its real last-touch commit, even when that commit is left out.
  check(data.commits.some(x => x.sha === t.sha) || omitted(t.sha), `${t.path}: missing commits.sha=${t.sha}`)
  if (t.path.includes("/")) check(data.tree.some(x => x.path === t.path.slice(0, t.path.lastIndexOf("/")) && x.kind === "dir"), `${t.path}: missing parent`)
}
for (const c of data.commits) {
  person(c.author, c.title); timestamp(c.date, c.title)
  check(/^[0-9a-f]{40}$/.test(c.sha), `${c.title}: invalid SHA`)
  if (c.agent) { run(c.agent.run, c.title); exists("flows", "name", c.agent.flow, c.title); person(c.agent.for, c.title); check(c.agent.harness === data.runs.find(x => x.id === c.agent.run).harness, `${c.title}: harness mismatch`) }
  for (const p of c.parents) check(data.commits.some(x => x.sha === p) || omitted(p) || c === data.commits.at(-1), `${c.title}: missing interior parent`)
}
for (const c of data.commits.slice(0, 25)) check(c.files.length > 0, `${c.title}: missing supplied diffstat`)
for (const c of data.commits.slice(0, 10)) check(c.files.some(x => x.lines.some(l => l.kind === "hunk")), `${c.title}: missing reconstructed preview`)
for (const issue of data.issues) {
  person(issue.author, issue.title); timestamp(issue.opened, issue.title)
  for (const label of issue.labels) exists("labels", "name", label, issue.title)
  for (const event of issue.events) { person(event.actor, issue.title); if (event.sha) commit(event.sha, issue.title) }
  if (issue.todo) { exists("stack", "id", issue.todo, issue.title); check(data.stack.find(x => x.id === issue.todo).issue === issue.n, `${issue.title}: queue reciprocity`) }
  const r = issue.receipt
  if (r) {
    check(issue.state === "closed", `${issue.n}: receipt on open issue`)
    person(r.reported.by, issue.title); person(r.accepted.by, issue.title); run(r.working.run, issue.title); commit(r.landed.sha, issue.title)
    check(data.commits.find(x => x.sha === r.landed.sha).branches.includes("main"), `${issue.n}: receipt not on main`)
    const times = [r.reported.date, r.accepted.date, r.working.date, r.landed.date].map(Date.parse)
    check(times.every((x, i) => i === 0 || x >= times[i - 1]), `${issue.n}: receipt chronology`)
  }
}
for (const pull of data.pulls) { person(pull.author, pull.title); exists("branches", "name", pull.base, pull.title) }
for (const s of data.stack) {
  person(s.owner, s.id); check(s.owner === "lander", `${s.id}: only the lander owns landing`)
  if (s.issue) exists("issues", "n", s.issue, s.id)
  if (s.run) run(s.run, s.id)
  if (s.state === "failed") check(Boolean(s.failure), `${s.id}: actionable refusal`)
}
for (const state of ["queued", "working", "merged", "failed"]) check(data.stack.some(x => x.state === state), `Landing queue state ${state}`)
for (const r of data.runs) {
  exists("flows", "name", r.flow, r.id); person(r.trigger.by, r.id); timestamp(r.started, r.id)
  if (r.finished) { timestamp(r.finished, r.id); check(Date.parse(r.finished) >= Date.parse(r.started), `${r.id}: negative duration`) }
  if (r.branch) exists("branches", "name", r.branch, r.id)
  for (const id of r.approvals) { exists("approvals", "id", id, r.id); check(data.approvals.find(x => x.id === id).run === r.id, `${r.id}: approval reciprocity`) }
  if (r.state === "waiting") check(r.approvals.length > 0, `${r.id}: waiting approval`)
  if (r.state === "failed") { check(Boolean(r.failure?.reason), `${r.id}: reason`); check(r.stages.some(x => x.id === r.failure.stage && x.state === "failed"), `${r.id}: failed stage`) }
  for (const event of r.trace) check(r.stages.some(x => x.id === event.stage), `${r.id}: trace stage`)
}
for (const a of data.approvals) { run(a.run, a.id); person(a.askedOf, a.id); check(a.askedOf === "maya", `${a.id}: owner decides`) }
for (const flow of data.flows) {
  exists("files", "path", flow.file, flow.name)
  for (const role of flow.roles) exists("agents", "id", role.agent, flow.name)
  for (const id of flow.runs) { run(id, flow.name); check(data.runs.find(x => x.id === id).flow === flow.name, `${flow.name}: run reciprocity`) }
  for (const edge of flow.graph.edges) check(edge.every(id => flow.graph.nodes.some(x => x.id === id)), `${flow.name}: graph edge`)
}
for (const b of data.branches) { commit(b.head, b.name); person(b.author, b.name); if (b.run) run(b.run, b.name) }
for (const d of data.docs) {
  const path = `${data.repo.config.docs.root}/${d.slug === "index" ? "README" : d.slug}.md`
  check(data.files.find(x => x.path === path)?.content === d.body, `${d.slug}: docs drift`)
}
check(data.docs.length === 6 && data.releases.length === 4 && data.releases[0].prerelease, "Six docs and four releases")
check(!data.releases.some(x => x.tag.endsWith("rc.13")), "rc.13 is the next cut, not a completed release")
const sourceHome = JSON.parse(readSource(".smithers/home.json")).blocks
sourceHome.find(block => block.type === "prompt").title = "Ask about Smithers"
sourceHome.push({ type: "links", links: [{ label: "Install Smithers", url: "/" }, { label: "Docs", url: "smithers.sh/docs" }, { label: "Report a bug", url: "bug" }, { label: "Fixed by agents", url: "issues?q=is:fixed-by-agents" }] })
check(JSON.stringify(data.repo.config.home.slice(1, sourceHome.length + 1)) === JSON.stringify(sourceHome), "PM home.json blocks remain after the configured introduction")
check(data.repo.config.home[0].type === "text" && data.repo.config.home[0].text === data.repo.description, "Home introduction uses repository description")
const fixed = data.repo.config.home.find(x => x.type === "fixed-by-agents").issues
check(fixed.length === 4 && fixed.every(n => data.issues.find(x => x.n === n)?.receipt?.landed), "Four fixed-by-agents receipts")
for (const block of data.repo.config.home.filter(x => x.type === "links")) for (const link of block.links) check(typeof link.url === "string" && !link.href, "Home links use url")
for (const sample of data.ask) {
  for (const card of sample.cards ?? []) {
    const map = { file: ["files", "path"], issue: ["issues", "n"], pull: ["pulls", "n"], run: ["runs", "id"], commit: ["commits", "sha"], flow: ["flows", "name"] }
    const [name, key] = map[card.kind]; exists(name, key, key === "n" ? Number(card.ref) : card.ref, sample.question)
  }
  for (const match of sample.answer.matchAll(/\/blob\/main\/([^?)]+)\?L=(\d+)/g)) check(Number(match[2]) <= data.files.find(x => x.path === match[1])?.content.split("\n").length, `${sample.question}: citation line`)
}
for (const secret of data.settings.secrets) check(!("value" in secret), "Secret value leaked")
check(data.repo.config.evals?.title === "Evals", "Evals tab configured")
check(data.evals.length === 5, "Four repository suite/fixture families and one imported snapshot")
for (const suite of data.evals) {
  if (suite.unexecuted) check(suite.id === "authoring" && suite.latest.state === "inconclusive" && suite.runnable === false, `${suite.id}: only the documented authoring snapshot has unexecuted placeholders`)
  if (suite.importedSnapshot) check(suite.id === "swebench" && Object.hasOwn(importedSnapshots, suite.file) && suite.sourceFile === suite.file && suite.runnable === false, `${suite.id}: only the documented SWE-bench snapshot may omit a repository file`)
  else exists("files", "path", suite.file, suite.id)
  run(suite.latest.run, suite.id)
  timestamp(suite.latest.date, suite.id)
  check(suite.latest.total === suite.cases.length && suite.latest.passed === suite.cases.filter(x => x.passed).length, `${suite.id}: case totals`)
  check(new Set(suite.cases.map(x => x.id)).size === suite.cases.length, `${suite.id}: duplicate cases`)
  // Unexecuted authoring rows have no verdict; 0/0 placeholders must not pass.
  // SOURCES.md records this state, distinct from every executed case threshold.
  for (const c of suite.cases) check(c.score >= 0 && c.score <= 1 && c.baseline >= 0 && c.baseline <= 1 && (suite.unexecuted ? c.score === 0 && c.baseline === 0 && c.passed === false : c.passed === (c.score >= c.baseline)), `${suite.id}/${c.id}: case score/verdict`)
  for (const point of suite.history) { timestamp(point.date, suite.id); check(Date.parse(point.date) <= Date.parse(suite.latest.date), `${suite.id}: history after latest`); check(point.score >= 0 && point.score <= 1, `${suite.id}: history range`) }
  check(suite.unexecuted ? suite.history.length === 0 && suite.latest.passed === 0 : suite.history.length === 1 && suite.history.at(-1).score === suite.latest.score, `${suite.id}: latest history score`)
}
const swe = data.evals.find(x => x.id === "swebench")
check(swe.importedSnapshot === true && swe.note.includes("not in this repository"), "SWE-bench must disclose its non-repository source")
const scorecard = JSON.parse(readFileSync(resolve(here, importedSnapshots[swe.file][0]), "utf8"))
check(scorecard.instances.length === swe.cases.length && scorecard.instances.every((row, i) => swe.cases[i].id === row.instanceId && swe.cases[i].score === Number(row.quality.verdict === "resolved") && swe.cases[i].baseline === Number(row.baseline.verdict === "resolved")), "SWE-bench cases preserve the imported scorecard outcomes")
check(swe.note.includes("Recorded fixture wave") && swe.latest.passed === 1 && swe.latest.total === 5 && swe.latest.score === 0.2 && swe.latest.baseline === 1 && swe.runnable === false, "SWE-bench is the recorded 1/5 vs 5/5 fixture, not a live claim")
check(data.evals.find(x => x.id === "authoring").latest.state === "inconclusive", "No fabricated authoring execution receipt")
const expectedCounts = { commits: data.commits.length, branches: data.branches.length, tags: data.tags.length, issuesOpen: data.issues.filter(x => x.state === "open").length, pullsOpen: data.pulls.filter(x => ["open", "draft"].includes(x.state)).length, runsActive: data.runs.filter(x => ["queued", "running", "waiting"].includes(x.state)).length, contributors: data.people.length }
check(JSON.stringify(data.repo.counts) === JSON.stringify(expectedCounts), "Header counts disagree")
console.log(`PASS ${checks} checks · ${subjects.length} JSON fields · Dataset type contract · cast scan ${castFiles} JSON files`)
for (const name of subjects) console.log(`${name}.json: ${Array.isArray(data[name]) ? data[name].length : 1}`)
console.log("Source blobs, history identity/messages, author filtering, references, approvals, queue, receipts, citations, home blocks and counts verified.")
console.log("Limits: diffs/runs/queue/settings/blame are illustrative; old tag tips are outside the 100-commit export; left-out records are listed in SOURCES.md.")
