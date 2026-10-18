/** Offline from workspace root, no browser or model:
 * node --import ./.specs/design/mock/evals/mock-fidelity/test-runtime.mjs --test ./.specs/design/mock/evals/front-claims/front-claims.test.ts
 * bun test --preload ./.specs/design/mock/evals/mock-fidelity/test-runtime.mjs ./.specs/design/mock/evals/front-claims/front-claims.test.ts
 */
import { strict as assert } from "node:assert"
import { test } from "node:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { bannedClaims, bannedClaimsScore, requiredCopy, requiredFor, staticFirstScreen, prerenderedBody, discoverDists, defaultDists, allowedClaims } from "./scoring.ts"
import { suite, executor, makeScorers } from "./front-claims.eval.ts"
const fixture = (dist = "dist-smithers-site", body?: string) => ({ dist, html: `<body><div id="root">${body ?? `<div>${requiredFor(dist).join(" ")}</div>`}</div><script>bundle</script></body>` })
test("clean landing passes each scorer", () => {
  for (const dist of ["dist-smithers-site", "dist-smithers-app", "dist-effeck-site", "dist-effeck-app"]) {
    for (const score of [bannedClaimsScore, requiredCopy, staticFirstScreen]) assert.equal(score(fixture(dist)).score, 1)
  }
})
for (const claim of bannedClaims) test(`banned phrase: ${claim.text}`, () => {
  const sep = "personSubject" in claim ? " " : ""
  const result = bannedClaimsScore({ dist: "dist-default-ui", html: `<script>${"x".repeat(70)}${sep}${claim.text.toUpperCase()}${sep}${"y".repeat(70)}</script>` })
  assert.equal(result.score, 0)
  assert.ok(result.reason.includes(claim.text.toUpperCase()))
  assert.ok(result.reason.includes("x".repeat(59)))
  assert.ok(result.reason.includes("y".repeat(59)))
  assert.ok(claim.source)
})
test("'reviewed' fails without a person as its subject (PM final review A row 1)", () => {
  const score = (html: string) => bannedClaimsScore({ dist: "x", html }).score
  assert.equal(score("<li>In review · reviewed on the issue</li>"), 0)
  for (const ok of ["maya reviewed the regression", "Maya reviewed and merged #32", "Notes reviewed by Maya.", "the change the person reviewed is the change that lands", "runs on unreviewed input", "Prepare the previewed version PR", "summary: `${role} reviewed the change.`"]) assert.equal(score(ok), 1, ok)
})
test("every occurrence and overlapping banned phrases are retained", () => {
  const result = bannedClaimsScore({ dist: "x", html: "closed laptop; CLOSED LAPTOP; crash or a closed laptop" })
  assert.equal(result.reason.split("\n").length, 4)
})
test("every required string is enforced individually", () => {
  for (const dist of defaultDists.filter(dist => requiredFor(dist).length)) for (const text of requiredFor(dist)) {
    const output = fixture(dist)
    output.html = output.html.replace(text, "")
    assert.equal(requiredCopy(output).score, 0)
    assert.ok(requiredCopy(output).reason.includes(text))
  }
})
test("non-landings skip both landing scorers", () => {
  for (const dist of ["dist-default-ui", "dist-effect-monorepo"]) for (const score of [requiredCopy, staticFirstScreen]) assert.deepEqual(score({ dist, html: "" }), { score: 1, reason: "no landing" })
})
test("bundle-only install copy cannot pass empty prerender", () => {
  const output = fixture("dist-smithers-site", "")
  output.html += requiredFor(output.dist).join(" ")
  assert.equal(requiredCopy(output).score, 1)
  assert.equal(staticFirstScreen(output).score, 0)
  assert.match(staticFirstScreen(output).reason, /empty prerender/)
  assert.equal(staticFirstScreen(fixture("dist-effeck-app", "<p>Hello</p>")).score, 0)
})
test("Smithers Status and MIT links fail only inside prerender", () => {
  for (const text of ["Status", "MIT"]) {
    const output = fixture()
    output.html = output.html.replace("</div><script>", `<a href="/x"><span>${text}</span></a></div><script>`)
    assert.equal(staticFirstScreen(output).score, 0)
    assert.match(staticFirstScreen(output).reason, new RegExp(text))
    assert.equal(staticFirstScreen({ ...fixture(), html: fixture().html + `<a>${text}</a>` }).score, 1)
  }
})
test("root parsing handles nesting and excludes bundle, absent or unclosed roots", () => {
  assert.equal(prerenderedBody("<body><div id='root'><div>nested</div>tail</div><script>hidden</script></body>"), "<div>nested</div>tail")
  for (const html of ["", "<body><div>wrong</div></body>", '<body><div id="root"><script>fake</script></body>']) assert.equal(prerenderedBody(html), "")
})
test("allowlist applies only inside the 60-character context", () => {
  assert.equal(allowedClaims.length, 10)
  for (const entry of allowedClaims) {
    const score = (html: string) => bannedClaimsScore({ dist: "x", html })
    const result = score(`${entry.contextIncludes} ${entry.phrase}`)
    assert.equal(result.score, 1)
    assert.ok(result.reason.includes("Allowed hits:"))
    assert.ok(result.reason.includes(entry.reason))
    assert.equal(score(entry.phrase).score, 0)
    assert.equal(score(`${entry.contextIncludes}${"x".repeat(61)} ${entry.phrase}`).score, 0)
    assert.equal(score(`${entry.contextIncludes} ${entry.phrase} ${"x".repeat(70)} ${entry.phrase}`).score, 0)
  }
})
test("discovery scans both roots, newest wins, delivered wins ties, overrides are absolute", () => {
  const root = mkdtempSync(join(tmpdir(), "front-claims-"))
  const delivered = join(root, "delivered")
  try {
    mkdirSync(delivered)
    const local = join(root, defaultDists[0]!)
    const copy = join(delivered, defaultDists[0]!)
    for (const dist of [local, copy]) { mkdirSync(dist); writeFileSync(join(dist, "index.html"), "fixture"); utimesSync(join(dist, "index.html"), 100, 100) }
    assert.deepEqual(discoverDists(root, undefined, delivered), [copy])
    utimesSync(join(local, "index.html"), 200, 200)
    assert.deepEqual(discoverDists(root, undefined, delivered), [local])
    mkdirSync(join(delivered, defaultDists[1]!))
    assert.deepEqual(discoverDists(root, undefined, delivered), [local, join(delivered, defaultDists[1]!)])
    assert.deepEqual(discoverDists(root, ` ${copy}, ${join(root, "missing")}, ${copy}, `, delivered), [copy])
    assert.throws(() => discoverDists(root, "relative"), /absolute/)
    assert.deepEqual(discoverDists(root, "", delivered), [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test("suite binds all three real scorers and executor reads each case", async () => {
  const declared = await Effect.runPromise(suite)
  assert.equal(declared.cases.length, discoverDists().length)
  assert.equal(declared.bindings.length, 3)
  for (const entry of declared.cases) {
    const result = await Effect.runPromise(executor.run(entry))
    assert.ok((result.output as { html: string }).html.length)
    assert.ok(Number.isFinite(result.latencyMs) && result.latencyMs >= 0, "Runner rejects an execution without latencyMs")
  }
  for (const scorer of makeScorers()) {
    const result = await Effect.runPromise(scorer.score({ input: {}, output: fixture() }))
    assert.equal(result.score, 1)
  }
})
