import { chromium } from "@playwright/test"
import { expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { journey } from "./journey"
import githubPaths from "./journeys/default/github-paths.journey"
import issue from "./journeys/default/issue-to-stack.journey"
import lineToRun from "./journeys/default/line-to-run.journey"
import { modelCases } from "./journeys/default/settings-models.journey"
import { cells } from "./journeys/default/states.journey"
import waiting from "./journeys/default/waiting-on-you.journey"
import { results } from "./results"
import { runJourney } from "./run"
import { staticServer } from "./staticServer"
import { decode } from "./wire"
const definitions = [githubPaths, lineToRun, waiting, issue, ...modelCases, ...cells]
const output = resolve(process.env.HOME!, "smithers-lanes/out/spec9-p1-journeys")
test("six P1 files parse: 6 scenarios + 80 zero-step cells; 124 checkpoints", () => {
  expect(new Set(definitions.map((d) => d.id)).size).toBe(6)
  expect(definitions).toHaveLength(86)
  expect(definitions.reduce((n, d) => n + (d.steps.length || 1), 0)).toBe(124)
  for (const d of definitions) expect(journey(d)).toEqual(d)
  expect(cells.every((d) => d.steps.length === 0)).toBe(true)
  expect(() => journey({ ...githubPaths, steps: [{ caption: "Invalid ordinal", expect: [{ see: { role: "row", nth: -1 } }] }] })).toThrow()
  expect(() => journey({ ...githubPaths, steps: [{ caption: "Invalid pattern", expect: [{ see: { role: "alert" }, text: { pattern: "[" } }] }] })).toThrow()
})
test("execute every P1 checkpoint through the real spec build; retain exact failures", async () => {
  const mode = process.env.SPEC_P1_LIVE === "1" ? "live" : "mock"
  const host = mode === "mock" ? await staticServer(resolve(import.meta.dirname, "../dist-spec")) : undefined
  const browser = await chromium.launch({ headless: true })
  const revision = mode === "mock"
    ? JSON.parse(await readFile(resolve(import.meta.dirname, "../dist-spec/__build.json"), "utf8")).gitSha
    : "unknown: deployed stamp not collected"
  const receipts = []
  try {
    for (const definition of definitions) {
      const context = await browser.newContext({ serviceWorkers: "block" })
      try {
        if (mode === "live" && !("skip" in definition.live)) await new Promise((resolve) => setTimeout(resolve, 1000))
        receipts.push(
          await runJourney(await context.newPage(), definition, {
            mode,
            origin: host?.origin ?? "https://smithers.sh",
            output,
            revision,
            decode,
            assertionTimeoutMs: 1500,
            requireFixtureTransport: mode === "mock"
          })
        )
      } finally {
        await context.close()
      }
    }
    await mkdir(output, { recursive: true })
    await writeFile(resolve(output, `${mode}-results.json`), JSON.stringify(results(receipts), null, 2) + "\n")
    expect(receipts).toHaveLength(86)
    expect(receipts.reduce((n, r) => n + r.steps.length, 0)).toBe(mode === "mock" ? 124 : 47)
  } finally {
    await browser.close()
    await host?.close()
  }
}, 600000)
test("seeded wrong-view path fails D2 through the real spec build", async () => {
  const host = await staticServer(resolve(import.meta.dirname, "../dist-spec"))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const { observe } = await import("./observe")
    const reason = { see: { role: "alert" }, text: { pattern: "failed|error" } }
    await page.setContent("<p role=\"alert\">Request failed: unavailable</p>")
    expect(await observe(page, reason, [], decode, 100)).toMatchObject({ ok: true })
    await page.setContent("<p role=\"alert\">No open issues</p>")
    expect(await observe(page, reason, [], decode, 100)).toMatchObject({ ok: false })
    await page.setContent("<ul aria-label=\"Runs\"><li>Other run</li><li>spec-waiting-run</li></ul>")
    const first = {
      see: { role: "listitem", nth: 0, within: { role: "list", name: "Runs" } },
      text: "spec-waiting-run"
    }
    expect(await observe(page, first, [], decode, 100)).toMatchObject({ ok: false })
    await page.setContent("<ul aria-label=\"Runs\"><li>spec-waiting-run</li><li>Other run</li></ul>")
    expect(await observe(page, first, [], decode, 100)).toMatchObject({ ok: true })
    const step = githubPaths.steps.find((s) => s.go?.endsWith("/blob/main/README.md"))!
    const receipt = await runJourney(page, {
      ...githubPaths,
      steps: [{ ...step, go: "/smithers-canary/smithers/issues" }]
    }, {
      mode: "mock",
      origin: host.origin,
      output,
      revision: "seeded-wrong-view",
      decode,
      assertionTimeoutMs: 1500
    })
    expect(receipt.steps[0]!.assertions.find((a) => a.kind === "see")).toMatchObject({ ok: false })
    expect(receipt.steps[0]!.status).toBe("failed")
  } finally {
    await browser.close()
    await host.close()
  }
}, 60000)
