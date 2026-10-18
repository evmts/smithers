import { afterAll, beforeAll, expect, test } from "bun:test"
import { chromium, type Browser } from "@playwright/test"
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { startHost } from "./host"

let root: string
let browser: Browser
let host: Awaited<ReturnType<typeof startHost>>
const payload = { journey: "default/repo-read-signed-out", step: 0, mode: "live", revision: "host-contract", thumb: "up", assertions: [] }
beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), "spec-host-"))
  await mkdir(resolve(root, "results")); await mkdir(resolve(root, "dist"))
  await writeFile(resolve(root, "dist/index.html"), "<!doctype html><h1>Spec build</h1>")
  await writeFile(resolve(root, "results/results.json"), JSON.stringify([{ journey: payload.journey, mode: "live", revision: payload.revision, startedAt: "2026-10-18T00:00:00Z", state: "unverified", steps: [{ caption: "Open the public repository", spec: "PM D1", status: "failed", assertions: [{ kind: "see", ok: false, expected: { see: { role: "link", name: "Code" } }, actual: null }], screenshot: "capture.png", ms: 1 }] }]))
  browser = await chromium.launch({ headless: true })
  host = await startHost({ port: 49400 + Math.floor(Math.random() * 2000), local: true, lan: true, hostname: "127.0.0.1", tokenFile: resolve(root, "token"), labelsDirectory: resolve(root, "labels"), resultsDirectory: resolve(root, "results"), dist: resolve(root, "dist") })
})
afterAll(async () => { host?.close(); await browser?.close(); if (root) await rm(root, { recursive: true, force: true }) }, 30_000)

test("LAN reads work, unauthorized writes fail, first-visit cookie authenticates the owner", async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto(host.origin)
    await page.getByRole("link", { name: payload.journey, exact: true }).waitFor()
    expect(await page.getByRole("link", { name: payload.journey, exact: true }).count()).toBe(1)
    const post = () => page.evaluate(async body => {
      const response = await fetch("/__spec/labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return response.status
    }, payload)
    expect(await post()).toBe(401)
    const token = await readFile(resolve(root, "token"), "utf8")
    expect((await stat(resolve(root, "token"))).mode & 0o777).toBe(0o600)
    await page.goto(host.origin + "?k=" + token)
    expect(page.url()).toBe(host.origin + "/")
    const cookie = (await context.cookies()).find(cookie => cookie.name === "spec_host")!
    expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe("Strict"); expect(cookie.path).toBe("/")
    expect(await page.evaluate(() => document.cookie)).not.toContain(token)
    expect(await post()).toBe(201)
    const label = JSON.parse((await readFile(resolve(root, "labels/journey.jsonl"), "utf8")).trim())
    expect(label.by).toBe("will"); expect(label.thumb).toBe("up"); expect(label.step).toBe(0)
    const data = await (await context.request.get(host.origin + "/__spec/data")).json()
    expect(data.counts[payload.journey]).toEqual({ up: 1, down: 0 })
  } finally { await context.close() }
})

test("host rejects forged identities, invalid labels, foreign origins and stale receipts", async () => {
  const context = await browser.newContext()
  try {
    expect((await context.request.post(host.origin + "/__spec/labels", { headers: { "Tailscale-User-Login": "forged", Origin: host.origin }, data: payload })).status()).toBe(401)
    const token = await readFile(resolve(root, "token"), "utf8")
    await context.request.get(host.origin + "?k=" + token)
    const post = (data: unknown, origin = host.origin) => context.request.post(host.origin + "/__spec/labels", { headers: { Origin: origin }, data })
    expect((await post({ ...payload, thumb: "down" })).status()).toBe(400)
    expect((await post({ ...payload, by: "other" })).status()).toBe(400)
    expect((await post({ ...payload, assertions: [99] })).status()).toBe(409)
    expect((await post({ ...payload, revision: "old" })).status()).toBe(409)
    expect((await post(payload, "https://elsewhere.invalid")).status()).toBe(403)
    expect((await context.request.get(host.origin + "?k=wrong")).status()).toBe(401)
    expect((await post({ ...payload, thumb: "down", note: "Wrong link" })).status()).toBe(201)
  } finally { await context.close() }
})

test("one host serves the index and build, refuses API and symlink escapes", async () => {
  const page = await browser.newPage()
  try {
    await page.goto(host.origin)
    await page.getByRole("button", { name: "judged 0", exact: true }).click()
    expect(await page.getByRole("link", { name: payload.journey, exact: true }).count()).toBe(0)
    await page.goto(host.origin + "/smithers-canary/smithers")
    expect(await page.getByRole("heading", { name: "Spec build" }).count()).toBe(1)
    expect((await page.request.get(host.origin + "/api/private")).status()).toBe(404)
    await writeFile(resolve(root, "secret.txt"), "DO NOT SERVE")
    await symlink(resolve(root, "secret.txt"), resolve(root, "dist/escape.txt"))
    expect((await page.request.get(host.origin + "/escape.txt")).status()).toBe(403)
    expect((await page.request.get(host.origin + "/__spec/capture?id=/etc/passwd")).status()).toBe(404)
  } finally { await page.close() }
})

test("default identity comes from Tailscale and unsafe bind addresses fail closed", async () => {
  const extra = await startHost({ port: 49400 + Math.floor(Math.random() * 2000), lan: false, local: false, labelsDirectory: resolve(root, "tail-labels"), resultsDirectory: resolve(root, "results"), dist: resolve(root, "dist") })
  try {
    expect((await fetch(extra.origin + "/__spec/labels", { method: "POST", headers: { Origin: extra.origin, "Content-Type": "application/json" }, body: JSON.stringify(payload) })).status).toBe(401)
    const response = await fetch(extra.origin + "/__spec/labels", { method: "POST", headers: { Origin: extra.origin, "Content-Type": "application/json", "Tailscale-User-Login": "will@example.com" }, body: JSON.stringify(payload) })
    expect(response.status).toBe(201)
    expect(JSON.parse((await readFile(resolve(root, "tail-labels/journey.jsonl"), "utf8")).trim()).by).toBe("will@example.com")
  } finally { extra.close() }
  await expect(startHost({ hostname: "0.0.0.0" })).rejects.toThrow("requires loopback")
})


test("labels cannot follow a symlink into another directory", async () => {
  const directory = resolve(root, "symlink-labels"); await mkdir(directory)
  const target = resolve(root, "untouched.jsonl"); await writeFile(target, "original\n")
  await symlink(target, resolve(directory, "journey.jsonl"))
  const extra = await startHost({ port: 49400 + Math.floor(Math.random() * 2000), lan: false, local: true, labelsDirectory: directory, resultsDirectory: resolve(root, "results"), dist: resolve(root, "dist") })
  try {
    const response = await fetch(extra.origin + "/__spec/labels", { method: "POST", headers: { Origin: extra.origin, "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    expect(response.status).toBe(500)
    expect(await readFile(target, "utf8")).toBe("original\n")
  } finally { extra.close() }
})
