// Owner's post-deploy check of UI increment 1 on live smithers.sh: signed out, GET and navigation only, at most one
// navigation per second. Asserts Monday's D1/D2 with the PM's cuts. Temporary: deleted after the run.
import { chromium, type Page } from "@playwright/test"
const base = process.env.LIVE_BASE ?? "https://smithers.sh", repo = "smithers-canary/smithers", out = process.env.OUT!
const results: { check: string; ok: boolean; detail?: string }[] = []
const check = async (name: string, fn: () => Promise<boolean | string>) => {
  try { const r = await fn(); results.push({ check: name, ok: r === true, detail: r === true ? undefined : String(r) }) }
  catch (e) { results.push({ check: name, ok: false, detail: String(e).slice(0, 200) }) }
}
const visit = async (page: Page, path: string, shot: string) => {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 45_000 }); await page.locator(".repo-frame").first().waitFor({ timeout: 30_000 }).catch(() => {}); await page.waitForTimeout(2500)
  await page.screenshot({ path: `${out}/${shot}.png`, fullPage: true })
}
const banned = /smithers (reviews|merges|lands)|we('|’)ll (review|merge|land)|merged for you|lands? (it|changes) for you/i
const browser = await chromium.launch({ headless: true })
for (const [width, label] of [[1440, "desk"], [390, "phone"]] as const) {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage()
  await visit(page, `/${repo}`, `${label}-home`)
  await check(`${label} home: frame tabs Code/Issues/Pull requests`, async () => {
    const tabs = await page.locator(".repo-frame nav a, .repo-frame [role=tab]").allTextContents()
    const names = tabs.map(t => t.replace(/\d+/g, "").trim()).filter(Boolean)
    return ["Code", "Issues", "Pull requests"].every(n => names.includes(n)) && !names.some(n => /^(Runs|Wiki|Flows|Settings)$/.test(n)) ? true : `tabs: ${JSON.stringify(names)}`
  })
  await check(`${label} home: no Waiting on you`, async () => (await page.getByText(/Waiting on you/i).count()) === 0 || "Waiting on you visible")
  await check(`${label} home: README region renders with its own heading`, async () => (await page.getByRole("region", { name: /README/i }).getByRole("heading").count()) > 0 || "no README region heading")
  await check(`${label} home: declared home blocks render above Files`, async () => {
    const home = page.locator("[data-testid=repository-home]"); if (await home.count() === 0) return "no repository-home section"
    const files = page.locator("section[aria-label=Files]"); if (await files.count() === 0) return "no Files section"
    return await home.first().evaluate((h, f) => !!(h.compareDocumentPosition(f as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await files.first().elementHandle()) || "home not above Files"
  })
  await check(`${label} home: one primary action Ask`, async () => (await page.getByRole("button", { name: /^Ask/ }).count()) >= 1 || "no Ask button")
  await check(`${label} home: no forbidden claim`, async () => !banned.test(await page.locator("body").innerText()) || "forbidden claim text found")
  await page.waitForTimeout(1000)
  await visit(page, `/${repo}/tree/main`, `${label}-tree`)
  await check(`${label} tree: inside frame with entries`, async () => (await page.locator(".repo-frame").count()) > 0 && (await page.locator(".repo-frame a[href*='/blob/'], .repo-frame a[href*='/tree/']").count()) > 0 || "no frame or no entries")
  await page.waitForTimeout(1000)
  await visit(page, `/${repo}/blob/main/README.md`, `${label}-blob`)
  await check(`${label} blob: inside frame, file shown`, async () => (await page.locator(".repo-frame").count()) > 0 && (await page.locator(".repo-frame").innerText()).length > 200 || "no frame or empty file")
  await check(`${label} blob: no forbidden claim`, async () => !banned.test(await page.locator("body").innerText()) || "forbidden claim text found")
  await page.waitForTimeout(1000)
}
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await visit(page, `/${repo}`, "desk-ask-before")
await check("desk: Ask signed out leads to sign-in", async () => {
  await page.getByRole("button", { name: /^Ask/ }).first().click(); await page.waitForTimeout(2000)
  await page.screenshot({ path: `${out}/desk-ask-after.png`, fullPage: true })
  return /sign.?in|login|github\.com\/login/i.test(page.url() + " " + (await page.locator("body").innerText()).slice(0, 4000)) || `url ${page.url()}`
})
await browser.close()
const failed = results.filter(r => !r.ok)
console.log(JSON.stringify({ base, at: new Date().toISOString(), pass: results.length - failed.length, fail: failed.length, results }, null, 1))
