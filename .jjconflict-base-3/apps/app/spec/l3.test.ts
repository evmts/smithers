import { expect, test } from "bun:test"
import { chromium } from "@playwright/test"
import { readFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import docs from "./journeys/effeck/repo-read-signed-out.journey"
import { defaultWorld } from "./worlds/default"
import { readWorld } from "./readWorld"
import { runJourney } from "./run"
import { staticServer } from "./staticServer"
import { decode } from "./wire"

test("L3 follows home.json Docs to the whole onboarding file in the real build", async () => {
  const host = await staticServer(resolve(import.meta.dirname, "../dist-spec"))
  const browser = await chromium.launch({ headless: true })
  const output = process.env.SPEC_OUTPUT ?? resolve(process.env.HOME!, "smithers-lanes/out/spec11-stack/l3")
  try {
    const repo = defaultWorld(new URLSearchParams(), host.origin).repos.find(repo => repo.name === "effeck/effeck")!
    const home = JSON.parse(repo.files["home.json"]!)
    const link = home.blocks.flatMap((block: { links?: { label: string; url: string }[] }) => block.links ?? []).find((link: { label: string }) => link.label === "Docs")!
    expect(new URL(link.url).pathname).toBe("/effeck/effeck/blob/main/docs/user/src/001-onboarding.md")
    const text = repo.files["docs/user/src/001-onboarding.md"]!
    expect(Buffer.byteLength(text)).toBeGreaterThan(5 * 1024)
    expect(Buffer.byteLength(text)).toBeLessThan(7 * 1024)
    expect(repo.files["docs/guide.md"]).toBeUndefined()
    const page = await browser.newPage()
    const receipt = await runJourney(page, docs, { mode: "mock", origin: host.origin, output,
      revision: JSON.parse(await readFile(resolve(import.meta.dirname, "../dist-spec/__build.json"), "utf8")).gitSha,
      decode, readWorld, assertionTimeoutMs: 1500, requireFixtureTransport: true })
    await mkdir(output, { recursive: true })
    await Bun.write(resolve(output, "results.json"), JSON.stringify([receipt], null, 2))
    expect(new URL(page.url()).pathname).toBe(new URL(link.url).pathname)
    const assertions = receipt.steps[1]!.assertions
    expect(assertions.find(assertion => assertion.kind === "text")).toMatchObject({ ok: true, expected: { text } })
    expect(assertions.find(assertion => assertion.kind === "absent" && (assertion.expected as { absent: string }).absent === "Truncated")).toMatchObject({ ok: true })
    expect(assertions.find(assertion => assertion.kind === "shape")).toMatchObject({ ok: true })
    expect(host.escapes).toEqual([])
  } finally { await browser.close(); await host.close() }
}, 60000)
