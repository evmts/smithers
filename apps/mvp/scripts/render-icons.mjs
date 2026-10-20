// Renders the PWA's PNG icons (public/icon-192.png, icon-512.png, icon-maskable-512.png) from public/icon.svg, which is
// apps/app's favicon, generated from the @smthrs/ui wordmark. Run it after icon.svg changes: `node scripts/render-icons.mjs`.
import { chromium } from "@playwright/test"
import { readFile } from "node:fs/promises"

const publicDir = new URL("../public/", import.meta.url)
const svg = await readFile(new URL("icon.svg", publicDir), "utf8")
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`

// A maskable icon fills its square and keeps the mark inside the central 80% safe zone.
const icons = [
  { file: "icon-192.png", size: 192, inset: 0, background: "transparent" },
  { file: "icon-512.png", size: 512, inset: 0, background: "transparent" },
  { file: "icon-maskable-512.png", size: 512, inset: 0.2, background: "#f7f6f1" },
]

const browser = await chromium.launch()
try {
  for (const { file, size, inset, background } of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, colorScheme: "light" })
    const mark = Math.round(size * (1 - inset))
    await page.setContent(
      `<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${background}">` +
        `<img src="${src}" width="${mark}" height="${mark}"></body>`,
    )
    await page.locator("img").evaluate((image) => image.decode())
    await page.screenshot({ path: new URL(file, publicDir).pathname, omitBackground: background === "transparent" })
    await page.close()
  }
} finally {
  await browser.close()
}
