import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { chromium } from "playwright"
const require = createRequire(import.meta.url)
const wrangler = createRequire(require.resolve("wrangler/package.json"))
const { Miniflare, convertV4MiniflareOptions } = await import(wrangler.resolve("miniflare"))
let script = ""
for await (const chunk of process.stdin) script += chunk
const runtime = new Miniflare(convertV4MiniflareOptions({host:"127.0.0.1",https:true,port:49400+Math.floor(Math.random()*2000),workers:[
  {name:"edge",modules:true,script,compatibilityDate:"2026-08-01",bindings:{SMITHERS_BACKEND_ORIGIN:process.env.SMITHERS_SITE_PROOF_BACKEND},serviceBindings:{ASSETS:"assets"}},
  {name:"assets",modules:true,script:'export default { fetch() { return new Response("<!doctype html><head><title>Repository app</title></head><body>app</body>",{headers:{"content-type":"text/html"}}) } }'}
]}))
let browser
try {
  for (const [path,expected] of [["/","<h1>site</h1>"],["/spec/intro.md","# Intro"],["/setup.md","setup"],["/llms.txt","index"]]) {
    const response = await runtime.dispatchFetch(`https://manual.smithers.sh${path}`)
    assert.equal(response.status,200)
    assert.equal(await response.text(),expected)
  }
  const app = await runtime.dispatchFetch("https://manual.smithers.sh/repo/")
  assert.equal(app.status,200)
  assert.match(await app.text(),/smithers-repository-site.*first\/manual/)
  const api = await runtime.dispatchFetch("https://manual.smithers.sh/api/probe",{headers:{Cookie:"__Host-smithers_session=owner"}})
  assert.equal(api.status,200)
  assert.deepEqual(await api.json(),{user:7,host:"manual.smithers.sh"})
  for (const path of ["/","/repo/","/api/probe"]) assert.equal((await runtime.dispatchFetch(`https://unknown.smithers.sh${path}`)).status,421)
  const address = await runtime.ready
  browser = await chromium.launch({headless:true, executablePath:process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined,
    args:["--no-proxy-server","--host-resolver-rules=MAP manual.smithers.sh 127.0.0.1"]})
  const context = await browser.newContext({ignoreHTTPSErrors:true})
  const page = await context.newPage()
  await page.goto(`https://manual.smithers.sh:${address.port}/`)
  assert.equal(await page.locator("h1").textContent(),"site")
  await page.goto(`https://manual.smithers.sh:${address.port}/repo/`)
  assert.deepEqual(JSON.parse(await page.locator('meta[name="smithers-repository-site"]').getAttribute("content")),{repository:"first/manual",appPrefix:"/repo/"})
  console.log("repository site workerd/backend composed proof passed")
} finally { await browser?.close(); await runtime.dispose() }
