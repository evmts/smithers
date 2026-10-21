import type { Page, TestInfo } from "@playwright/test"

type Heap = { at: string; usedBytes?: number; source: "cdp" | "performance.memory" | "unavailable" }

/** Keep two heap samples per page, without overlapping probes or collecting any page content. */
export const watchCrashes = (page: Page, name: string, log: Array<string>) => {
  const heap: Array<Heap> = []
  let failure: string | undefined
  let stopped = false
  let sampling = false
  // Chromium supplies precise heap sizes here; other browsers can expose performance.memory instead.
  const session = page.context().newCDPSession(page).then(async (cdp) => {
    try {
      await cdp.send("Performance.enable")
      return cdp
    } catch {
      await cdp.detach().catch(() => undefined)
      return undefined
    }
  }).catch(() => undefined)
  const sample = async () => {
    if (sampling || stopped || failure !== undefined || page.isClosed()) return
    sampling = true
    try {
      const cdp = await session
      let usedBytes: number | undefined
      let source: Heap["source"] = "unavailable"
      if (cdp !== undefined) {
        const metrics = await cdp.send("Performance.getMetrics")
        usedBytes = metrics.metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value
        if (usedBytes !== undefined) source = "cdp"
      }
      if (usedBytes === undefined) {
        usedBytes = await page.evaluate(() =>
          (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
        )
        if (usedBytes !== undefined) source = "performance.memory"
      }
      if (stopped || failure !== undefined) return
      const point: Heap = { at: new Date().toISOString(), usedBytes, source }
      heap.push(point)
      if (heap.length > 2) heap.shift()
      log.push(`heap: ${name} ${JSON.stringify(point)}`)
    } catch {
      // Navigation or a closing renderer can interrupt a probe; retain the last successful samples.
    } finally {
      sampling = false
    }
  }
  const timer = setInterval(() => void sample(), 5_000)
  timer.unref()
  const crash = () => {
    failure = `Page crashed: tab ${name} at ${new Date().toISOString()}; JS heap trend (bytes): ${JSON.stringify(heap)}`
    log.push(failure)
    clearInterval(timer)
  }
  page.on("crash", crash)
  page.once("close", () => {
    stopped = true
    clearInterval(timer)
  })
  void sample()
  return {
    get failure() { return failure },
    async stop() {
      stopped = true
      clearInterval(timer)
      page.off("crash", crash)
      await (await session)?.detach().catch(() => undefined)
    },
  }
}

/** Enrich the action's error as well as the browser log, so a hover failure names its tab and heap trend. */
export const describeCrashes = (testInfo: TestInfo, failures: Array<string>) => {
  if (failures.length === 0) return
  const detail = failures.join("\n")
  for (const error of testInfo.errors) {
    error.message = `${error.message ?? "Browser action failed"}\n${detail}`
    if (error.stack !== undefined) error.stack += `\n${detail}`
  }
}
