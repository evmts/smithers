import { afterAll, beforeAll, expect, test } from "bun:test"
import { chromium, expect as browserExpect, type Browser } from "@playwright/test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { startHost } from "../host"
import { results } from "../results"

let browser: Browser
let host: Awaited<ReturnType<typeof startHost>>
let root: string
const id = "default/repo-read-signed-out"
beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), "spec-player-"))
  const directory = process.env.SPEC_PLAYER_RESULTS ?? resolve(root, "results")
  if (!process.env.SPEC_PLAYER_RESULTS) {
    await mkdir(directory)
    // A real mock journey supplies checkpoint evidence. Live display uses the same
    // capture as a host-contract fixture only; retained live evidence is opt-in.
    const resultFile = resolve(directory, "mock-results.json")
    const child = Bun.spawn(["bun", "spec/run.ts", "mock", id, "--results-file", resultFile], { cwd: resolve(import.meta.dirname, "../.."), env: { ...process.env, SPEC_OUTPUT: directory }, stdout: "ignore", stderr: "pipe" })
    const code = await child.exited
    if (![0, 1].includes(code)) throw new Error(await new Response(child.stderr).text())
    const runs = results(JSON.parse(await readFile(resultFile, "utf8")))
    await writeFile(resolve(directory, "live-results.json"), JSON.stringify(runs.map(run => ({ ...run, mode: "live", revision: "test-fixture-live-display" }))))
  }
  browser = await chromium.launch({ headless: true })
  host = await startHost({ port: 49400 + Math.floor(Math.random() * 2000), local: true, lan: false, resultsDirectory: directory, labelsDirectory: resolve(root, "labels") })
  process.env.SPEC_LIVE_URLS = JSON.stringify({ default: host.origin })
}, 120_000)
afterAll(async () => { delete process.env.SPEC_LIVE_URLS; host?.close(); await browser?.close(); if (root) await rm(root, { recursive: true, force: true }) })

test("real build restores all three checkpoints; flip preserves step and renders exact receipts", async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto(host.origin)
    await page.getByRole("link", { name: id, exact: true }).click()
    await browserExpect(page.locator("#caption")).toHaveText("Open the public repository")
    await browserExpect(page.getByRole("button", { name: "Try it", exact: true })).toBeEnabled()
    await browserExpect(page.frameLocator('iframe[title="Mock checkpoint"]').getByRole("button", { name: "Files", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Next step", exact: true }).click()
    await browserExpect(page.locator("#caption")).toHaveText("Browse repository files")
    await browserExpect(page.frameLocator('iframe[title="Mock checkpoint"]').getByRole("button", { name: "README.md", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Next step", exact: true }).click()
    await browserExpect(page.locator("#caption")).toHaveText("Read the README")
    await browserExpect(page.frameLocator('iframe[title="Mock checkpoint"]').getByRole("region", { name: "README.md", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Live", exact: true }).click()
    await browserExpect(page.locator("#count")).toHaveText("3/3")
    await browserExpect(page.getByRole("img", { name: "Read the README · Live", exact: true })).toBeVisible()
    await browserExpect.poll(() => page.locator("#stage img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    await page.locator("#chips details").last().locator("summary").click()
    await browserExpect(page.locator("#chips details").last()).toContainText("Expected")
    await browserExpect(page.locator("#chips details").last()).toContainText("Actual")
    await page.getByRole("button", { name: "Mock", exact: true }).click()
    await browserExpect(page.frameLocator('iframe[title="Mock checkpoint"]').getByRole("region", { name: "README.md", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Try it", exact: true }).click()
    await browserExpect(page.locator('iframe[title="Mock checkpoint"]')).not.toHaveClass("locked")
  } finally { await context.close() }
}, 60_000)

test("arrow keys, Space, world variants, deep links, focus and phone Walk", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" })
  try {
    const page = await context.newPage()
    await page.goto(`${host.origin}/?journey=${id}&s=1&mode=live`)
    await browserExpect(page.locator("#count")).toHaveText("2/3")
    await page.locator("#caption").click(); await page.keyboard.press("ArrowRight")
    await browserExpect(page.locator("#count")).toHaveText("3/3")
    await page.keyboard.press("ArrowLeft"); await browserExpect(page.locator("#count")).toHaveText("2/3")
    await page.keyboard.press("Space"); await browserExpect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible()
    await browserExpect(page.locator("#count")).toHaveText("3/3", { timeout: 5000 })
    await page.keyboard.press("Space")
    await page.getByRole("button", { name: "Mock", exact: true }).click()
    await page.getByRole("combobox", { name: "data", exact: true }).selectOption("empty")
    await browserExpect(page.locator('iframe[title="Mock checkpoint"]')).toHaveAttribute("src", /data=empty/)
    await page.getByRole("combobox", { name: "data", exact: true }).selectOption("full")
    await page.getByRole("button", { name: "Walk", exact: true }).click()
    await browserExpect(page.locator("#world")).toBeHidden()
    await browserExpect(page.getByRole("checkbox")).toHaveCount(3)
    await page.getByRole("checkbox", { name: "Read the README", exact: true }).check()
    await browserExpect(page.locator('iframe[title="Live walk"]')).toHaveAttribute("src", new RegExp(host.origin))
    await page.reload()
    await browserExpect(page.getByRole("checkbox", { name: "Read the README", exact: true })).toBeChecked()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.keyboard.press("Tab")
    expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe("none")
    await browserExpect(page.frameLocator('iframe[title="Live walk"]').getByRole("button", { name: "README.md", exact: true })).toBeVisible()
    await page.screenshot({ path: resolve(process.env.SPEC_PLAYER_EVIDENCE ?? root, "player-phone-dark.png"), fullPage: true })
  } finally { await context.close() }
}, 30_000)


test("thumbs persist one line per action, retain disputed chips and update counts", async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto(`${host.origin}/?journey=${id}&mode=live`)
    await page.getByRole("button", { name: "Thumb up", exact: true }).click()
    await browserExpect(page.locator("#status")).toHaveText("Saved")
    await browserExpect(page.getByLabel("Labels", { exact: true })).toHaveText("👍 1 · 👎 0")
    await page.getByRole("button", { name: "Thumb down", exact: true }).click()
    await page.getByRole("textbox", { name: "Note", exact: true }).fill("Missing Code tab")
    await page.getByRole("textbox", { name: "Note", exact: true }).press("ArrowRight")
    await browserExpect(page.locator("#count")).toHaveText("1/3")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await browserExpect(page.getByLabel("Labels", { exact: true })).toHaveText("👍 1 · 👎 1")
    await page.getByRole("button", { name: "Thumb down", exact: true }).click()
    await page.getByRole("checkbox", { name: "Dispute assertion 1", exact: true }).check()
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await browserExpect(page.getByLabel("Labels", { exact: true })).toHaveText("👍 1 · 👎 2")
    const labels = (await readFile(resolve(root, "labels/journey.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line))
    expect(labels).toHaveLength(3)
    expect(labels[0]).toMatchObject({ journey: id, step: 0, mode: "live", thumb: "up", by: "local-test", assertions: [] })
    expect(labels[1].note).toBe("Missing Code tab")
    expect(labels[2].note).toContain("Assertion 1:")
    await page.reload()
    await browserExpect(page.getByLabel("Labels", { exact: true })).toHaveText("👍 1 · 👎 2")
    await page.screenshot({ path: resolve(process.env.SPEC_PLAYER_EVIDENCE ?? root, "player-live-labels.png"), fullPage: true })
  } finally { await context.close() }
}, 30_000)
