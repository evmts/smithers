// The page's first paint (index.html): before the app's stylesheet loads, the page is the default theme's background
// in light and dark, so a tab that is loading never flashes white (decision 0020). This holds index.html's colors to
// @smthrs/ui's default theme, so a theme change can't leave the first paint behind.
import { DEFAULT_THEME_KEY, themeRegistry } from "@smthrs/ui"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, test } from "vitest"
import { THEME_ATTRIBUTE, THEME_MIRROR_KEY } from "./contract"

const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8")
const theme = themeRegistry[DEFAULT_THEME_KEY]

describe("the first paint", () => {
  // Run the real inline bootstrap in a fresh realm, with its browser host supplied at the program boundary.
  // There is no app store yet, as on a branch opened after storage eviction.
  test.each(["light", "dark"])("initializes the attribute under a %s system without saving a preference", (system) => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!
    for (const saved of [null, "", "sepia", "light", "dark", "blocked"]) {
      const attributes = new Map<string, string>()
      const mirror = new Map<string, string>(saved === null ? [] : [[THEME_MIRROR_KEY, saved]])
      runInNewContext(script, {
        localStorage: {
          getItem: (key: string) => {
            if (saved === "blocked") throw new Error("storage blocked")
            return mirror.get(key) ?? null
          },
          setItem: (key: string, value: string) => void mirror.set(key, value),
        },
        matchMedia: (query: string) => {
          expect(query).toBe("(prefers-color-scheme: dark)")
          return { matches: system === "dark" }
        },
        document: { documentElement: {
          dataset: {},
          setAttribute: (key: string, value: string) => void attributes.set(key, value),
        } },
      })
      expect(attributes.get(THEME_ATTRIBUTE), `saved: ${saved}`).toBe(saved === "light" || saved === "dark" ? saved : system)
      expect(mirror.get(THEME_MIRROR_KEY) ?? null).toBe(saved)
    }
  })

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
