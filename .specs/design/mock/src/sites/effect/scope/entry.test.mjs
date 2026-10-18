/* Build --site=effect first. Executes its local bundle in a DOM; does not launch a browser. */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../..")
const requireApp = createRequire(join(root, "apps/app/package.json"))
const { Window } = await import(requireApp.resolve("happy-dom"))
const window = new Window({ url: "https://mock.test/?still=1#/smithers.sh/Effect-TS/effect", settings: { enableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, suppressInsecureJavaScriptEnvironmentWarning: true } })
window.document.body.innerHTML = '<div id="root"></div>'
window.sessionStorage.setItem("repo-ask-open", "false")
window.sessionStorage.setItem("site-mock-flags", JSON.stringify({ as: "in", role: "member", net: "ok", data: "full", landing: "open" }))
try {
  const html = await readFile(join(root, ".specs/design/mock/dist-codex/effect/index.html"), "utf8")
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join("\n")
  window.eval(`(function () {\n${script}\n})()`)
  await new Promise(resolve => setTimeout(resolve, 150))
  const catalog = window.__SITE__
  assert(catalog, "Effect entry mounts")
  assert.equal(catalog.site, "effect")
  assert(catalog.screens.length > 20)
  assert.equal(new Set(catalog.screens.map(screen => screen.id)).size, catalog.screens.length, "Screen IDs are unique")
  assert(catalog.screens.every(screen => !screen.route.includes("maya/tinyhttp")), "Review catalog drops tinyhttp screens")
  for (const pattern of catalog.routes) assert(catalog.screens.some(screen => catalog.resolve(screen.route) === pattern), `Route has a reachable review screen: ${pattern}`)
  const links = [...window.document.querySelectorAll(".repo-code-home-links a")]
  for (const label of ["Packages", "Version packages", "Docs"]) assert(links.some(link => link.textContent === label), `Code home renders configured ${label} link`)
  assert(window.document.querySelector(".effect-scope-picker"), "Code home has the package picker")
  assert(catalog.routes.indexOf("smithers.sh/:owner/:repo/packages") < catalog.routes.indexOf("smithers.sh/:owner/:repo"), "Package routes precede generic repository routes")
  if (process.env.SCOPE_SCREEN_REPORT) await writeFile(resolve(process.env.SCOPE_SCREEN_REPORT), JSON.stringify({
    site: catalog.site,
    routes: catalog.routes.map(pattern => ({ pattern, screens: catalog.screens.filter(screen => catalog.resolve(screen.route) === pattern) }))
  }, null, 2) + "\n")
  console.log(`Effect entry passed: ${catalog.routes.length} routes, ${catalog.screens.length} unique screens; configured Code links and picker rendered`)
} finally { await window.happyDOM.abort() }
