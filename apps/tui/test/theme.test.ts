import { themeRegistry } from "@smthrs/ui-styleguide"
import { expect, test } from "bun:test"
import { color } from "../src/theme.ts"
import * as View from "../src/view.tsx"

test("terminal semantic colors match the browser Paper dark palette", () => {
  const dark = themeRegistry.paper.dark
  for (
    const [name, token] of [
      ["page", "bg"],
      ["surface", "surface"],
      ["element", "surface2"],
      ["text", "text"],
      ["muted", "textMuted"],
      ["faint", "textFaint"],
      ["brand", "brand"]
    ] as const
  ) {
    expect(color[name]).toBe(dark[token])
  }
})

test("writing status uses the retained brand accent", () => {
  expect(View.statusColor("writing")).toBe(color.brand)
})
