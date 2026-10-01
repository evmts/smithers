import { writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { chromium } from "playwright"

/** Render the captured terminal HTML with the declared, provisioned test browser. */
export const screenshot = async (
  html: string,
  png: string,
  content: string,
  width: number,
  height: number,
  timeout: number
) => {
  writeFileSync(html, content)
  const deadline = Date.now() + timeout
  const remaining = () => {
    const ms = deadline - Date.now()
    if (ms <= 0) throw new Error("Terminal screenshot deadline exceeded")
    return ms
  }
  const browser = await chromium.launch({ timeout: remaining() })
  try {
    const page = await browser.newPage({ viewport: { width, height } })
    await page.goto(pathToFileURL(html).href, { timeout: remaining() })
    const bytes = await page.screenshot({ path: png, timeout: remaining() })
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error("Terminal screenshot is not a PNG")
    }
  } finally {
    await browser.close()
  }
}
