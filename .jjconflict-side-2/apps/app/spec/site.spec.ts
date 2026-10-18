import { test, expect } from "@playwright/test"
import { resolve } from "node:path"
import { staticServer } from "./staticServer"
const crossOrigin = new WeakMap<import("@playwright/test").Page, string[]>()
test.beforeEach(({ page }) => {
  const requests: string[] = []
  crossOrigin.set(page, requests)
  page.on("request", request => {
    const url = new URL(request.url())
    if (url.protocol.startsWith("http") && !url.hostname.match(/^127\.0\.0\.1$/)) requests.push(request.url())
  })
})
let host: Awaited<ReturnType<typeof staticServer>>
test.beforeAll(async () => { host = await staticServer(resolve("dist-spec")) })
test.afterAll(async () => { await host.close() })
test.afterEach(() => { expect(host.escapes).toEqual([]) })
test("unknown routes fail visibly and remain in the harness log", async ({ page }) => {
  await page.goto(`${host.origin}/maya/tinyhttp`)
  await page.waitForFunction(() => window.__spec !== undefined)
  const status = await page.evaluate(async () => (await fetch("/api/spec-unknown", { method: "PATCH" })).status)
  expect(status).toBe(599)
  await expect(page.evaluate(() => window.__spec.assertClean())).rejects.toThrow("PATCH /api/spec-unknown")
  await expect(page.getByRole("alert").filter({ hasText: "Fixture failure: PATCH /api/spec-unknown" })).toBeVisible()
  expect(await page.evaluate(() => window.__spec.failures)).toContain("Fixture failure: PATCH /api/spec-unknown")
})

test("static repo home and README render signed out without escapes", async ({ page }) => {
  await page.goto(`${host.origin}/maya/tinyhttp?as=out&data=full&net=ok`)
  await expect(page.getByRole("region", { name: "maya/tinyhttp home", exact: true })).toContainText("A small HTTP server")
  expect(await page.evaluate(() => window.__spec.world.viewer)).toBeNull()
  await command(page, "/files / maya/tinyhttp")
  const files = page.locator('[data-kind="file-list"]').last()
  await expect(files).toContainText("README.md")
  await files.getByText("README.md", { exact: true }).first().click()
  const file = page.locator('[data-kind="file"]').last()
  await expect(file).toContainText("A small HTTP server")
  await expect(file).toContainText("# tinyhttp")
  expect(crossOrigin.get(page)).toEqual([])
  await page.evaluate(() => window.__spec.assertClean())
  expect(await page.evaluate(() => window.__spec.violations)).toEqual([])
})

const command = async (page: import("@playwright/test").Page, line: string) => {
  const input = page.getByTestId("composer-input")
  if (!await input.isVisible()) await page.getByRole("button", { name: "Chat", exact: true }).click()
  await input.fill(line)
  await input.press("Enter")
}

test("bootstrapped route inventory includes home, README, a file and issues", async ({ page }, info) => {
  const sockets: string[] = []
  page.on("websocket", socket => sockets.push(socket.url()))
  await page.goto(`${host.origin}/smithers-canary/smithers`)
  await expect(page.getByRole("region", { name: "smithers-canary/smithers home", exact: true })).toContainText("Durable workflows")
  await command(page, "/file README.md smithers-canary/smithers")
  await expect(page.locator('[data-kind="file"]').last()).toContainText("People review and merge")
  await command(page, "/file src/runtime.ts smithers-canary/smithers")
  const code = page.getByRole("region", { name: "src/runtime.ts", exact: true })
  await expect(code).toContainText("export const step1")
  await command(page, "/issues.list open smithers-canary/smithers")
  await expect(page.locator('[data-kind="issue-list"]').last()).toContainText("Build the living spec")
  const inventory = await page.evaluate(() => {
    window.__spec.assertClean()
    return { routes: [...new Set(window.__spec.requests)].sort(), sockets: window.__spec.sockets, violations: window.__spec.violations }
  })
  expect(inventory.routes.length).toBeLessThanOrEqual(40)
  expect(crossOrigin.get(page)).toEqual([])
  expect(sockets).toEqual([])
  expect(inventory.violations).toEqual([])
  await info.attach("bootstrapped-route-inventory", { body: JSON.stringify({ ...inventory, count: inventory.routes.length, networkSockets: sockets, serverEscapes: host.escapes }, null, 2), contentType: "application/json" })
  if (process.env.SPEC_INVENTORY_FILE) {
    const { writeFile } = await import("node:fs/promises")
    await writeFile(process.env.SPEC_INVENTORY_FILE, JSON.stringify({ ...inventory, count: inventory.routes.length, networkSockets: sockets, serverEscapes: host.escapes }, null, 2))
  }
})

test("CSP blocks a cross-origin fetch even when the page shim is bypassed", async ({ page }) => {
  // Responses carry the same policy so external worker scripts inherit it too.
  expect((await page.request.get(`${host.origin}/favicon.svg`)).headers()["content-security-policy"]).toBe("connect-src 'self'")
  await page.addInitScript(() => { (window as unknown as { rawFetch: typeof fetch }).rawFetch = fetch.bind(window) })
  await page.goto(`${host.origin}/maya/tinyhttp`)
  await page.waitForFunction(() => window.__spec !== undefined)
  const blocked = await page.evaluate(async () => {
    try { await (window as unknown as { rawFetch: typeof fetch }).rawFetch("https://escape.invalid/spec-canary"); return false } catch { return true }
  })
  expect(blocked).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__spec.violations)).toContain("https://escape.invalid/spec-canary")
})

test("static host detects backend reads from workers and WebSocket upgrades", async ({ page }) => {
  const canaryHost = await staticServer(resolve("dist-spec"))
  try {
    await page.goto(`${canaryHost.origin}/maya/tinyhttp`)
    await page.waitForFunction(() => window.__spec !== undefined)
    const status = await page.evaluate(async () => {
      const source = `fetch(${JSON.stringify(location.origin + "/api/worker-canary")}).then(r => postMessage(r.status))`
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }))
      const worker = new Worker(url)
      try { return await new Promise(resolve => { worker.onmessage = e => resolve(e.data) }) }
      finally { worker.terminate(); URL.revokeObjectURL(url) }
    })
    expect(status).toBe(599)
    expect(canaryHost.escapes).toEqual(["GET /api/worker-canary"])
    const response = await fetch(`${canaryHost.origin}/live`)
    expect(response.status).toBe(599)
    const { connect } = await import("node:net")
    await new Promise<void>((done, reject) => {
      const url = new URL(canaryHost.origin)
      const socket = connect(Number(url.port), url.hostname, () => socket.write(`GET /socket-canary HTTP/1.1\r\nHost: ${url.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`))
      socket.on("data", () => {})
      socket.on("end", done)
      socket.on("error", reject)
    })
    expect(canaryHost.escapes).toEqual(["GET /api/worker-canary", "GET /live", "WS /socket-canary"])
  } finally { await canaryHost.close() }
})
