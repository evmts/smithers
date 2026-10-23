import { build } from "esbuild"
import { createServer, type Server } from "node:http"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium, type Browser } from "playwright"
import { afterAll, beforeAll, expect, test } from "vitest"

let server: Server
let browser: Browser
let origin: string
beforeAll(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("./fixtures/mobile-layout.tsx", import.meta.url))],
    bundle: true, write: false, format: "esm", platform: "browser", target: "es2022",
    jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  })
  const css = await readFile(new URL("../src/screens/conversations/conversations-screen.css", import.meta.url), "utf8")
  server = createServer((request, response) => {
    response.setHeader("Content-Type", request.url === "/fixture.js" ? "text/javascript" : "text/html")
    response.end(request.url === "/fixture.js" ? bundle.outputFiles[0]!.text
      : `<!doctype html><style>body{margin:0;font:14px Arial,sans-serif}*{box-sizing:border-box}${css}</style><div id="app"></div><script type="module" src="/fixture.js"></script>`)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("No test server address")
  origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true })
}, 60_000)
afterAll(async () => {
  await browser?.close()
  await new Promise<void>((resolve) => server?.close(() => resolve()))
})

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  for (const file of ["README.md", "index.html"]) test(`${viewport.width}: ${file} has reachable controls and unclipped content`, async () => {
    const page = await browser.newPage({ viewport })
    page.setDefaultTimeout(5_000)
    try {
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(`${origin}?file=${file}`)
      if (file === "README.md") await page.locator(".ProseMirror").waitFor()
      else await page.locator("iframe").waitFor()
      const controls = page.locator('#files button, .sui-item-conv-external')
      expect(await controls.count()).toBeGreaterThan(4)
      const defects: string[] = []
      for (const control of await controls.all()) {
        if (!await control.isVisible()) continue
        const size = await control.boundingBox()
        if (viewport.width <= 960 && size && (size.height < 32 || size.width < 32)) defects.push(`${await control.getAttribute("aria-label") ?? await control.textContent()}: ${size.width}×${size.height}`)
      }
      expect(errors).toEqual([])
      expect.soft(defects).toEqual([])
      const article = page.getByRole("article", { name: file, exact: true })
      const bounds = await article.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }))
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 1)
      // Scrolling the editor to a link must leave the toolbar above the editor,
      // rather than scrolling it behind the article's overflow:hidden boundary.
      if (file === "README.md") {
        await page.getByRole("link", { name: "Read the guide" }).scrollIntoViewIfNeeded()
        expect(await article.evaluate((element) => {
          const toolbar = element.querySelector("header")!.getBoundingClientRect()
          return toolbar.top >= element.getBoundingClientRect().top
        })).toBe(true)
      }
    } finally { await page.close() }
  })
  test(`${viewport.width}: conversation branch and repository labels remain readable`, async () => {
    const page = await browser.newPage({ viewport })
    page.setDefaultTimeout(5_000)
    try {
      await page.goto(origin)
      await page.locator(".conversation-list-branch").first().waitFor()
      const labels = await page.locator('.conversation-list-row a span').evaluateAll((elements) => elements.map((element) => ({ text: element.textContent, client: element.clientWidth, scroll: element.scrollWidth })))
      expect(labels).toHaveLength(4)
      expect(labels.filter((label) => label.scroll > label.client + 1)).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
    } finally { await page.close() }
  })
}
