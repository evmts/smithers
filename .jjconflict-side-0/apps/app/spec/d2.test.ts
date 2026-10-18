import { afterAll, beforeAll, expect, test } from "bun:test"
import { chromium, type Browser } from "@playwright/test"
import { resolve } from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import definition from "./journeys/default/repo-read-signed-out.journey"
import { runJourney, type RunOptions } from "./run"
import { staticServer } from "./staticServer"
import { readWorld } from "./readWorld"
import { decode } from "./wire"
import { results } from "./results"
let revision: string
let browser: Browser
let host: Awaited<ReturnType<typeof staticServer>>
const output = process.env.SPEC_OUTPUT ?? resolve(process.env.HOME ?? ".", "smithers-lanes/out/spec2-runner/d2")
beforeAll(async () => {
  revision = JSON.parse(await readFile(resolve(import.meta.dirname, "../dist-spec/__build.json"), "utf8")).gitSha
  host = await staticServer(resolve(import.meta.dirname, "../dist-spec"))
  browser = await chromium.launch({ headless: true })
})
afterAll(async () => { await browser?.close(); await host?.close() })
const run = async (name: string, beforeStep?: RunOptions["beforeStep"]) => {
  const context = await browser.newContext()
  try {
    const receipt = await runJourney(await context.newPage(), definition, {
      mode: "mock", origin: host.origin, output, revision, readWorld, decode,
      assertionTimeoutMs: 1500, requireFixtureTransport: true, beforeStep,
      checkTransport: () => { expect(host.escapes).toEqual([]) }
    })
    results([receipt])
    await writeFile(resolve(output, `${name}.json`), JSON.stringify([receipt], null, 2) + "\n")
    return receipt
  } finally { await context.close() }
}
test("unchanged PM journey: shipped README assertions pass; header gaps remain recorded", async () => {
  const receipt = await run("canonical")
  expect(receipt.steps[1]!.status).toBe("passed")
  expect(receipt.steps[2]!.status).toBe("passed")
  // Full canonical evidence remains a failure when required product UI is missing.
  // Do not remove or invert any canonical assertion to obtain a green journey.
  expect(receipt.steps[0]!.assertions.length).toBe(definition.steps[0]!.expect.length)
}, 60000)
test("Risk 3: remove the real README click handler; the read region never appears", async () => {
  const receipt = await run("removed-handler", async (page, index) => {
    if (index !== 2) return
    await page.getByRole("button", { name: "README.md", exact: true }).evaluate(button => {
      const key = Object.getOwnPropertyNames(button).find(key => key.startsWith("__reactProps$"))
      if (!key) throw new Error("Real React event binding not found")
      const props = (button as unknown as Record<string, unknown>)[key] as { onClick?: unknown }
      if (typeof props.onClick !== "function") throw new Error("README has no real click handler to remove")
      delete props.onClick
    })
  })
  expect(receipt.steps[1]!.status).toBe("passed")
  expect(receipt.steps[2]!.caption).toBe("Read the README")
  expect(receipt.steps[2]!.assertions.find(a => a.kind === "see")).toMatchObject({ ok: false })
  expect(receipt.steps[2]!.status).toBe("failed")
}, 60000)
test("corrupt a real world response: shape reports the content schema path", async () => {
  const receipt = await run("corrupt-response", async (page, index) => {
    if (index !== 2) return
    await page.evaluate(() => {
      const repo = window.__spec.world.repos.find(repo => repo.name === "smithers-canary/smithers")!
      Object.assign(repo.files, { "README.md": 42 })
    })
  })
  const assertion = receipt.steps[2]!.assertions.find(a => a.kind === "shape")!
  expect(assertion.ok).toBe(false)
  expect(assertion.reason).toContain("content:")
  expect(receipt.steps[2]!.status).toBe("failed")
}, 60000)
