import { afterAll, beforeAll, expect, test } from "bun:test"
import { chromium, type Browser } from "@playwright/test"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { journey, state, interpolate, interpolateData, type Journey } from "./journey"
import { runJourney, main } from "./run"
import { results } from "./results"
import { capture, decode } from "./wire"
import { createServer } from "node:http"

let browser: Browser
let directory: string
let server: { origin: string; close: () => Promise<void> }
const base: Journey = {
  id: "contract/read", site: "default", spec: "runner contract (not product proof)",
  world: { base: "default" }, live: { target: "default", subject: { repo: "org/repo" } },
  steps: [{ caption: "Open", go: "/", expect: [{ see: { role: "button", name: "README.md" } }] },
    { caption: "Read README", click: { role: "button", name: "README.md" }, expect: [{ text: "Current README" }] }]
}
const html = (handler = true) => `<button data-flow="file" ${handler ? 'onclick="document.querySelector(\'main\').textContent=\'Current README\'"' : ""}>README.md</button><main></main>`
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "spec-runner-"))
  await writeFile(join(directory, "index.html"), html())
  const fixture = createServer(async (request, response) => {
    const path = new URL(request.url!, "http://fixture.invalid").pathname
    const data = await readFile(join(directory, path)).catch(() => readFile(join(directory, "index.html")))
    response.setHeader("Content-Type", "text/html")
    response.end(data)
  })
  await new Promise<void>(done => fixture.listen(49400 + Math.floor(Math.random() * 2000), "127.0.0.1", done))
  const address = fixture.address() as import("node:net").AddressInfo
  server = { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise((done, reject) => fixture.close(error => error ? reject(error) : done())) }
  browser = await chromium.launch({ headless: true })
})
afterAll(async () => { await browser?.close(); await server?.close(); await rm(directory, { recursive: true, force: true }) })
const run = async (definition = base, mode: "mock" | "live" = "mock") => {
  const context = await browser.newContext()
  try {
    return await runJourney(await context.newPage(), journey(definition), { mode, origin: server.origin, output: directory, revision: "test", decode })
  } finally { await context.close() }
}
test("same data runs in both modes and saves a typed receipt and screenshot per step", async () => {
  for (const mode of ["mock", "live"] as const) {
    const result = await run(base, mode)
    expect(results([result])).toHaveLength(1)
    expect(result.steps.map(s => s.status)).toEqual(["passed", "passed"])
    for (const step of result.steps) expect((await readFile(step.screenshot)).length).toBeGreaterThan(0)
  }
}, 30000)
test("bindings read the world in mock and the API in live without changing steps", async () => {
  const body = { type: "file", path: "README.md", content: "# Current README", encoding: "utf-8" }
  const path = join(directory, "api/repos/org/repo/contents")
  await mkdir(path, { recursive: true })
  await writeFile(join(path, "README.md"), JSON.stringify(body))
  const definition = { ...base, bind: { heading: { read: "GET /api/repos/:repo/contents/README.md", pick: "firstHeading" } }, steps: [base.steps[0]!, { ...base.steps[1]!, expect: [{ text: "${heading}" }] }] }
  for (const mode of ["mock", "live"] as const) {
    const context = await browser.newContext()
    try {
      const result = await runJourney(await context.newPage(), definition, {
        mode, origin: server.origin, output: directory, revision: "test", decode,
        readWorld: async (_world, read) => { expect(read).toBe("GET /api/repos/org/repo/contents/README.md"); return body }
      })
      expect(result.steps.map(step => step.status)).toEqual(["passed", "passed"])
    } finally { await context.close() }
  }
}, 15000)
test("a non-JSON binding fails unverified without echoing its response", async () => {
  const token = "ghp_" + "D".repeat(36)
  const path = join(directory, "api/repos/org/repo/contents")
  await mkdir(path, { recursive: true })
  await writeFile(join(path, "README.md"), token)
  try {
    const receipt = await run({ ...base, bind: { heading: { read: "GET /api/repos/:repo/contents/README.md", pick: "firstHeading" } } }, "live")
    expect(receipt.state).toBe("unverified")
    expect(receipt.reason).toContain("expected JSON")
    expect(JSON.stringify(receipt)).not.toContain(token)
  } finally { await writeFile(join(path, "README.md"), JSON.stringify({ type: "file", path: "README.md", content: "# Current README", encoding: "utf-8" })) }
})
test("seeded removed handler fails on Read README / text", async () => {
  await writeFile(join(directory, "index.html"), html(false))
  try {
    for (const mode of ["mock", "live"] as const) {
      const result = await run(base, mode)
      expect(result.steps[0]!.status).toBe("passed")
      expect(result.steps[1]!.caption).toBe("Read README")
      expect(result.steps[1]!.assertions[0]).toMatchObject({ kind: "text", ok: false })
    }
  } finally { await writeFile(join(directory, "index.html"), html()) }
}, 15000)
test("corrupt served response fails the browser journey at shape / content", async () => {
  const path = join(directory, "api/repos/org/repo/contents")
  await mkdir(path, { recursive: true })
  await writeFile(join(path, "README.md"), JSON.stringify({ type: "file", path: "README.md", content: 42, encoding: "utf-8" }))
  await writeFile(join(directory, "index.html"), `<main>Loading</main><script>fetch('/api/repos/org/repo/contents/README.md').then(r=>r.json()).then(()=>document.querySelector('main').textContent='Loaded')</script>`)
  try {
    for (const mode of ["mock", "live"] as const) {
      const result = await run({ ...base, steps: [{ caption: "Read corrupt response", go: "/", expect: [{ text: "Loaded" }, { shape: "GET /api/repos/:repo/contents/*", schema: "RepoContents" }] }] }, mode)
      expect(result.steps[0]!.assertions[0]!.ok).toBe(true)
      expect(result.steps[0]!.assertions[1]).toMatchObject({ kind: "shape", ok: false })
      expect(result.steps[0]!.assertions[1]!.reason).toContain("RepoContents: content:")
    }
  } finally { await writeFile(join(directory, "index.html"), html()) }
})
test("Risk 9: browser canary response is redacted in stored capture, including provenance", async () => {
  const token = "ghp_" + "A".repeat(36)
  const path = join(directory, "api/repos/org/repo/contents")
  await mkdir(path, { recursive: true })
  await writeFile(join(path, "README.md"), JSON.stringify({ type: "file", path: "README.md", content: `token=${token}`, encoding: "utf-8", extra: token, apiKey: "unprefixed-canary-credential", encoded: { encoding: "base64", content: Buffer.from(token).toString("base64") } }))
  await writeFile(join(directory, "index.html"), `<main>Loading</main><script>fetch('/api/repos/org/repo/contents/README.md?token=${token}').then(r=>r.json()).then(()=>document.querySelector('main').textContent='Loaded')</script>`)
  const context = await browser.newContext()
  try {
    const result = await runJourney(await context.newPage(), { ...base, steps: [{ caption: "Capture canary", go: "/", expect: [{ text: "Loaded" }, { shape: "GET /api/repos/:repo/contents/*", schema: "RepoContents" }] }] }, {
      mode: "live", origin: server.origin, output: directory, revision: "test", decode,
      capture: exchange => capture(exchange, directory, "test")
    })
    expect(result.steps[0]!.status).toBe("passed")
    const files = await readdir(join(directory, "overrides"))
    const stored = await readFile(join(directory, "overrides", files[0]!), "utf8")
    expect(stored).not.toContain(token)
    expect(stored).not.toContain("unprefixed-canary-credential")
    expect(stored).not.toContain(Buffer.from(token).toString("base64"))
    expect(JSON.parse(stored).response.encoded).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain(token)
    expect(JSON.parse(stored).provenance).toMatchObject({ revision: "test", lifecycle: "artifact" })
    expect(JSON.parse(stored).unknownFields).toContainEqual({ path: "$.extra", kind: "string" })
    const fixture = JSON.parse(stored)
    expect(() => decode(fixture.schema, fixture.response)).not.toThrow()
  } finally { await context.close(); await writeFile(join(directory, "index.html"), html()) }
})
test("capture refuses invalid schemas before writing fixtures", async () => {
  const output = join(directory, "invalid")
  await expect(capture({ method: "GET", url: "https://canary.invalid/api/repos/org/repo/contents/b", status: 200, body: { content: 1 } }, output, "test")).rejects.toThrow("contents")
  await expect(capture({ method: "GET", url: "https://canary.invalid/api/unknown", status: 200, body: { token: "not-a-trusted-route" } }, output, "test")).rejects.toThrow("Unknown RPC capture schema")
  await expect(readdir(join(output, "overrides"))).rejects.toThrow()
})
test("Risk 4: wrong user, missing action and stale data each fail specifically", async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent('<p>wrong-user</p><p>Old README</p>')
    const { observe } = await import("./observe")
    for (const [assertion, kind] of [[{ text: "maya" }, "text"], [{ see: { role: "button", name: "Ask" } }, "see"], [{ text: "Current README" }, "text"]] as const) {
      const result = await observe(page, assertion, [], decode)
      expect(result).toMatchObject({ kind, ok: false })
    }
  } finally { await context.close() }
}, 20000)
test("absence, sent, URL, skipped judges and shape are recorded", async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent('<a href="https://github.com/org/repo/issues/new?body=route%20build%20correlation">Publish</a>')
    const { observe } = await import("./observe")
    const exchange = { method: "GET", url: "https://host/api/repos/org/repo/contents/a", status: 200, body: { type: "file", path: "a", content: "a", encoding: "utf-8" } }
    for (const assertion of [
      { absent: "Smithers updates" }, { absent: { pattern: "Smithers\\s+lands" } }, { see: { role: "button", name: "Settings" }, count: 0 },
      { sent: "GET /api/repos/:repo/contents/*" }, { shape: "GET /api/repos/:repo/contents/*", schema: "RepoContents" },
      { url: { startsWith: "https://github.com/org/repo/issues/new?", includes: ["route", "build", "correlation"], absent: ["private"] }, on: { role: "link", name: "Publish" } }
    ]) expect((await observe(page, assertion, [exchange], decode)).ok).toBe(true)
    for (const assertion of [{ fuzzy: { view: "reply" }, means: "clear" }, { rubric: "clear", on: { view: "reply" } }]) expect(await observe(page, assertion, [], decode)).toMatchObject({ ok: null, verdict: "inconclusive", reason: "Judged assertions require the journey judge context" })
    expect((await observe(page, { sent: "GET /missing" }, [], decode)).ok).toBe(false)
    await page.setContent('<a href="https://github.com/smithersai/smithers/issues/new?body=private-canary%2Fsecret-repository">Publish</a>')
    const leaked = await observe(page, { url: { startsWith: "https://github.com/smithersai/smithers/issues/new?", absent: ["private-canary/secret-repository"] }, on: { role: "link", name: "Publish" } }, [], decode)
    expect(leaked.ok).toBe(false)
    expect(page.url()).toBe("about:blank")
  } finally { await context.close() }
})
test("live.skip and zero-step states never become green without paired evidence", async () => {
  expect(await run({ ...base, live: { skip: "write path" } }, "live")).toMatchObject({ state: "unverified", reason: "write path", steps: [] })
  const definition = state({ ...base, go: "/", expect: [{ see: { role: "button", name: "README.md" } }] })
  expect(definition.steps).toHaveLength(0)
  expect((await run(definition)).steps[0]!.status).toBe("passed")
})
test("validation rejects mode branching, multiple verbs, bad counts and missing bindings", () => {
  expect(() => journey({ ...base, steps: [{ ...base.steps[0]!, live: {} } as never] })).toThrow()
  expect(() => journey({ ...base, steps: [{ ...base.steps[0]!, click: { role: "button" } }] })).toThrow()
  expect(() => journey({ ...base, steps: [{ caption: "x", expect: [{ see: { role: "button" }, count: -1 }] }] })).toThrow()
  expect(() => interpolate("${missing}", {})).toThrow("Missing binding: missing")
  expect(() => results([{ ...base }])).toThrow()
  expect(interpolateData({ text: "${quoted}" }, { quoted: 'a "quote"\nand a line' })).toEqual({ text: 'a "quote"\nand a line' })
})
test("live refuses submission and external navigation and paces signed-out reads", async () => {
  await writeFile(join(directory, "index.html"), '<a href="/next">Next</a><button>Save</button>')
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const navigations: number[] = []
    page.on("request", request => { if (request.isNavigationRequest()) navigations.push(Date.now()) })
    const result = await runJourney(page, { ...base, steps: [
      { caption: "Open", go: "/", expect: [] },
      { caption: "Read next", click: { role: "link", name: "Next" }, expect: [] },
      { caption: "Return", go: "/", expect: [] },
      { caption: "Refuse write", click: { role: "button", name: "Save" }, expect: [] },
      { caption: "Refuse external", go: "https://github.com/", expect: [] },
      { caption: "Refuse send", say: "write something", expect: [] }
    ] }, { mode: "live", origin: server.origin, output: directory, revision: "test", decode })
    expect(result.steps.map(step => step.status)).toEqual(["passed", "passed", "passed", "failed", "failed", "failed"])
    expect(navigations).toHaveLength(3)
    expect(navigations[1]! - navigations[0]!).toBeGreaterThanOrEqual(1000)
    expect(navigations[2]! - navigations[1]!).toBeGreaterThanOrEqual(1000)
    expect(new URL(page.url()).origin).toBe(server.origin)
  } finally { await context.close(); await writeFile(join(directory, "index.html"), html()) }
}, 15000)
test("CLI mock, live and capture --live write typed results and redact captures", async () => {
  await browser.close()
  const token = "ghp_" + "C".repeat(36)
  const fixture = join(directory, "api/repos/org/repo/contents")
  await mkdir(fixture, { recursive: true })
  await writeFile(join(fixture, "README.md"), JSON.stringify({ type: "file", path: "README.md", content: `token=${token}`, encoding: "utf-8" }))
  await writeFile(join(directory, "index.html"), `<main>Loading</main><script>fetch('/api/repos/org/repo/contents/README.md').then(r=>r.json()).then(()=>document.querySelector('main').textContent='Loaded')</script>`)
  const file = join(directory, "cli.journey.ts")
  const definition = { ...base, live: { target: server.origin }, steps: [{ caption: "Read", go: "/", expect: [{ text: "Loaded" }, { shape: "GET /api/repos/:repo/contents/*", schema: "RepoContents" }] }] }
  await writeFile(file, `export default ${JSON.stringify(definition)}`)
  const staticFile = join(directory, "static.journey.ts")
  await writeFile(staticFile, `export default ${JSON.stringify({ ...base, world: { base: "smithers" }, steps: [{ caption: "Static", go: "/", expect: [{ text: "Static offline" }] }] })}`)
  const previous = { mock: process.env.SPEC_MOCK_URL, output: process.env.SPEC_OUTPUT, sites: process.env.SPEC_MOCK_SITE_DIRS }
  process.env.SPEC_MOCK_URL = server.origin
  process.env.SPEC_OUTPUT = join(directory, "cli-output")
  try {
    for (const command of ["mock", "live", "capture"] as const) {
      const output = join(directory, `${command}.json`)
      expect(await main([command, ...(command === "capture" ? ["--live"] : []), file, "--results-file", output])).toBe(0)
      const document = await readFile(output, "utf8")
      expect(results(JSON.parse(document))[0]!.mode).toBe(command === "mock" ? "mock" : "live")
      expect(document).not.toContain(token)
    }
    const captures = await readdir(join(process.env.SPEC_OUTPUT, "overrides"))
    expect(captures).toHaveLength(1)
    expect(await readFile(join(process.env.SPEC_OUTPUT, "overrides", captures[0]!), "utf8")).not.toContain(token)
    await writeFile(join(directory, "index.html"), "<h1>Static offline</h1>")
    process.env.SPEC_MOCK_SITE_DIRS = JSON.stringify({ smithers: directory })
    expect(await main(["mock", staticFile, "--results-file", join(directory, "static.json")])).toBe(0)
    expect(results(JSON.parse(await readFile(join(directory, "static.json"), "utf8")))[0]!.steps[0]!.status).toBe("passed")
    const linkBrowser = await chromium.launch({ headless: true })
    try {
      const context = await linkBrowser.newContext()
      const page = await context.newPage()
      await page.goto(server.origin)
      await page.setContent('<textarea readonly>Example</textarea><a href="/next">Docs</a><section aria-label="Example"><code>Left</code><code>Right</code></section><code>Install</code>')
      const { observe } = await import("./observe")
      expect((await observe(page, { see: { role: "textbox", editable: true }, count: 0 }, [], decode)).ok).toBe(true)
      const link = await observe(page, { on: { role: "link", name: "Docs" }, status: 200, url: "/next" }, [], decode)
      expect(link).toMatchObject({ kind: "url", ok: true })
      expect(new URL(page.url()).pathname).toBe("/")
      expect((await observe(page, { see: { role: "code", within: { role: "region", name: "Example" } }, count: 2 }, [], decode)).ok).toBe(true)
      await page.getByRole("region", { name: "Example" }).locator("code").last().evaluate(node => node.remove())
      expect((await observe(page, { see: { role: "code", within: { role: "region", name: "Example" } }, count: 2 }, [], decode, 100)).ok).toBe(false)
    } finally { await linkBrowser.close() }
  } finally {
    if (previous.mock === undefined) delete process.env.SPEC_MOCK_URL; else process.env.SPEC_MOCK_URL = previous.mock
    if (previous.sites === undefined) delete process.env.SPEC_MOCK_SITE_DIRS; else process.env.SPEC_MOCK_SITE_DIRS = previous.sites
    if (previous.output === undefined) delete process.env.SPEC_OUTPUT; else process.env.SPEC_OUTPUT = previous.output
  }
}, 120000)
