import { createRequire } from "node:module"
import { mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { auditPage, collectPage, mockRoot, repoRoot } from "../mock-fidelity/browser.ts"
import { registrationFor } from "../mock-fidelity/registration.ts"
import type { SitePayload, ViewSpec } from "../mock-fidelity/scoring.ts"
import { cutOutput, cutStory } from "./monday.ts"
import { mapRoute, routes, storiesFor, type RouteMap } from "./routes.ts"
import type { Capture, Options, Pair, ParityOutput, Structure } from "./model.ts"

/** Navigation and background requests are guarded; no clicks, typing or forms. */
export const readOnlyRequest = (method: string, url: string) => {
  if (method !== "GET") return false
  const parsed = new URL(url)
  if (!/^(https?:|file:|data:|blob:)$/.test(parsed.protocol)) return false
  const danger = /(?:^|[\/_-])(?:logout|signout|sign-out|delete|approve|merge|land|dispatch|trigger|revoke)(?:[\/_-]|$)|\/auth\/callback/i
  return !danger.test(decodeURIComponent(parsed.pathname)) && ![...parsed.searchParams.keys()].some(key => /^(action|mutation|logout|delete|approve|merge|land)$/i.test(key))
}
/** Semantic regions supplement collectPage's mock CSS selectors on both sides. */
export const collectStructure = (): Structure => {
  const visible = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest('[hidden],[aria-hidden=true],[data-mock]')
  const text = (el: Element) => (el.getAttribute("aria-label") || (el as HTMLElement).innerText || "").replace(/\s+/g, " ").trim()
  const headers = [...document.querySelectorAll('header,[role=banner],.repo-frame-global,.repo-frame-repo-header')].filter(visible)
  const header = headers.flatMap(el => [text(el), ...[...el.querySelectorAll("[aria-label], [title]")].filter(visible).map(node => `${text(node)} ${node.getAttribute("title") ?? ""}`)]).join(" ")
  const navs = [...document.querySelectorAll('nav,[role=navigation],.repo-frame-tabs')].filter(visible)
  const nav = navs.find(el => /repository(?: navigation)?/i.test(el.getAttribute("aria-label") ?? "")) ?? navs.find(el => /\bCode\b/.test(text(el)) && /\bIssues\b/.test(text(el)))
  const sidebars = [...document.querySelectorAll('aside,[role=complementary]')].filter(visible).map(el => {
    if (el.id === "repo-ask-panel" || /\bAsk\b/.test(el.getAttribute("aria-label") ?? "")) return "Ask"
    return el.getAttribute("aria-label") || el.querySelector("nav[aria-label]")?.getAttribute("aria-label") || [...el.querySelectorAll("h1,h2,h3,[role=heading]")].filter(visible).map(node => text(node).replace(/\s*[\d,]+$/, "").trim()).join(" / ") || "sidebar"
  })
  // Releases may be a section rather than an aside, depending on the port.
  if ([...document.querySelectorAll('aside h2,aside h3,.repo-code-home-sidebar h2,.repo-code-home-sidebar h3')].filter(visible).some(el => /releases/i.test(text(el))) && !sidebars.includes("Releases")) sidebars.push("Releases")
  return { tabs: nav ? [...nav.querySelectorAll('a,button,[role=tab]')].filter(visible).map(text) : [],
    header: { waiting: /waiting on you|\binbox\b/i.test(header), ask: /\bask\b/i.test(header), sync: /(?:\bsynced\b|github sync|sync failed|sync stale)/i.test(header) || headers.some(el => Boolean(el.querySelector('[class*="sync"],.repo-frame-github,a[href$="/settings/sync"]'))), search: /\bsearch\b/i.test(header) }, sidebars: [...new Set(sidebars)] }
}
export interface CaptureRequest { side: "mock" | "live"; url: string; id: string; width: number; screenshot: string; auth?: string; wait?: number }
export type CapturePage = (request: CaptureRequest) => Promise<Capture>
export const collectPairs = async (view: ViewSpec, site: SitePayload, options: Options, capture: CapturePage, map: RouteMap = routes): Promise<ParityOutput> => {
  const cut = cutOutput(view, options)
  if (cut) return cut
  const pairs: Pair[] = []
  const stories = storiesFor(view, site, Boolean(options.auth))
  const canonicalId = stories.find(screen => screen.state === "ready")?.id ?? stories[0]?.id
  const unobservable = options.auth ? [] : ["Member ready states require LIVE_AUTH; only signed-out public states run."]
  for (const screen of stories) {
    if (cutStory(screen.route)) {
      for (const width of [1440, 390]) pairs.push({ id: screen.id, state: screen.state, width, outcome: "cut", reason: "Monday policy: cut subject inside a kept view" })
      continue
    }
    const mapped = mapRoute(screen, view.id, options.liveBase, options.liveRepo, map)
    for (const width of [1440, 390]) {
      const pair: Pair = { id: screen.id, state: screen.state, width, outcome: "inconclusive" }
      pairs.push(pair)
      const stem = (screen.id === canonicalId ? view.id : `${view.id}--${screen.id}`).replace(/[^a-zA-Z0-9_-]/g, "-")
      try {
        pair.mock = await capture({ side: "mock", url: `${pathToFileURL(resolve(mockRoot, options.dist, "index.html")).href}?still=1&theme=light#/${screen.route}`, id: screen.id, width, screenshot: join(options.runDir, `${stem}-mock-${width}.png`), wait: screen.wait })
        if (mapped.outcome === "not deployed") { pair.outcome = "not deployed"; pair.reason = mapped.reason; continue }
        pair.live = await capture({ side: "live", url: mapped.url, id: screen.id, width, screenshot: join(options.runDir, `${stem}-live-${width}.png`), auth: screen.state === "ready" ? options.auth : undefined, wait: screen.wait })
        if ([404, 410].includes(pair.live.status ?? 0) || /renders the not-found page/.test(pair.live.problems.join(" "))) { pair.outcome = "not deployed"; pair.reason = "Live route is not deployed (404/410/not-found page)" }
        else if ((pair.live.status ?? 200) >= 500) pair.reason = `Live HTTP ${pair.live.status}`
        else if (screen.state === "ready" && ([401, 403].includes(pair.live.status ?? 0) || /\/(?:login|sign-in|signin)(?:[/?#]|$)/i.test(pair.live.finalUrl ?? ""))) { pair.outcome = "auth required"; pair.reason = "Live member request denied; refresh LIVE_AUTH" }
        else { pair.outcome = "compared" }
      } catch (error) { pair.reason = error instanceof Error ? error.message : String(error) }
    }
  }
  for (const pair of pairs) for (const blocked of pair.live?.blockedRequests ?? []) unobservable.push(`${pair.id}/${pair.width}: ${blocked}; background behavior unobservable`);
  for (const pair of pairs) if (pair.outcome !== "compared" && pair.outcome !== "cut") unobservable.push(`${pair.id}/${pair.width}: ${pair.outcome}: ${pair.reason}`)
  const outcome = pairs.some(p => p.outcome === "compared") ? "compared" : pairs.some(p => p.outcome === "inconclusive") ? "inconclusive" : pairs.some(p => p.outcome === "auth required") || !pairs.length ? "auth required" : pairs.some(p => p.outcome === "not deployed") ? "not deployed" : "cut"
  return { view: view.id, spec: view, dist: options.dist, liveBase: options.liveBase, liveRepo: options.liveRepo, outcome, pairs, unobservable, runDir: options.runDir }
}

export const inspectParity = async (view: ViewSpec, options: Options): Promise<ParityOutput> => {
  const cut = cutOutput(view, options)
  if (cut) return cut
  const site = registrationFor(options.dist)
  await mkdir(options.runDir, { recursive: true })
  const { chromium } = createRequire(join(repoRoot, "apps/app/package.json"))("@playwright/test") as typeof import("../../../../../apps/app/node_modules/@playwright/test/index")
  const browser = await chromium.launch()
  const capture: CapturePage = async request => {
    const context = await browser.newContext({ viewport: { width: request.width, height: request.width === 390 ? 844 : 900 }, colorScheme: "light", storageState: request.auth, serviceWorkers: "block" })
    const blocked: string[] = []
    try {
      await context.route("**/*", async route => {
        const req = route.request()
        if (readOnlyRequest(req.method(), req.url())) await route.continue()
        else { blocked.push(`Blocked ${req.method()} ${new URL(req.url()).pathname}`); await route.abort("blockedbyclient") }
      })
      await context.routeWebSocket("**/*", socket => { socket.close() })
      await context.addInitScript({ content: 'globalThis.__name = target => target; addEventListener("submit", event => event.preventDefault(), true);' })
      const page = await context.newPage()
      const problems: string[] = []
      page.on("pageerror", e => problems.push(`page error: ${e.message}`))
      const response = await page.goto(request.url, { timeout: 30_000, waitUntil: "domcontentloaded" })
      // The live app boots for ~2-3 s after domcontentloaded (bootstrap reads, then the frame). Capturing at 600 ms
      // photographed the boot splash and scored every live view as "only a Smithers heading" (port-inc1, 2026-10-18).
      if (request.side === "live") await page.waitForFunction(() => Boolean(document.querySelector(".repo-frame")) || /\b(?:not found|404)\b/i.test(document.body.innerText), undefined, { timeout: 15_000 }).catch(() => {})
      await page.waitForTimeout(request.wait ?? 600)
      if (request.side === "live") await page.evaluate(() => {
        // auditPage's hash-route lookup is a mock-only contract. Live links are
        // inspected statically below, without following any destination.
        window.__SITE__ ??= { site: "live", routes: [], screens: [], resolve: route => route }
      })
      const raw = await page.evaluate(auditPage)
      problems.push(...(request.side === "mock" ? raw : raw.filter(p => !/with unsupported href|without target=_blank/.test(p))))
      if (request.side === "live") problems.push(...await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].flatMap(a => {
        try { const u = new URL(a.getAttribute("href")!, location.href); return /^(https?:|mailto:|tel:)$/.test(u.protocol) ? [] : [`dead link "${a.innerText.trim()}": unsupported protocol ${u.protocol}`] }
        catch { return ["dead link: invalid URL"] }
      })))
      const evidence = await page.evaluate(collectPage)
      const structure = await page.evaluate(collectStructure)
      await page.screenshot({ path: request.screenshot, fullPage: true, animations: "disabled" })
      return { ...evidence, structure, id: request.id, route: request.url, width: request.width, theme: "light", resolved: request.url, problems: [...new Set(problems)], screenshot: request.screenshot, status: response?.status(), finalUrl: page.url(),
        // Blocked background writes are visibility limits, not successful acts.
        ...(blocked.length ? { blockedRequests: blocked } : {}) }
    } finally { await context.close() }
  }
  try { return await collectPairs(view, site, options, capture) } finally { await browser.close() }
}
