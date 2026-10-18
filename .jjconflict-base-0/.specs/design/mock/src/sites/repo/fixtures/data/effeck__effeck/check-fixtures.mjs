#!/usr/bin/env node
/** VibeLang fixture validation: dependency-free, read-only, without a browser. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const fields = ["MOCK_NOW","repo","people","tree","files","blame","commits","branches","tags","labels","issues","pulls","stack","runs","approvals","flows","agents","wiki","docs","releases","settings","ask","evals"]
const data = Object.fromEntries(fields.map(name => [name, JSON.parse(readFileSync(new URL("./" + name + ".json", import.meta.url), "utf8"))]))
const { MOCK_NOW, repo, people, tree, files, blame, commits, branches, tags, labels, issues, pulls, stack, runs, approvals, flows, agents, wiki, docs, releases, settings, ask } = data
// Left-out source commits keep only their real SHA and parents, so history walks through them.
const omittedCommits = JSON.parse(readFileSync(new URL("./omittedCommits.json", import.meta.url), "utf8"))
let checks = 0
const check = (ok, why) => { checks++; assert.ok(ok, why) }
const find = (items, key, value, where) => {
  const result = items.find(item => item[key] === value)
  check(Boolean(result), where + ": unresolved " + key + " " + value)
  return result
}
const person = (value, where) => find(people, "login", value, where)
const commit = (value, where) => { check(/^[a-f0-9]{40}$/.test(value), where + ": SHA format"); return find(commits, "sha", value, where) }
const omitted = sha => omittedCommits.some(o => o.sha === sha)
// A tree row or blame range keeps its real last-touch commit, even when that commit is left out.
const known = (value, where) => { check(/^[a-f0-9]{40}$/.test(value), where + ": SHA format"); check(commits.some(c => c.sha === value) || omitted(value), where + ": unresolved sha " + value) }
const run = (value, where) => find(runs, "id", value, where)
const issue = (value, where) => find(issues, "n", value, where)
const pull = (value, where) => find(pulls, "n", value, where)
const file = (value, where) => find(files, "path", value, where)
const date = (value, where) => check(Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.parse(MOCK_NOW), where + ": invalid/future date " + value)
function mark(item, where) {
  if (item.author === "smithers-agent") check(Boolean(item.agent), where + ": agent mark")
  if (!item.agent) return
  const r = run(item.agent.run, where)
  find(flows, "name", item.agent.flow, where); person(item.agent.for, where)
  check(r.flow === item.agent.flow && r.harness === item.agent.harness, where + ": run identity")
}
function patches(items, where) {
  for (const f of items) {
    check(f.lines.some(l => l.kind === "hunk"), where + "/" + f.path + ": missing hunk")
    check(f.additions === f.lines.filter(l => l.kind === "add").length, where + ": additions")
    check(f.deletions === f.lines.filter(l => l.kind === "del").length, where + ": deletions")
    check(f.additions + f.deletions > 0, where + ": empty patch")
    for (const l of f.lines) {
      check(["hunk","ctx","add","del"].includes(l.kind), where + ": diff kind")
      if (l.kind === "add" || l.kind === "ctx") check(Number.isInteger(l.new) && l.new > 0, where + ": new line")
      if (l.kind === "del" || l.kind === "ctx") check(Number.isInteger(l.old) && l.old > 0, where + ": old line")
    }
  }
}
for (const [items,key] of [[people,"login"],[tree,"path"],[files,"path"],[commits,"sha"],[branches,"name"],[tags,"name"],[labels,"name"],[issues,"n"],[pulls,"n"],[stack,"id"],[runs,"id"],[approvals,"id"],[flows,"name"],[agents,"id"],[wiki,"slug"],[docs,"slug"],[releases,"tag"],[ask,"view"]]) check(new Set(items.map(item => item[key])).size === items.length, "Duplicate " + key)
check(MOCK_NOW === "2026-10-18T05:00:00Z", "Mock clock")
check(repo.slug === "effeck/effeck" && repo.description === "Effect, as a language.", "Repo identity")
check(repo.github === null && repo.visibility === "public", "Private upstream must not become a public GitHub link")
const counts = { commits: commits.length, branches: branches.length, tags: tags.length, issuesOpen: issues.filter(i => i.state === "open").length, pullsOpen: pulls.filter(p => ["open","draft"].includes(p.state)).length, runsActive: runs.filter(r => ["running","waiting","queued"].includes(r.state)).length, contributors: new Set(commits.filter(c => c.author !== "smithers-agent").map(c => c.author)).size }
for (const [name,count] of Object.entries(counts)) check(repo.counts[name] === count, "repo.counts." + name)
check(people.map(p => p.login).sort().join(",") === ["dev-ahn","cora","maya","smithers-agent"].sort().join(","), "Cast")
check(issues.length === 20 && pulls.length === 9 && commits.length === 78 && omittedCommits.length === 3, "Original issue/pull sizes; 80-commit history minus three left-out commits, plus one mock review example")
for (const o of omittedCommits) {
  check(!commits.some(c => c.sha === o.sha) && Object.keys(o).join() === "sha,parents", o.sha + ": left-out commit keeps only identity and parents")
  for (const p of o.parents) commit(p, o.sha + ": left-out commit parent")
  check(commits.some(c => c.parents.includes(o.sha)), o.sha + ": left-out commit bridges history")
  for (const r of runs) check(!JSON.stringify(r).includes(o.sha.slice(0, 8)), r.id + ": run points at left-out commit " + o.sha)
}
check(wiki.length === 4 && docs.length === 6, "Wiki/docs sizes")
check(repo.config.docs.root === "docs" && repo.config.docs.title === "Docs" && repo.config.tabs === undefined, "Default tabs and docs")
const home = JSON.parse(file(".smithers/home.json", "home").content).blocks
check(JSON.stringify(repo.config.home.filter(b => b.type !== "fixed-by-agents")) === JSON.stringify(home), "Home mirrors source")
const fixed = repo.config.home.find(b => b.type === "fixed-by-agents")
check(fixed.issues.length === 4, "Four factory stages")
for (const n of fixed.issues) check(Boolean(issue(n,"home").receipt), "Factory receipt")
let boundaryParents = 0
for (const [index,c] of commits.entries()) {
  commit(c.sha,c.title); person(c.author,c.title); mark(c,c.title); date(c.date,c.title)
  for (const sha of c.parents) {
    check(/^[a-f0-9]{40}$/.test(sha), "Parent SHA")
    if (!commits.some(parent => parent.sha === sha) && !omitted(sha)) { boundaryParents++; check(index === commits.length - 1, "Only last commit has an external parent") }
  }
  for (const b of c.branches) find(branches,"name",b,c.title)
  if (c.pull) pull(c.pull,c.title)
  for (const cc of c.checks) if (cc.run) run(cc.run,c.title)
  patches(c.files,c.title)
}
check(boundaryParents === 1, "One documented history boundary")
check(commits.slice(0,8).every(c => c.files.length), "Newest eight commits have real hunks")
check(commits.every(c => c.agent), "All coauthors have agent marks")
for (const e of tree) {
  known(e.sha,e.path)
  if (e.path.includes("/")) check(tree.some(p => p.kind === "dir" && p.path === e.path.slice(0,e.path.lastIndexOf("/"))), e.path + ": parent directory")
  if (e.kind === "file") check(e.size === Buffer.byteLength(file(e.path,"tree").content), e.path + ": byte size")
}
let symbolCount = 0, crossFileCount = 0, diagnosticFiles = 0
for (const f of files) {
  find(tree,"path",f.path,"blob")
  const lines = f.content.split("\n")
  check(f.content.length > 0, f.path + ": nonempty complete source")
  for (const s of f.symbols ?? []) {
    symbolCount++
    check(s.line > 0 && s.line <= lines.length && lines[s.line - 1].includes(s.name), f.path + ": symbol line")
    check(Boolean(s.hover) && !s.hover.includes("inferred local TypeScript") && !s.hover.includes("unknown —"), f.path + ": concrete type")
    if (s.definition) {
      const dest = file(s.definition.path,"definition").content.split("\n")
      check(s.definition.line > 0 && s.definition.line <= dest.length && dest[s.definition.line - 1].includes(s.name), f.path + ": definition target")
      if (s.definition.path !== f.path) crossFileCount++
    }
  }
  if (f.path.endsWith(".vibe")) check(f.symbols?.length > 0, f.path + ": VibeLang hovers")
  if (f.diagnostics?.length) diagnosticFiles++
  for (const d of f.diagnostics ?? []) check(d.line > 0 && d.line <= lines.length && /EK\d{4}:/.test(d.message) && d.source === "VibeLang", f.path + ": diagnostic")
  let next = 1
  for (const b of blame.filter(b => b.path === f.path).sort((a,b) => a.start - b.start)) {
    check(b.start === next && b.end >= b.start, f.path + ": blame gap/overlap")
    known(b.sha,"blame"); next = b.end + 1
  }
  check(next === lines.length + 1, f.path + ": blame coverage")
}
check(diagnosticFiles === 2 && crossFileCount > 20, "Two diagnostic files and cross-file intelligence")
for (const b of branches) { commit(b.head,b.name); person(b.author,b.name); date(b.updated,b.name); if (b.pull) pull(b.pull,b.name); if (b.run) run(b.run,b.name) }
check(branches.find(b => b.name === "main").protected, "Protected main")
for (const t of tags) { commit(t.sha,t.name); if (t.release) find(releases,"tag",t.name,"tag") }
for (const i of issues) {
  person(i.author,i.title); date(i.opened,i.title); date(i.updated,i.title)
  for (const a of i.assignees) person(a,i.title)
  for (const l of i.labels) find(labels,"name",l,i.title)
  for (const n of i.pulls) check(pull(n,i.title).fixes.includes(i.n), "Reciprocal issue/pull")
  if (i.todo) check(find(stack,"id",i.todo,i.title).issue === i.n, "Reciprocal stack")
  for (const c of i.comments) { person(c.author,i.title); mark(c,i.title); date(c.date,i.title) }
  for (const e of i.events) { person(e.actor,i.title); date(e.date,i.title); if (e.run) run(e.run,i.title); if (e.sha) commit(e.sha,i.title); if (e.pull) pull(e.pull,i.title) }
  if (!i.receipt) continue
  const r = i.receipt
  person(r.reported.by,i.title)
  if (r.accepted) check(person(r.accepted.by,i.title).kind === "human", "Human acceptance")
  if (r.working) check(run(r.working.run,i.title).issue === i.n, "Receipt run issue")
  if (r.review) check(pull(r.review.pull,i.title).fixes.includes(i.n), "Receipt review issue")
  if (r.landed) { check(commit(r.landed.sha,i.title).branches.includes("main"), "Landed on main"); check(pull(r.review.pull,i.title).merged.sha === r.landed.sha, "Receipt landing SHA") }
  const stamps = [r.reported.date,r.accepted?.date,r.working?.date,r.review?.date,r.landed?.date].filter(Boolean)
  stamps.forEach((d,j) => { date(d,i.title); if (j) check(Date.parse(stamps[j-1]) <= Date.parse(d), "Factory stage order") })
}
check(Boolean(issue(31,"factory").receipt.landed), "Complete factory example")
for (const p of pulls) {
  person(p.author,p.title); mark(p,p.title); patches(p.files,p.title)
  for (const sha of p.commits) commit(sha,p.title)
  for (const n of p.fixes) check(issue(n,p.title).pulls.includes(p.n), "Reciprocal pull")
  for (const c of [...p.comments,...p.reviews,...p.reviewComments]) { person(c.author,p.title); mark(c,p.title) }
  for (const cc of p.checks) if (cc.run) run(cc.run,p.title)
  if (p.merged) { check(person(p.merged.by,p.title).kind === "human", "Human landing"); check(commit(p.merged.sha,p.title).branches.includes("main"), "Merge on main"); date(p.merged.date,p.title) }
}
for (const s of stack) { person(s.owner,s.id); if (s.issue) issue(s.issue,s.id); if (s.pull) pull(s.pull,s.id); if (s.run) run(s.run,s.id); if (s.state === "failed") check(Boolean(s.failure),"Actionable stack failure"); if (s.state === "needs-answer") check(s.question.options.length >= 2,"Stack question") }
for (const state of ["queued","working","needs-answer","ready","failed","merged"]) check(stack.some(s => s.state === state), "Stack state " + state)
for (const r of runs) {
  find(flows,"name",r.flow,r.id); person(r.trigger.by,r.id); date(r.started,r.id)
  if (r.finished) date(r.finished,r.id)
  if (r.issue) issue(r.issue,r.id)
  if (r.pull) pull(r.pull,r.id)
  if (r.branch) find(branches,"name",r.branch,r.id)
  check((r.id === "run-convert-golden-eval" ? r.stages.length === 2 : r.stages.length >= 3 && r.stages.length <= 6) && r.cost.tokens > 0 && r.cost.usd >= 0, "Run stages/usage")
  if (r.state === "failed") { check(Boolean(r.failure.reason),"Actionable run failure"); find(r.stages,"id",r.failure.stage,r.id) }
  if (r.state === "waiting") check(r.approvals.some(id => find(approvals,"id",id,r.id).state === "waiting"), "Waiting approval")
  for (const id of r.approvals) check(find(approvals,"id",id,r.id).run === r.id, "Reciprocal approval")
  for (const e of r.trace) { find(r.stages,"id",e.stage,r.id); date(e.at,r.id) }
}
for (const state of ["queued","running","waiting","failed","succeeded","cancelled"]) check(runs.some(r => r.state === state), "Run state " + state)
check(runs.some(r => r.resumed), "Persisted recovery")
for (const a of approvals) { run(a.run,a.id); check(person(a.askedOf,a.id).kind === "human","Human approval"); if (a.decided) check(person(a.decided.by,a.id).kind === "human","Human decision") }
for (const f of flows) { file(f.file,f.name); for (const id of f.runs) check(run(id,f.name).flow === f.name,"Flow run"); for (const role of f.roles) find(agents,"id",role.agent,f.name); for (const [a,b] of f.graph.edges) { find(f.graph.nodes,"id",a,f.name); find(f.graph.nodes,"id",b,f.name) } }
for (const a of agents) for (const f of a.flows) find(flows,"name",f,a.id)
for (const w of wiki) { person(w.author,w.title); if (w.provenance.run) run(w.provenance.run,w.title); if (w.author === "smithers-agent") check(Boolean(w.provenance.run),"Agent wiki provenance"); for (const l of w.body.matchAll(/\]\(wiki:([^)]+)\)/g)) find(wiki,"slug",l[1],w.title) }
for (const d of docs) { const aliases = JSON.parse(readFileSync(new URL("./path-aliases.json", import.meta.url), "utf8")); const path = "docs/" + d.slug + ".md"; const f = file(aliases[path] ?? path,d.title); check(d.body === f.content && f.symbols.length > 0,"Docs source/hovers") }
for (const r of releases) { find(tags,"name",r.tag,"release"); person(r.author,r.tag); check(r.name.endsWith(JSON.parse(file("packages/create-vibelang/package.json","version").content).version),"Observed package version") }
for (const m of [...settings.members,...settings.invites]) person(m.login,"settings")
for (const s of settings.secrets) { check(!("value" in s),"Secret opacity"); for (const f of s.usedBy) find(flows,"name",f,s.name) }
for (const a of ask) for (const c of a.cards ?? []) { if (c.kind === "file") file(c.ref,"Ask"); if (c.kind === "issue") issue(Number(c.ref),"Ask"); if (c.kind === "pull") pull(Number(c.ref),"Ask"); if (c.kind === "run") run(c.ref,"Ask"); if (c.kind === "commit") commit(c.ref,"Ask"); if (c.kind === "flow") find(flows,"name",c.ref,"Ask") }
for (const body of [...ask.map(a => a.answer),...wiki.map(w => w.body)]) for (const l of body.matchAll(/\/blob\/main\/([^?)]+)\?L=(\d+)/g)) check(Number(l[2]) <= file(l[1],"citation").content.split("\n").length,"Citation line")
check(ask[0].answer.includes("npm create vibelang@latest my-app"),"Exact create command")
check(repo.config.evals.title === "Golden set", "Declared Golden set tab")
check(data.evals.length === 2, "Converter and docs suites")
for (const suite of data.evals) {
  file(suite.file, suite.id); run(suite.latest.run, suite.id); date(suite.latest.date, suite.id)
  check(suite.latest.total === suite.cases.length, "Case total")
  check(suite.latest.passed === suite.cases.filter(c => c.passed).length, "Pass total")
  check(suite.latest.score === suite.latest.passed / suite.latest.total, "Compile score")
  if (suite.id === "convert-golden") {
    check(suite.unexecuted && suite.latest.state === "inconclusive" && suite.latest.passed === 0 && suite.latest.score === 0, "Unexecuted gate has no passing outputs")
    check(suite.history.length === 0 && suite.gate.holdout === "invalid", "Invalid holdout excluded from gate history")
    check(Object.values(suite.gate.identities).every(value => value === null), "Missing execution identities remain missing")
  } else check(suite.history.at(-1).score === suite.latest.score, "Latest history point")
  for (const entry of suite.cases) {
    check(Boolean(entry.expected), entry.id + ": expected reference exists")
    if (suite.id === "convert-golden") check(entry.actual === null && entry.diagnostics === null && !entry.passed && entry.detail.includes("Model conversion not run"), entry.id + ": unexecuted actuals stay absent")
    else check(entry.detail.includes(entry.expected.trimEnd()), entry.id + ": expected code in detail")
    check(entry.score === Number(entry.passed), entry.id + ": binary compile score")
    check(file(entry.source, entry.id).content.includes(entry.expected), entry.id + ": expected source")
  }
}
const golden = data.evals.find(suite => suite.id === "convert-golden")
check(golden.threshold === "Required: 16/20 actual outputs compile, including the hero", "Exact converter gate")
check(golden.cases.length === 20 && golden.cases[0].id === "01-hero-batch-lookup" && !golden.cases[0].passed, "Twenty cases, hero included")
check(golden.latest.passed < 16 && golden.latest.state !== "pass" && golden.runnable === false, "Converter gate remains off")
check(golden.note.includes("holdout invalid") && golden.note.includes("Converter off"), "No execution or Monday readiness claim")
check(file(".smithers/flows/convert/build-prompt.mjs", "prompt").content.includes("exampleCases().map") && !file(".smithers/flows/convert/build-prompt.mjs", "prompt").content.includes("goldenCases().map"), "Pinned prompt uses separate examples, never golden cases")
console.log("PASS " + checks + " checks · " + fields.length + " Dataset fields")
console.log(symbolCount + " symbols · " + crossFileCount + " cross-file definitions · " + diagnosticFiles + " files with compiler diagnostics")
console.log("Newest 8 commits have real hunks; 4 factory receipts resolve; 1 external history parent.")
console.log(fields.map(name => name + ".json=" + (Array.isArray(data[name]) ? data[name].length : 1)).join(" · "))
