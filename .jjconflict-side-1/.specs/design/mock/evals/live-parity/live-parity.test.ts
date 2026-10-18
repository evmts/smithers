/** Offline: node --import ./.specs/design/mock/evals/mock-fidelity/test-runtime.mjs --test ./.specs/design/mock/evals/live-parity/live-parity.test.ts
 * Bun: bun test --preload ./.specs/design/mock/evals/mock-fidelity/test-runtime.mjs ./.specs/design/mock/evals/live-parity/live-parity.test.ts */
import { strict as assert } from "node:assert"
import { test } from "node:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { monday, mondaySpec, isCutView, incrementFor } from "./monday.ts"
import { routes, mapRoute, storiesFor, stageOneViews, type RouteMap } from "./routes.ts"
import { collectPairs, readOnlyRequest, type CapturePage } from "./browser.ts"
import { copyKeys, labelClass, liveClean, structureParity, visibleCuts } from "./scoring.ts"
import { views, makeExecutor, makeScorers, makeSuite, parseSections, options } from "./live-parity.eval.ts"
import { renderGaps, loadRun } from "./gaps.mjs"
import type { Capture, Options, ParityOutput } from "./model.ts"
import type { SitePayload } from "../mock-fidelity/scoring.ts"
const spec = views.find(v => v.id === "issues")!
const route = (path = "/issues", query = "as=in&role=member&net=ok&data=full") => `smithers.sh/maya/tinyhttp${path}?${query}`
const site: SitePayload = { site: "default", routes: ["smithers.sh/:owner/:repo/issues", "smithers.sh/:owner/:repo/issues/:n"], screens: [
  { id: "issues-list-open", route: route() }, { id: "issues-list-signed-out", route: route("/issues", "as=out") },
  { id: "issues-list-error", route: route("/issues", "as=in&net=error") }, { id: "issues-list-empty", route: route("/issues", "as=in&data=empty") },
  { id: "issues-list-loading", route: route("/issues", "as=in&net=slow") }, { id: "issues-detail-reader-denied", route: route("/issues/31", "as=in&role=reader") },
  { id: "other-repo", route: "smithers.sh/Effect-TS/effect/issues?as=out" }
] }
const settings: Options = { dist: "dist-default-ui", liveBase: "https://example.test", liveRepo: "team/repo", runDir: "/tmp/live-parity-test", auth: "member.json" }
const capture = (changes: Partial<Capture> = {}): Capture => ({
  id: "issues-list-open", route: route(), width: 1440, theme: "light", resolved: "/issues", text: "Issues New issue", headings: ["Issues"],
  buttons: [], links: [], primary: null, primaries: [], problems: [], screenshot: "/tmp/mock.png", status: 200,
  structure: { tabs: ["Code", "Issues 23", "Pull requests 4", "Flows", "Settings"], header: { waiting: false, ask: true, sync: true }, sidebars: ["Ask"] }, ...changes
})
const output = (changes: Partial<ParityOutput> = {}): ParityOutput => ({ view: "issues", spec, dist: "dist-default-ui", liveBase: settings.liveBase, liveRepo: settings.liveRepo,
  outcome: "compared", unobservable: [], pairs: [{ id: "issues-list-open", state: "ready", width: 1440, outcome: "compared", mock: capture(), live: capture({ screenshot: "/tmp/live.png" }) }], ...changes })
const judgeReply = (reason = 'Gaps: []\nUnobservable: []') => JSON.stringify({ scores: { "github-anatomy": 5, "primary-action": 5, "smithers-powers": 5 }, reason })
const quiet = { log: () => {} }

test("maps host, repository and fixture equivalent; retains genuine query only", () => {
  const map: RouteMap = { paths: { "/issues/31": "/issues/4022" } }
  assert.deepEqual(mapRoute({ id: "x", route: route("/issues/31", "as=in&net=slow&role=member&q=is%3Aopen&page=2&L=4&model=connected") }, "issues", "https://example.test/app/", "team/repo", map), { outcome: "mapped", url: "https://example.test/app/team/repo/issues/4022?q=is%3Aopen&page=2" })
})
test("root maps without trailing slash and strips every mock flag", () => {
  assert.deepEqual(mapRoute({ id: "x", route: route("", "as=out&still=1&data=full&landing=open") }, "code-home", settings.liveBase, settings.liveRepo, { paths: {} }), { outcome: "mapped", url: "https://example.test/team/repo" })
})
test("longest exact mapping wins; prefixes retain suffix", () => {
  const map = { paths: { "/blob/main/*": "/blob/main/packages/", "/blob/main/README.md": "/blob/main/README.md" } }
  assert.equal((mapRoute({ id: "x", route: route("/blob/main/README.md") }, "file", settings.liveBase, settings.liveRepo, map) as { url: string }).url, "https://example.test/team/repo/blob/main/README.md")
  assert.equal((mapRoute({ id: "x", route: route("/blob/main/x.ts") }, "file", settings.liveBase, settings.liveRepo, map) as { url: string }).url, "https://example.test/team/repo/blob/main/packages/x.ts")
})
test("null mappings, unconfigured records and view overrides are not deployed", () => {
  for (const map of ([{ paths: { "/issues/31": null } }, { paths: {} }, { paths: {}, views: { issues: null } }] as RouteMap[])) assert.equal(mapRoute({ id: "x", route: route("/issues/31") }, "issues", settings.liveBase, settings.liveRepo, map).outcome, "not deployed")
})
test("interaction flags cannot falsely compare a dialog with its base live page", () => {
  assert.equal(mapRoute({ id: "x", route: route("/issues", "as=in&dialog=new") }, "issues", settings.liveBase, settings.liveRepo).outcome, "not deployed")
})
test("rejects unsafe base/repo/target URLs and other fixture repositories", () => {
  for (const base of ["file:///tmp/a", "https://user:secret@example.test", "https://example.test?q=x"]) assert.throws(() => mapRoute(site.screens[0]!, "issues", base, settings.liveRepo))
  for (const repo of ["../repo", "a/b/c", "a/..", "a/b?x"]) assert.throws(() => mapRoute(site.screens[0]!, "issues", settings.liveBase, repo))
  for (const path of ["//evil.test", "/../logout", "/%2e%2e/logout", "/issues?act=delete"]) assert.throws(() => mapRoute(site.screens[0]!, "issues", settings.liveBase, settings.liveRepo, { paths: { "/issues": path } }))
  assert.equal(mapRoute(site.screens.at(-1)!, "issues", settings.liveBase, settings.liveRepo).outcome, "not deployed")
  assert.equal(mapRoute({ id: "new", route: route("/issues/new") }, "issues", settings.liveBase, settings.liveRepo).outcome, "mapped")
})
test("story selection excludes network, empty, denied and non-stage-1 screens; no auth selects signed out only", () => {
  assert.deepEqual(storiesFor(spec, site, false).map(s => s.id), ["issues-list-signed-out"])
  assert.deepEqual(storiesFor(spec, site, true).map(s => s.id), ["issues-list-open", "issues-list-signed-out"])
  assert.ok(!stageOneViews(views, site).some(v => v.id.startsWith("effect-") || v.id === "smithers-evals"))
})
test("request firewall refuses writes, socket schemes, dangerous GET paths and actions", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) assert.equal(readOnlyRequest(method, "https://example.test/api"), false)
  for (const path of ["/logout", "/auth/callback", "/api/pull/1/merge", "/api/approve", "/issues?action=delete"]) assert.equal(readOnlyRequest("GET", `https://example.test${path}`), false)
  assert.equal(readOnlyRequest("GET", "wss://example.test/stream"), false)
  assert.equal(readOnlyRequest("GET", "https://example.test/team/repo/issues?q=is%3Aopen"), true)
  // A contents read names a file: a flow called "land" is a path, not a land action (port-p0, 2026-10-19).
  assert.equal(readOnlyRequest("GET", "https://example.test/api/repos/team/repo/contents/.smithers/flows/land?ref=main"), true)
  assert.equal(readOnlyRequest("GET", "https://example.test/api/repos/team/repo/land"), false)
})
test("fake collector pairs light desktop/phone and uses auth only for member live pages", async () => {
  const calls: Parameters<CapturePage>[0][] = []
  const result = await collectPairs(spec, site, settings, async request => { calls.push(request); return capture({ id: request.id, screenshot: request.screenshot, width: request.width }) })
  assert.equal(result.pairs.length, 4)
  assert.equal(calls.length, 8)
  assert.ok(calls.every(c => [1440, 390].includes(c.width)))
  assert.deepEqual(calls.filter(c => c.auth).map(c => c.id), ["issues-list-open", "issues-list-open"])
  assert.ok(calls.every(c => c.screenshot.endsWith(`-${c.side}-${c.width}.png`)))
  assert.ok(calls.some(c => c.screenshot.endsWith("/issues-mock-1440.png")))
})
test("missing equivalent captures mock only and remains unscorable, never zero", async () => {
  const calls: string[] = []
  const result = await collectPairs(spec, site, settings, async req => { calls.push(req.side); return capture() }, { paths: {}, views: { issues: null } })
  assert.equal(result.outcome, "not deployed")
  assert.deepEqual(calls, ["mock", "mock", "mock", "mock"])
  assert.ok("inconclusive" in liveClean(result))
  assert.equal(structureParity(result).score, undefined)
})
for (const status of [404, 410, 500, 403]) test(`HTTP ${status} has an honest outcome`, async () => {
  const result = await collectPairs(spec, { ...site, screens: [site.screens[0]!] }, settings, async req => capture({ status: req.side === "live" ? status : 200 }))
  assert.equal(result.outcome, [404, 410].includes(status) ? "not deployed" : status === 403 ? "auth required" : "inconclusive")
})
test("expired member state redirect is auth required", async () => {
  const result = await collectPairs(spec, { ...site, screens: [site.screens[0]!] }, settings, async req => capture({ finalUrl: req.side === "live" ? "https://example.test/login" : undefined }))
  assert.equal(result.outcome, "auth required")
})
test("navigation failure is inconclusive and preserves other viewport evidence", async () => {
  const result = await collectPairs(spec, site, settings, async req => { if (req.side === "live" && req.width === 1440) throw new Error("navigation failed"); return capture() })
  assert.equal(result.outcome, "compared")
  assert.equal(result.pairs.filter(p => p.outcome === "inconclusive").length, 2)
  assert.match(result.unobservable.join(" "), /navigation failed/)
})
test("without auth never requests member page; absent public screen is auth required", async () => {
  const result = await collectPairs(spec, { ...site, screens: [site.screens[0]!] }, { ...settings, auth: undefined }, async () => { throw new Error("should not collect") })
  assert.equal(result.outcome, "auth required")
  assert.equal(result.pairs.length, 0)
})
test("structure parity normalizes counts and averages eight independent checks", () => {
  const value = output()
  value.pairs[0]!.live!.structure!.tabs[1] = "Issues 9,000"
  assert.equal(structureParity(value).score, 1)
  value.pairs[0]!.live!.structure!.header.ask = false
  const result = structureParity(value)
  assert.equal(result.score, 7 / 8)
  assert.equal(result.gaps.length, 1)
  assert.match(result.gaps[0]!, /header ask/)
  value.pairs[0]!.live!.structure!.tabs.reverse()
  assert.equal(structureParity(value).score, 6 / 8)
})
test("structure detects missing sidebar, primary label class and state-copy changes", () => {
  const value = output()
  const live = value.pairs[0]!.live!
  live.structure!.sidebars = []
  live.primaries = [{ name: "Save", title: "", primary: true, action: true }]
  live.text = "Access denied. Retry"
  const result = structureParity(value)
  assert.equal(result.score, 4 / 8)
  assert.equal(result.gaps.length, 4)
  assert.deepEqual(copyKeys("Checks passed. Your review is next. Sign in"), ["checks-passed", "human-review", "signed-out"])
  assert.equal(labelClass("New issue"), labelClass("Create issue"))
})
test("live audit reuses shared crawl math and only scores comparable observations", () => {
  const value = output()
  value.pairs[0]!.live!.problems = ["dead link", "dead link", "unlabeled field"]
  const scored = liveClean(value)
  assert.ok("score" in scored)
  assert.equal(scored.score, 0.9)
})
test("all three scorers refuse not-deployed output without calling a judge", async () => {
  let calls = 0
  for (const scorer of makeScorers(() => { calls++; return Effect.succeed(judgeReply()) }, quiet)) await assert.rejects(Effect.runPromise(scorer.score({ input: {}, output: output({ outcome: "not deployed", pairs: [] }) })), /not deployed/)
  assert.equal(calls, 0)
})
test("parity judge receives both evidence sets, spec row, and separate concrete gap lists", async () => {
  const requests: string[] = []
  const judge = makeScorers(req => { requests.push(req.prompt); return Effect.succeed(judgeReply('Gaps: ["issues/1440: live lacks Ask"]\nUnobservable: ["closed Code menu"]')) }, quiet)[2]!
  const result = await Effect.runPromise(judge.score({ input: {}, output: output() }))
  assert.match(requests[0]!, /"mock"/)
  assert.match(requests[0]!, /"live"/)
  assert.match(requests[0]!, /The tracker/)
  assert.deepEqual((result.meta as { gaps: string[] }).gaps, ["issues/1440: live lacks Ask"])
  assert.throws(() => parseSections("Gaps: none Unobservable: none"))
})
test("judge transport retries and context overflow uses exactly one shared half-budget retry", async () => {
  let calls = 0
  const audits: { budget: number }[] = []
  const judge = makeScorers(() => ++calls === 1 ? Effect.fail({ status: 503 }) : calls === 2 ? Effect.die(new Error("context_length_exceeded")) : Effect.succeed(judgeReply()), { log: a => audits.push(a), sleep: () => Effect.void })[2]!
  await Effect.runPromise(judge.score({ input: {}, output: output() }))
  assert.equal(calls, 3)
  assert.equal(audits.length, 4)
  assert.equal(audits[2]!.budget, audits[0]!.budget / 2)
})
test("repeated context overflow remains inconclusive; malformed lists are invalid_score", async () => {
  for (const reason of ["overflow", "bad reason"]) {
    let calls = 0
    const judge = makeScorers(() => { calls++; return reason === "overflow" ? Effect.fail(new Error("context_length_exceeded")) : Effect.succeed(judgeReply("Gaps: mixed prose")) }, quiet)[2]!
    await assert.rejects(Effect.runPromise(judge.score({ input: {}, output: output() })), reason === "overflow" ? /half-budget retry/ : /Gaps and Unobservable/)
    assert.equal(calls, reason === "overflow" ? 2 : 1)
  }
})
test("fake executor, persisted scores and gaps loader form a reviewable per-view report", async () => {
  const dir = await mkdtemp(join(tmpdir(), "live-parity-"))
  try {
    const value = output({ runDir: dir })
    const entry = (await Effect.runPromise(makeSuite(site))).cases.find(c => c.name === "issues")!
    const execution = await Effect.runPromise(makeExecutor(async () => value).run(entry))
    assert.equal(execution.target.name, "evals/live-parity/view")
    for (const scorer of makeScorers(() => Effect.succeed(judgeReply()), quiet)) await Effect.runPromise(scorer.score({ input: entry.input, output: execution.output }))
    const records = await loadRun(dir)
    assert.equal(records.length, 1)
    const markdown = renderGaps(records)
    assert.match(markdown, /\| issues \| 1 \| parity \| None observed/)
    assert.match(markdown, /\[mock\]\(\/tmp\/mock.png\) \/ \[live\]\(\/tmp\/live.png\)/)
    assert.ok(JSON.parse(await readFile(join(dir, "issues.parity-judge.json"), "utf8")).meta.evidenceAudits.length)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test("executor failures persist inconclusive instead of converting infrastructure to zero", async () => {
  const dir = await mkdtemp(join(tmpdir(), "live-parity-"))
  try {
    const entry = (await Effect.runPromise(makeSuite(site))).cases.find(c => c.name === "issues")!
    const execution = await Effect.runPromise(makeExecutor(async () => { throw new Error("browser launch failed") }, { ...options, runDir: dir }).run(entry))
    assert.equal((execution.output as ParityOutput).outcome, "inconclusive")
    assert.match(await readFile(join(dir, "issues.json"), "utf8"), /browser launch failed/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test("gap tables expose not deployed, partial pairs, missing scores and escaped deltas", () => {
  const value = output({ outcome: "not deployed", unobservable: ["Missing live equivalent"], pairs: [] })
  assert.match(renderGaps([{ output: value }]), /\| issues \| 1 \| not deployed/)
  const partial = output()
  partial.pairs.push({ id: "detail", width: 390, state: "ready", outcome: "not deployed", reason: "no fixture" })
  const markdown = renderGaps([{ output: partial, scores: { "structure-parity": { meta: { gaps: ["tabs | order\nwrong"] } } } }])
  assert.match(markdown, /inconclusive \(1 unpaired\)/)
  assert.match(markdown, /tabs \\\| order<br>wrong/)
  assert.equal((renderGaps([{ output: value }, { output: value }]).match(/\| View \|/g) ?? []).length, 2)
})
test("gaps loader refuses corrupt score JSON instead of reporting parity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "live-parity-"))
  try {
    await writeFile(join(dir, "issues.json"), JSON.stringify(output()))
    await writeFile(join(dir, "issues.live-clean.json"), "not json")
    await assert.rejects(loadRun(dir))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("a missing list primary is detected without inventing a solid Open button", () => {
  const commits = views.find(v => v.id === "commits")!
  const value = output({ view: "commits", spec: commits })
  value.pairs[0]!.mock!.links = [{ name: "Fix parser", href: "#/smithers.sh/maya/tinyhttp/commit/abc", title: "" }]
  assert.equal(structureParity(value).score, 7 / 8)
  assert.match(structureParity(value).gaps[0]!, /list primary presence/)
  value.pairs[0]!.live!.links = [{ name: "Update backend", href: "/team/repo/commit/def", title: "" }]
  assert.equal(structureParity(value).score, 1)
})
test("blocked background calls remain unobservable", async () => {
  const result = await collectPairs(spec, site, settings, async req => capture({ blockedRequests: req.side === "live" ? ["Blocked POST /api/read"] : [] }))
  assert.equal(result.outcome, "compared")
  assert.match(result.unobservable.join(" "), /background behavior unobservable/)
})
test("budgeted judge output retains two bounded sides and explicit omissions", async () => {
  const value = output()
  for (const pair of value.pairs) for (const side of ["mock", "live"] as const) pair[side]!.text = "Large evidence ".repeat(100_000)
  const prompts: string[] = []
  const audits: { serializedChars: number; budget: number; dropped: unknown[] }[] = []
  const scorer = makeScorers(req => { prompts.push(req.prompt); return Effect.succeed(judgeReply()) }, { log: a => audits.push(a) })[2]!
  await Effect.runPromise(scorer.score({ input: {}, output: value }))
  assert.equal(audits.length, 2)
  assert.ok(audits.every(a => a.serializedChars <= a.budget && a.dropped.length > 0))
  assert.match(prompts[0]!, /textTruncated/)
})

const fullMock = (): Capture => capture({
  structure: { tabs: ["Code", "Issues 23", "Pull requests 4", "Runs 2", "Flows", "Wiki", "Settings"],
    header: { waiting: true, ask: true, sync: true }, sidebars: ["Ask", "Releases"] }
})
test("editable Monday policy names the PM decision, all kept increments and cuts", () => {
  assert.equal(monday.decision, "d-voicuo")
  assert.equal(monday.date, "2026-10-18")
  for (const id of ["code-home", "tree-file", "issues", "pulls", "ask"]) assert.equal(incrementFor(id), 1)
  for (const id of ["commits", "commit", "branches", "flows", "settings", "search"]) assert.equal(incrementFor(id), 2)
  for (const id of ["runs", "approvals", "blame", "releases", "wiki", "terminal", "stack"]) assert.equal(isCutView(id), true)
  assert.match(mondaySpec(views.find(v => v.id === "flows")!).powers, /Read-only/)
  assert.doesNotMatch(mondaySpec(views.find(v => v.id === "settings")!).primary, /Save/)
})
test("fake live page without cut tabs, inbox or Releases block matches the full mock minus cuts", async () => {
  const result = await collectPairs(spec, site, settings, async req => req.side === "mock" ? fullMock() : capture())
  const structure = structureParity(result)
  assert.equal(structure.score, 1)
  assert.deepEqual(structure.gaps, [])
  assert.ok(structure.cuts.some(value => /tab Runs: cut/.test(value)))
  assert.ok(structure.cuts.some(value => /header waiting: cut/.test(value)))
  assert.ok(structure.cuts.some(value => /sidebar Releases: cut/.test(value)))
  assert.deepEqual(visibleCuts(result), [])
})
test("fake live page with a cut tab is a cut-feature-visible gap even when mock has it", async () => {
  const result = await collectPairs(spec, site, settings, async req => {
    if (req.side === "mock") return fullMock()
    const live = capture(); live.structure!.tabs.splice(3, 0, "Runs 12")
    return live
  })
  assert.ok(structureParity(result).score! < 1)
  assert.match(structureParity(result).gaps.join(" "), /cut feature visible: runs/)
  const scorer = makeScorers(() => Effect.succeed(judgeReply()), quiet)[2]!
  const judged = await Effect.runPromise(scorer.score({ input: {}, output: result }))
  assert.ok(judged.score < 1)
  assert.match(JSON.stringify(judged.meta), /cut feature visible: tab runs/)
})
test("cut inbox and Releases sidebar are forbidden even when missing from the mock", () => {
  for (const part of ["waiting", "releases", "link"] as const) {
    const value = output(), live = value.pairs[0]!.live!
    if (part === "waiting") live.structure!.header.waiting = true
    if (part === "releases") live.structure!.sidebars.push("Releases")
    if (part === "link") live.links.push({ name: "Stack", href: "/team/repo/stack", title: "" })
    assert.ok(structureParity(value).score! < 1)
    assert.match(structureParity(value).gaps.join(" "), /cut feature visible/)
  }
})
test("compound sidebar blocks drop Releases and retain unrelated blocks", () => {
  const value = output()
  value.pairs[0]!.mock!.structure!.sidebars = ["Releases / Sync", "Ask"]
  value.pairs[0]!.live!.structure!.sidebars = ["Sync", "Ask"]
  assert.equal(structureParity(value).score, 1)
  value.pairs[0]!.live!.structure!.sidebars = ["Releases / Sync", "Ask"]
  assert.match(structureParity(value).gaps.join(" "), /cut feature visible: releases/)
})
test("Docs is expected only where LIVE_REPO declares it", () => {
  const value = output({ liveRepo: "smithers-canary/smithers" })
  value.pairs[0]!.mock!.structure!.tabs.splice(4, 0, "Docs")
  assert.equal(structureParity(value).score, 1)
  value.pairs[0]!.live!.structure!.tabs.splice(4, 0, "Docs")
  assert.match(structureParity(value).gaps.join(" "), /cut feature visible: docs/)
  const repo = routes.repositories![value.liveRepo]!
  const previous = repo.declaredTabs
  try {
    repo.declaredTabs = ["Docs"]
    assert.equal(structureParity(value).score, 1)
    value.pairs[0]!.mock!.structure!.tabs = value.pairs[0]!.mock!.structure!.tabs.filter(tab => tab !== "Docs")
    assert.equal(structureParity(value).score, 1)
    value.pairs[0]!.live!.structure!.tabs = value.pairs[0]!.live!.structure!.tabs.filter(tab => tab !== "Docs")
    assert.match(structureParity(value).gaps.join(" "), /tabs expected/)
  } finally { repo.declaredTabs = previous }
})
test("increment 1 hides Flows/Settings tabs and search can be explicitly cut at deadline", () => {
  const active = monday.activeIncrement
  try {
    monday.activeIncrement = 1
    const value = output()
    value.pairs[0]!.live!.structure!.tabs = ["Code", "Issues 4", "Pull requests 3"]
    assert.equal(structureParity(value).score, 1)
    value.pairs[0]!.live!.structure!.tabs.push("Flows")
    assert.match(structureParity(value).gaps.join(" "), /cut feature visible: flows/)
    assert.equal(isCutView("search"), false)
    monday.cut.views.push("search"); monday.cut.headerPieces.push("search")
    assert.equal(isCutView("search"), true)
    value.pairs[0]!.live!.structure!.header.search = true
    assert.match(structureParity(value).gaps.join(" "), /header search.*cut feature visible/)
  } finally {
    monday.activeIncrement = active
    monday.cut.views = monday.cut.views.filter(value => value !== "search")
    monday.cut.headerPieces = monday.cut.headerPieces.filter(value => value !== "search")
  }
})
test("cut views report cut before auth, mappings or captures and do not invoke an executor", async () => {
  const run = views.find(v => v.id === "runs")!
  const result = await collectPairs(run, site, { ...settings, auth: undefined }, async () => { throw new Error("must not capture") })
  assert.equal(result.outcome, "cut")
  assert.deepEqual(result.pairs, [])
  const dir = await mkdtemp(join(tmpdir(), "live-parity-cuts-"))
  try {
    const execution = await Effect.runPromise(makeExecutor(async () => { throw new Error("must not inspect") }, { ...settings, runDir: dir }).run({ name: "runs", input: { view: "runs" } } as never))
    assert.equal((execution.output as ParityOutput).outcome, "cut")
    assert.equal(JSON.parse(await readFile(join(dir, "runs.json"), "utf8")).outcome, "cut")
    for (const scorer of makeScorers(() => { throw new Error("must not judge") }, quiet)) await assert.rejects(Effect.runPromise(scorer.score({ input: {}, output: result })), /cut/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test("judge receives overriding Monday policy and scope instead of full settings/flow requirements", async () => {
  const prompts: string[] = []
  const value = output({ view: "flows", spec: views.find(v => v.id === "flows")! })
  value.pairs[0]!.mock = fullMock()
  const scorer = makeScorers(req => { prompts.push(req.system + "\n" + req.prompt); return Effect.succeed(judgeReply()) }, quiet)[2]!
  const judged = await Effect.runPromise(scorer.score({ input: {}, output: value }))
  assert.equal(judged.score, 1)
  assert.match(prompts[0]!, /d-voicuo/)
  assert.match(prompts[0]!, /absent cut.*NEVER a gap/)
  assert.match(prompts[0]!, /Read-only .smithers/)
  assert.match(prompts[0]!, /declaredTabs/)
})
test("dogfood is default and upstream issue mappings stay repository-specific", () => {
  assert.equal(routes.defaultRepo, "smithers-canary/smithers")
  for (const repo of ["smithers-canary/smithers", "smithersai/smithers"]) {
    assert.deepEqual(mapRoute({ id: "home", route: route("") }, "code-home", settings.liveBase, repo), { outcome: "mapped", url: `https://example.test/${repo}` })
    assert.deepEqual(mapRoute({ id: "readme", route: route("/blob/main/README.md") }, "tree-file", settings.liveBase, repo), { outcome: "mapped", url: `https://example.test/${repo}/blob/main/README.md` })
  }
  assert.equal(mapRoute({ id: "issue", route: route("/issues/31") }, "issues", settings.liveBase, "smithers-canary/smithers").outcome, "not deployed")
  assert.deepEqual(mapRoute({ id: "issue", route: route("/issues/31") }, "issues", settings.liveBase, "smithersai/smithers"), { outcome: "mapped", url: "https://example.test/smithersai/smithers/issues/4022" })
})
test("report shows increments, cut separate from not deployed, and never counts partial evidence green", () => {
  const allScores = { "live-clean": { score: 1 }, "structure-parity": { score: 1 }, "parity-judge": { score: 1 } }
  const partial = output(); partial.pairs.push({ id: "detail", state: "ready", width: 390, outcome: "not deployed" })
  const markdown = renderGaps([
    { output: output(), scores: allScores },
    { output: output({ view: "commits", outcome: "not deployed", pairs: [] }) },
    { output: output({ view: "runs", outcome: "cut", pairs: [] }) },
    { output: output({ view: "branches" }), scores: { ...allScores, "structure-parity": { score: 0.5, meta: { gaps: ["missing branch"] } } } },
    { output: partial, scores: allScores }
  ])
  assert.match(markdown, /View \| Increment \| Outcome/)
  assert.match(markdown, /\| runs \| — \| cut/)
  assert.match(markdown, /Increment 1: views 1 green \/ 0 gaps \/ 0 not deployed \/ 0 cut \/ 1 unverified or partial/)
  assert.match(markdown, /Increment 2: views 0 green \/ 1 gaps \/ 1 not deployed \/ 0 cut/)
  assert.match(markdown, /Outside increments: views 0 green \/ 0 gaps \/ 0 not deployed \/ 1 cut/)
})

test("composite Pull requests/Stack view keeps pulls in increment 1 and marks Stack stories cut", async () => {
  const pulls = views.find(v => v.id === "pulls-stack")!
  const mixedSite = { site: "default", routes: pulls.patterns, screens: [
    { id: "pulls-list-open", route: route("/pulls") },
    { id: "stack-ready", route: route("/stack") }
  ] }
  const calls: string[] = []
  const result = await collectPairs(pulls, mixedSite, settings, async req => { calls.push(req.url); return capture() })
  assert.equal(incrementFor(pulls.id), 1)
  assert.equal(result.outcome, "compared")
  assert.equal(result.pairs.filter(pair => pair.outcome === "cut").length, 2)
  assert.equal(result.pairs.filter(pair => pair.outcome === "compared").length, 2)
  assert.ok(calls.every(url => !url.includes("/stack")))
  assert.ok(!result.unobservable.some(note => note.includes("stack")))
  assert.match(mondaySpec(pulls).powers, /Stack is hidden/)
  const markdown = renderGaps([{ output: result, scores: { "live-clean": { score: 1 }, "structure-parity": { score: 1 }, "parity-judge": { score: 1 } } }])
  assert.match(markdown, /Increment 1: views 1 green/)
  assert.doesNotMatch(markdown, /unpaired/)
})
test("undeclared Docs view is cut rather than auth required or not deployed", async () => {
  const docs = views.find(v => v.id === "docs")!
  const result = await collectPairs(docs, site, { ...settings, liveRepo: "smithers-canary/smithers" }, async () => { throw new Error("must not collect") })
  assert.equal(result.outcome, "cut")
  assert.equal(incrementFor(docs.id), 2)
})
test("removed sidebar empty copy is excluded; Monday sync sidebar is allowed on Code home", () => {
  const value = output({ view: "code-home", spec: views.find(v => v.id === "code-home")! })
  value.pairs[0]!.mock = fullMock()
  value.pairs[0]!.mock!.text += " No releases yet."
  value.pairs[0]!.live!.structure!.sidebars.push("GitHub sync")
  assert.equal(structureParity(value).score, 1)
  value.pairs[0]!.live!.text += " No files yet."
  assert.match(structureParity(value).gaps.join(" "), /state-copy keys/)
})

test("visible cut links respect the live install prefix, relative URLs and repository boundary", () => {
  const value = output({ liveBase: "https://example.test/install" })
  const live = value.pairs[0]!.live!
  live.finalUrl = "https://example.test/install/team/repo/pulls"
  live.links = [
    { name: "upstream release", href: "https://github.com/team/repo/releases", title: "" },
    { name: "another repo", href: "/install/other/repo/runs", title: "" },
    { name: "regular commit", href: "commit/abc", title: "" }
  ]
  assert.deepEqual(visibleCuts(value), [])
  live.links.push({ name: "Stack", href: "stack", title: "" }, { name: "Terminal", href: "/install/team/repo/branches/main/terminal", title: "" })
  assert.equal(visibleCuts(value).length, 2)
  assert.match(visibleCuts(value).join(" "), /cut feature visible: link Stack/)
  assert.match(visibleCuts(value).join(" "), /cut feature visible: link Terminal/)
})
