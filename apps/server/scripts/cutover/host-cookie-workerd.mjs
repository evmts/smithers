import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { chromium } from "playwright"
const require = createRequire(import.meta.url)
const wrangler = createRequire(require.resolve("wrangler/package.json"))
const { Miniflare, convertV4MiniflareOptions } = await import(wrangler.resolve("miniflare"))
let script = ""
for await (const chunk of process.stdin) script += chunk
const runtime = new Miniflare(convertV4MiniflareOptions({
  host: "127.0.0.1", port: 49400 + Math.floor(Math.random() * 2000), https: true,
  workers: [
    { name: "edge", modules: true, script, compatibilityDate: "2026-08-01",
      bindings: { SMITHERS_BACKEND_ORIGIN: process.env.SMITHERS_COOKIE_PROOF_BACKEND }, serviceBindings: { ASSETS: "assets" } },
    { name: "assets", modules: true, script: `export default { fetch() {
      const headers = new Headers({"content-type":"text/html"});
      headers.append("set-cookie", "smithers_session=browser-fixture-session; Domain=smithers.test; Path=/; Secure");
      headers.append("set-cookie", "__Host-smithers_session=browser-fixture-session; Domain=smithers.test; Path=/; Secure");
      headers.append("set-cookie", "__Host-smithers_session=browser-fixture-session; Path=/; Secure");
      headers.append("set-cookie", "__Host-smithers_csrf=attacker; Domain=smithers.test; Path=/; Secure");
      return new Response("<!doctype html><title>cookie injection fixture</title>", {headers});
    } }` }
  ]
}))
let browser
try {
  const address = await runtime.ready
  browser = await chromium.launch({ headless: true, executablePath: process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined,
    args: ["--no-proxy-server", "--host-resolver-rules=MAP smithers.test 127.0.0.1, MAP attacker.smithers.test 127.0.0.1"] })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  const origin = `https://smithers.test:${address.port}`
  await page.goto(`https://attacker.smithers.test:${address.port}/`)
  const cookies = await context.cookies()
  assert.ok(cookies.some(c => c.name === "smithers_session" && c.domain === ".smithers.test"))
  assert.ok(cookies.some(c => c.name === "__Host-smithers_session" && c.domain === "attacker.smithers.test"))
  assert.ok(!cookies.some(c => c.name.startsWith("__Host-") && c.domain === ".smithers.test"))
  const response = await page.goto(`${origin}/api/probe`)
  assert.deepEqual(await response.json(), { authenticated: false })
  await page.goto(`${origin}/api/fixture/sign-in`).catch(error => {
    // Chromium reports ERR_ABORTED when a navigation returns 204.
    if (!error.message.includes("ERR_ABORTED")) throw error
  })
  assert.deepEqual(await (await page.goto(`${origin}/api/probe`)).json(), { authenticated: true })
  console.log("host cookie browser/workerd/backend proof passed")
} finally {
  await browser?.close()
  await runtime.dispose()
}
