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
  // Lazy view/editor chunks must finish before comparing rendered frames.
  await page.waitForLoadState("networkidle")
  const mask = [
    ...(volatile?.selectors ?? []).map((selector) => page.locator(selector)),
    ...(volatile?.text ?? []).map((text) => page.getByText(text, { exact: true }))
  ]
  // A visible body can still be the boot skeleton. Do not judge that transient page.
  const loading = page.getByRole("status", { name: "Loading view", exact: true })
  await loading.waitFor({ state: "hidden" })
  const deadline = Date.now() + 5000
  let previous: string | undefined
  do {
    await loading.waitFor({ state: "hidden" })
    // Screenshots settle fonts/animations; then require two identical complete observations.
    const screenshot = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide", mask })
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
    const current = observe({ blocks, accessibility: await root.ariaSnapshot(), screenshot }, values)
    if (current.accessibility.includes('- status "Loading view"') || await loading.isVisible()) {
      previous = undefined
      continue
    }
    const key = JSON.stringify(current)
    if (key === previous) return current
    previous = key
  } while (Date.now() < deadline)
  throw new Error("Observation did not settle")
}
