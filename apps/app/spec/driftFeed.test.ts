import { expect, test } from "bun:test"
import { chromium } from "@playwright/test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { startHost } from "./host"

test("drift feed reaches player header and mock banner; ten serial resets release browser resources", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "spec-drift-feed-"))
  await mkdir(resolve(root, "dist")); await mkdir(resolve(root, "results"))
  await writeFile(resolve(root, "dist/index.html"), '<!doctype html><html><head><title>Mock</title></head><body><h1>Mock</h1></body></html>')
  await writeFile(resolve(root, "results/drift.json"), JSON.stringify({ builtMinutes: 12, ahead: 6, regressed: 1 }))
  const host = await startHost({ port: 49400 + Math.floor(Math.random() * 2000), local: true, resultsDirectory: resolve(root, "results"), labelsDirectory: resolve(root, "labels"), dist: process.env.SPEC_DRIFT_DIST ?? resolve(root, "dist") })
  const browser = await chromium.launch({ headless: true })
  const snapshot = () => {
    if (!process.env.SPEC_DRIFT_EVIDENCE) return { contexts: browser.contexts().length }
    const processes = execFileSync("ps", ["-axo", "pid=,ppid=,comm="], { encoding: "utf8" }).trim().split("\n").map(line => { const [pid, parent, ...command] = line.trim().split(/\s+/); return { pid: Number(pid), parent: Number(parent), command: command.join(" ") } })
    const owned = new Set([process.pid])
    for (let i = 0; i < processes.length; i++) for (const item of processes) if (owned.has(item.parent)) owned.add(item.pid)
    const children = processes.filter(item => owned.has(item.pid) && item.command !== "ps")
    const listing = spawnSync("lsof", ["-p", children.map(child => child.pid).join(","), "-Fn"], { encoding: "utf8" })
    if (listing.error || listing.signal || ![0, 1].includes(listing.status!)) throw new Error("Resource probe failed")
    const openFiles = listing.stdout.split("\n").filter(line => line.startsWith("n")).length
    const profiles = [...new Set(listing.stdout.split("\n").flatMap(line => { const match = /^n(.*\/playwright_chromiumdev_profile-[^/]+)/.exec(line); return match ? [match[1]!] : [] }))]
    const profileKiB = profiles.reduce((sum, profile) => sum + Number(execFileSync("du", ["-sk", profile], { encoding: "utf8" }).split(/\s+/)[0]), 0)
    const diskKiB = Number(execFileSync("du", ["-sk", root], { encoding: "utf8" }).split(/\s+/)[0])
    return { processes: children.length, openFiles, diskKiB, profileKiB, contexts: browser.contexts().length }
  }
  const resets = []
  try {
    const before = snapshot()
    for (let cycle = 0; cycle < 10; cycle++) {
      const context = await browser.newContext()
      try {
        const page = await context.newPage()
        await page.goto(host.origin)
        await page.getByText("built 12 min ago · ahead 6 · regressed 1", { exact: true }).waitFor()
        await page.goto(host.origin + "/?__spec_mock=1")
        await page.locator("#spec-drift").waitFor()
        expect(await page.locator("#spec-drift").textContent()).toBe("built 12 min ago · ahead 6 · regressed 1")
      } finally { await context.close() }
      expect(browser.contexts()).toHaveLength(0)
      resets.push({ cycle: cycle + 1, ...snapshot() })
    }
    await writeFile(resolve(root, "results/drift.json"), JSON.stringify({ builtAt: new Date(Date.now() - 12 * 60_000).toISOString(), builtMinutes: 0, ahead: 6, regressed: 1 }))
    expect((await (await fetch(host.origin + "/__spec/drift")).json()).builtMinutes).toBe(12)
    expect((await (await fetch(host.origin + "/__spec/data")).json()).drift.builtMinutes).toBe(12)
    if (process.env.SPEC_DRIFT_EVIDENCE) await writeFile(process.env.SPEC_DRIFT_EVIDENCE, JSON.stringify({ before, resets, after: snapshot() }, null, 2))
  } finally { await browser.close(); host.close(); await rm(root, { recursive: true, force: true }) }
}, 120_000)
