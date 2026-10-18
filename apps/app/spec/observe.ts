import { expect, type Page } from "@playwright/test"
import type { Assertion, Element } from "./journey"
import type { AssertionResult } from "./results"

export interface Exchange {
  readonly method: string
  readonly url: string
  readonly status: number
  readonly body: unknown
}
export type Decode = (schema: string, body: unknown) => unknown
export const matches = (pattern: string, exchange: Pick<Exchange, "method" | "url">): boolean => {
  const [method, path] = pattern.split(" ")
  const expression = path!.split(/(:repo|\*)/).map((part) =>
    part === ":repo" ? "[^/]+/[^/]+" : part === "*" ? ".*" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  ).join("")
  return method === exchange.method && new RegExp(`^${expression}$`).test(new URL(exchange.url).pathname)
}
export const element = (page: Page, target: Element) => {
  const locator = page.getByRole(target.role as Parameters<Page["getByRole"]>[0], {
    ...(target.name === undefined ? {} : { name: target.name, exact: true }),
    ...(target.level === undefined ? {} : { level: target.level })
  })
  return target.href === undefined ? locator : locator.and(page.locator(`[href=${JSON.stringify(target.href)}]`))
}
export const observe = async (
  page: Page,
  assertion: Assertion,
  exchanges: ReadonlyArray<Exchange>,
  decode: Decode
): Promise<AssertionResult> => {
  const kind = "see" in assertion ? "see" : Object.keys(assertion)[0]!
  if ("fuzzy" in assertion || "rubric" in assertion) {
    return {
      kind,
      ok: null,
      expected: assertion,
      actual: null,
      verdict: "inconclusive",
      reason: "Judged assertions require the journey judge context"
    }
  }
  let actual: unknown = null
  try {
    if ("see" in assertion) {
      const locator = element(page, assertion.see)
      if (assertion.count !== undefined) await expect(locator).toHaveCount(assertion.count)
      else await expect(locator).toBeVisible()
      if (assertion.text !== undefined) await expect(locator).toContainText(assertion.text)
      actual = await locator.count()
    } else if ("absent" in assertion) {
      await expect(page.getByText(assertion.absent, { exact: false })).toHaveCount(0)
      actual = 0
    } else if ("text" in assertion) {
      if (assertion.source === "html") {
        const response = await page.request.get(page.url())
        if (!response.ok()) throw new Error(`Static HTML: HTTP ${response.status()}`)
        const text = await page.evaluate(
          (html) => new DOMParser().parseFromString(html, "text/html").body.textContent ?? "",
          await response.text()
        )
        if (!text.includes(assertion.text)) throw new Error(`Static HTML missing: ${assertion.text}`)
      } else await expect(page.locator("body")).toContainText(assertion.text)
      actual = assertion.text
    } else if ("url" in assertion) {
      if (assertion.on) {
        await expect(element(page, assertion.on)).toBeVisible()
        actual = await element(page, assertion.on).getAttribute("href")
      } else actual = page.url()
      if (typeof assertion.url === "string") {
        if (actual !== assertion.url) throw new Error(`URL: expected ${assertion.url}, got ${String(actual)}`)
      } else {
        if (typeof actual !== "string" || !actual.startsWith(assertion.url.startsWith)) {
          throw new Error(`URL prefix: ${assertion.url.startsWith}, got ${String(actual)}`)
        }
        for (const part of assertion.url.includes ?? []) {
          if (!decodeURIComponent(actual).includes(part)) throw new Error(`URL missing ${part}`)
        }
        for (const part of assertion.url.absent ?? []) {
          if (decodeURIComponent(actual).includes(part)) throw new Error(`URL reveals ${part}`)
        }
      }
    } else {
      const pattern = "shape" in assertion ? assertion.shape : assertion.sent
      const found = exchanges.filter((exchange) => matches(pattern, exchange))
      actual = found.map(({ method, url, status }) => ({ method, path: new URL(url).pathname, status }))
      if (found.length === 0) throw new Error(`No response observed: ${pattern}`)
      if ("shape" in assertion) {
        for (const exchange of found) {
          if (exchange.status < 200 || exchange.status >= 300) {
            throw new Error(`HTTP ${exchange.status}: ${exchange.url}`)
          }
          decode(assertion.schema, exchange.body)
        }
      }
    }
    return { kind, ok: true, expected: assertion, actual }
  } catch (error) {
    return {
      kind,
      ok: false,
      expected: assertion,
      actual,
      reason: error instanceof Error ? error.message : String(error)
    }
  }
}
