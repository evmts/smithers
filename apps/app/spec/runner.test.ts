import { afterAll, beforeAll, expect, test } from "bun:test"
import { chromium, type Browser } from "@playwright/test"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { journey, state, interpolate, interpolateData, type Journey } from "./journey"
import { runJourney, main } from "./run"
import { results } from "./results"
import { capture, decode } from "./wire"
import { serve } from "./serve"

let browser: Browser
let directory: string
let server: Awaited<ReturnType<typeof serve>>
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
  server = await serve(directory)
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
  const body = { path: "README.md", content: "# Current README", encoding: "utf-8" }
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
test("seeded removed handler fails on Read README / text", async () => {
  await writeFile(join(directory, "index.html"), html(false))
  try {
    const result = await run()
    expect(result.steps[0]!.status).toBe("passed")
    expect(result.steps[1]!.caption).toBe("Read README")
    expect(result.steps[1]!.assertions[0]).toMatchObject({ kind: "text", ok: false })
  } finally { await writeFile(join(directory, "index.html"), html()) }
}, 15000)
test("corrupt served response fails the browser journey at shape / content", async () => {
  const path = join(directory, "api/repos/org/repo/contents")
  await mkdir(path, { recursive: true })
  await writeFile(join(path, "README.md"), JSON.stringify({ path: "README.md", content: 42, encoding: "utf-8" }))
  await writeFile(join(directory, "index.html"), `<main>Loading</main><script>fetch('/api/repos/org/repo/contents/README.md').then(r=>r.json()).then(()=>document.querySelector('main').textContent='Loaded')</script>`)
  try {
    const result = await run({ ...base, steps: [{ caption: "Read corrupt response", go: "/", expect: [{ text: "Loaded" }, { shape: "GET /api/repos/:repo/contents/*", schema: "RepoContents" }] }] })
    expect(result.steps[0]!.assertions[0]!.ok).toBe(true)
    expect(result.steps[0]!.assertions[1]).toMatchObject({ kind: "shape", ok: false })
    expect(result.steps[0]!.assertions[1]!.reason).toContain("RepoContents: content:")
  } finally { await writeFile(join(directory, "index.html"), html()) }
})
test("Risk 9: browser canary response is redacted in stored capture, including provenance", async () => {
  const token = "ghp_" + "A".repeat(36)
  const path = join(directory, "api/repos/org/repo/contents")
  await mkdir(path, { recursive: true })
  await writeFile(join(path, "README.md"), JSON.stringify({ path: "README.md", content: `token=${token}`, encoding: "utf-8", extra: token }))
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
    expect(JSON.stringify(result)).not.toContain(token)
    expect(JSON.parse(stored).provenance).toMatchObject({ revision: "test", lifecycle: "artifact" })
    expect(JSON.parse(stored).response.extra).toBeDefined()
  } finally { await context.close(); await writeFile(join(directory, "index.html"), html()) }
})
test("capture redacts base64 content and refuses invalid schemas before writing", async () => {
  const token = "ghp_" + "B".repeat(36)
  const output = join(directory, "base64")
  await capture({ method: "GET", url: "https://canary.invalid/api/repos/org/repo/contents/a", status: 200, body: { path: "a", encoding: "base64", content: Buffer.from(`token=${token}`).toString("base64") } }, output, "test")
  const files = await readdir(join(output, "overrides"))
  const stored = JSON.parse(await readFile(join(output, "overrides", files[0]!), "utf8"))
  expect(Buffer.from(stored.response.content, "base64").toString()).not.toContain(token)
  await expect(capture({ method: "GET", url: "https://canary.invalid/api/repos/org/repo/contents/b", status: 200, body: { content: 1 } }, output, "test")).rejects.toThrow("RepoContents")
  expect(await readdir(join(output, "overrides"))).toHaveLength(1)
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
    const exchange = { method: "GET", url: "https://host/api/repos/org/repo/contents/a", status: 200, body: { path: "a", content: "a", encoding: "utf-8" } }
    for (const assertion of [
      { absent: "Smithers updates" }, { see: { role: "button", name: "Settings" }, count: 0 },
      { sent: "GET /api/repos/:repo/contents/*" }, { shape: "GET /api/repos/:repo/contents/*", schema: "RepoContents" },
      { url: { startsWith: "https://github.com/org/repo/issues/new?", includes: ["route", "build", "correlation"], absent: ["private"] }, on: { role: "link", name: "Publish" } }
    ]) expect((await observe(page, assertion, [exchange], decode)).ok).toBe(true)
    for (const assertion of [{ fuzzy: { view: "reply" }, means: "clear" }, { rubric: "clear", on: { view: "reply" } }]) expect(await observe(page, assertion, [], decode)).toMatchObject({ ok: null, reason: "skipped: judges arrive in spec4" })
    expect((await observe(page, { sent: "GET /missing" }, [], decode)).ok).toBe(false)
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
test("CLI results-file is typed in both modes (local contract server, not live product proof)", async () => {
  await browser.close()
  // This contract fixture checks CLI serialization without pretending to be dist-spec.
  const file = join(directory, "cli.journey.ts")
  const definition = { ...base, live: { target: server.origin }, steps: [base.steps[0]] }
  await writeFile(file, `export default ${JSON.stringify(definition)}`)
  const previous = process.env.SPEC_MOCK_URL
  process.env.SPEC_MOCK_URL = server.origin
  try {
    for (const mode of ["mock", "live"] as const) {
      const output = join(directory, `${mode}.json`)
      expect(await main([mode, file, "--results-file", output])).toBe(0)
      expect(results(JSON.parse(await readFile(output, "utf8")))[0]!.mode).toBe(mode)
    }
  } finally { if (previous === undefined) delete process.env.SPEC_MOCK_URL; else process.env.SPEC_MOCK_URL = previous }
}, 30000)
