import { expect, type Page, type Locator } from "@playwright/test"
import type { Assertion, Element } from "./journey"
import type { AssertionResult } from "./results"

export interface Exchange { readonly method: string; readonly url: string; readonly status: number; readonly body: unknown }
export type Decode = (schema: string, body: unknown) => unknown
export const matches = (pattern: string, exchange: Pick<Exchange, "method" | "url">): boolean => {
  const [method, path] = pattern.split(" ")
  const expression = path!.split(/(:repo|\*)/).map(part => part === ":repo" ? "[^/]+/[^/]+" : part === "*" ? ".*" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("")
  return method === exchange.method && new RegExp(`^${expression}$`).test(new URL(exchange.url).pathname)
}
export const element = (page: Page, target: Element): Locator => {
  const parent = target.within ? element(page, target.within) : page
  let locator = parent.getByRole(target.role as Parameters<Page["getByRole"]>[0], {
  ...(target.name === undefined ? {} : { name: target.name, exact: true }),
  ...(target.level === undefined ? {} : { level: target.level })
})
  if (target.editable !== undefined) locator = locator.and(page.locator(target.editable ? ":read-write" : ":read-only"))
  return target.href === undefined ? locator : locator.and(page.locator(`[href=${JSON.stringify(target.href)}]`))
}
export const observe = async (page: Page, assertion: Assertion, exchanges: ReadonlyArray<Exchange>, decode: Decode, timeoutMs = 5000): Promise<AssertionResult> => {
  const check = expect.configure({ timeout: timeoutMs })
  const kind = ["see", "absent", "text", "url", "sent", "shape", "fuzzy", "rubric"].find(kind => kind in assertion)!
  if ("fuzzy" in assertion || "rubric" in assertion) return { kind, ok: null, expected: assertion, actual: null, reason: "skipped: judges arrive in spec4" }
  let actual: unknown = null
  try {
    if ("see" in assertion) {
      const locator = element(page, assertion.see)
      if (assertion.count !== undefined) await check(locator).toHaveCount(assertion.count)
      else await check(locator).toBeVisible()
      if (assertion.text !== undefined) await check(locator).toContainText(assertion.text)
      actual = await locator.count()
    } else if ("absent" in assertion) {
      await check(page.getByText(typeof assertion.absent === "string" ? assertion.absent : new RegExp(assertion.absent.pattern, "i"), { exact: false })).toHaveCount(0)
      actual = 0
    } else if ("text" in assertion) {
      if (assertion.source === "html") {
        const response = await page.request.get(page.url())
        if (!response.ok()) throw new Error(`Static HTML: HTTP ${response.status()}`)
        const text = await page.evaluate(html => new DOMParser().parseFromString(html, "text/html").body.textContent ?? "", await response.text())
        if (!text.replace(/\s+/g, " ").includes(assertion.text.replace(/\s+/g, " "))) throw new Error(`Static HTML missing: ${assertion.text}`)
      } else await check(page.locator("body")).toContainText(assertion.text)
      actual = assertion.text
    } else if ("url" in assertion) {
      if (assertion.on) {
        await check(element(page, assertion.on)).toBeVisible()
        actual = await element(page, assertion.on).getAttribute("href")
      } else actual = page.url()
      if (typeof actual !== "string" || actual.length === 0) throw new Error("URL missing")
      if (typeof assertion.url === "string") {
        if (actual !== assertion.url) throw new Error(`URL: expected ${assertion.url}, got ${String(actual)}`)
      } else {
        if (typeof actual !== "string" || !actual.startsWith(assertion.url.startsWith)) throw new Error(`URL prefix: ${assertion.url.startsWith}, got ${String(actual)}`)
        if (assertion.url.matches && !new RegExp(assertion.url.matches, "i").test(decodeURIComponent(actual))) throw new Error(`URL does not match ${assertion.url.matches}`)
        for (const part of assertion.url.includes ?? []) if (!decodeURIComponent(actual).includes(part)) throw new Error(`URL missing ${part}`)
        for (const part of assertion.url.absent ?? []) if (decodeURIComponent(actual).includes(part)) throw new Error(`URL reveals ${part}`)
      }
      if (assertion.status !== undefined) {
        const response = await page.request.get(new URL(actual, page.url()).href)
        if (response.status() !== assertion.status) throw new Error(`URL HTTP ${response.status()}, expected ${assertion.status}`)
        actual = { url: actual, status: response.status() }
      }
    } else {
      const pattern = "shape" in assertion ? assertion.shape : assertion.sent
      const found = exchanges.filter(exchange => matches(pattern, exchange))
      actual = found.map(({ method, url, status }) => ({ method, path: new URL(url).pathname, status }))
      if (found.length === 0) throw new Error(`No response observed: ${pattern}`)
      if ("shape" in assertion) for (const exchange of found) {
        decode(assertion.schema, exchange.body)
        if (exchange.status < 200 || exchange.status >= 300) throw new Error(`HTTP ${exchange.status}: ${exchange.url}`)
      }
    }
    return { kind, ok: true, expected: assertion, actual }
  } catch (error) {
    return { kind, ok: false, expected: assertion, actual, reason: error instanceof Error ? error.message : String(error) }
  }
}
