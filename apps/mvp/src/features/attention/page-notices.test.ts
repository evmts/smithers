import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

// The app's placement contract complements the browser's hit-testing regression: page notices must take space in
// the document, before the routed page. A fixed stack makes even one long-lived card cover the page's controls.
test("page notices occupy document space before the page", () => {
  const view = readFileSync(new URL("./components/PageNotices.tsx", import.meta.url), "utf8")
  const root = readFileSync(new URL("../../screens/root/Root.tsx", import.meta.url), "utf8")
  expect(view).toContain('placement="inline"')
  expect(root.indexOf("<PageNotices />")).toBeLessThan(root.indexOf("<Outlet />"))
})
