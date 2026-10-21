// The page's first paint (index.html): before the app's stylesheet loads, the page is the default theme's background
// in light and dark, so a tab that is loading never flashes white (decision 0020). This holds index.html's colors to
// @smthrs/ui's default theme, so a theme change can't leave the first paint behind.
import { DEFAULT_THEME_KEY, themeRegistry } from "@smthrs/ui"
import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8")
const theme = themeRegistry[DEFAULT_THEME_KEY]

describe("the first paint", () => {
  test("is the default theme's light background, and its dark one under a dark system or a dark choice", () => {
    expect(html).toContain(`html { background: ${theme.light.bg}; }`)
    expect(html).toContain(
      `@media (prefers-color-scheme: dark) { html:not([data-theme="light"]) { background: ${theme.dark.bg}; } }`,
    )
    expect(html).toContain(`html[data-theme="dark"] { background: ${theme.dark.bg}; }`)
  })

  test("sits in the head, before the app's script, so it is the page's first paint", () => {
    expect(html.indexOf("<style>")).toBeLessThan(html.indexOf("</head>"))
    expect(html.indexOf("<style>")).toBeLessThan(html.indexOf('src="/src/main.tsx"'))
  })
})
