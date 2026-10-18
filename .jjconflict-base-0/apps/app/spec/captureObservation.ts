import type { Page } from "@playwright/test"
import { type Observation, observe } from "./observation.ts"

export interface Volatile {
  readonly text: readonly string[]
  readonly selectors?: readonly string[]
}

/** Capture rendered evidence only. The special page scope includes visible data-view blocks and body text. */
export const captureObservation = async (page: Page, view: string, volatile?: Volatile): Promise<Observation> => {
  const root = view === "page" ? page.locator("body") : page.locator(`[data-view=${JSON.stringify(view)}]`)
  await root.waitFor({ state: "visible" }).catch(() => { throw new Error(`Expected one visible data-view: ${view}`) })
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  const blocks = await root.evaluate((node, view) => {
    const visible = (element: HTMLElement) => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    const nodes = view === "page" ? [node, ...node.querySelectorAll<HTMLElement>("[data-view]")] : [node]
    return nodes.filter((element): element is HTMLElement => element instanceof HTMLElement && visible(element)).map((
      element
    ) => ({ view: element.getAttribute("data-view") ?? "page", text: element.innerText }))
  }, view)
  const values = [...(volatile?.text ?? [])]
  for (const selector of volatile?.selectors ?? []) {
    for (const text of await page.locator(selector).allTextContents()) if (text) values.push(text)
  }
  const mask = [
    ...(volatile?.selectors ?? []).map((selector) => page.locator(selector)),
    ...(volatile?.text ?? []).map((text) => page.getByText(text, { exact: true }))
  ]
  const screenshot = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide", mask })
  return observe({ blocks, accessibility: await root.ariaSnapshot(), screenshot }, values)
}
