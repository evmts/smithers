/* DOM behavior checks; no browser is launched. */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { MessageChannel as NodeMessageChannel } from "node:worker_threads"

const rootPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../..")
const requireApp = createRequire(join(rootPath, "apps/app/package.json"))
const { Window } = await import(requireApp.resolve("happy-dom"))
const window = new Window({ url: "https://mock.test/?still=1#/smithers.sh/Effect-TS/effect/docs" })
for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "CustomEvent", "FormData", "sessionStorage", "localStorage", "history", "CSS"]) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] })
window.matchMedia = query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })
globalThis.matchMedia = window.matchMedia
window.HTMLElement.prototype.scrollIntoView = function () {}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const channels = []
globalThis.MessageChannel = class extends NodeMessageChannel { constructor() { super(); channels.push(this) } }
const { build } = requireApp("esbuild")
const built = await build({
  stdin: { contents: `
    export { default as React, act } from 'react'
    export { createRoot } from 'react-dom/client'
    export { MockProvider, DEFAULTS, flagsIn } from './.specs/design/mock/src/sites/core/mock'
    export { PackageDocs } from './.specs/design/mock/src/sites/effect/docs/configuration'
    export { pagesFor, sourceFor } from './.specs/design/mock/src/sites/effect/docs/model'
    export { issuesFor, pullsFor, runsFor } from './.specs/design/mock/src/sites/effect/work/filters'
    export { selectRepo, repo, issues, pulls, runs } from './.specs/design/mock/src/sites/repo/fixtures'
    export { extras } from './.specs/design/mock/src/sites/repo/fixtures/data/Effect-TS__effect'
    export { getSlash } from './.specs/design/mock/src/sites/repo/frame/slash'
    export { routes as docRoutes } from './.specs/design/mock/src/sites/effect/docs/routes'
  `, resolveDir: rootPath, loader: "jsx" },
  bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic",
  nodePaths: [join(rootPath, "apps/app/node_modules"), join(rootPath, "node_modules")],
  alias: { "@smthrs/ui": join(rootPath, "packages/smithers/ui/src/index.ts") }, loader: { ".css": "empty" }
})
const scratch = await mkdtemp(join(tmpdir(), "effect-docs-work-"))
const modulePath = join(scratch, "check.mjs")
await writeFile(modulePath, built.outputFiles[0].text)
const kit = await import(pathToFileURL(modulePath).href)
const { React, act } = kit
const h = React.createElement
const base = "smithers.sh/Effect-TS/effect"
const container = document.createElement("div"); document.body.append(container)
let root, serial = 0, assertions = 0
const check = (value, message) => { assert(value, message); assertions++ }
const route = async value => { await act(async () => { window.location.hash = `#/${value}`; window.dispatchEvent(new window.HashChangeEvent("hashchange")) }) }
const render = async (component, flags = {}) => {
  sessionStorage.setItem("site-mock-flags", JSON.stringify({ ...kit.DEFAULTS, as: "in", landing: "open", ...flags }))
  sessionStorage.setItem("repo-ask-open", "false")
  root ??= kit.createRoot(container)
  await act(async () => root.render(h(kit.MockProvider, { key: ++serial }, component)))
}
const text = () => container.textContent
const button = title => container.querySelector(`button[title="${title}"]`)
const click = async element => { check(element, "Requested control exists"); await act(async () => element.click()) }
const context = { closeAsk() {}, flags: kit.DEFAULTS, location: `${base}/docs` }
try {
  kit.selectRepo("Effect-TS/effect")
  const pg = kit.repo.config.packages.find(pkg => pkg.slug === "sql-pg")
  check(kit.issuesFor("sql-pg").some(item => item.n === 42), "Declared PostgreSQL issue is included")
  check(!kit.issuesFor("sql-pg").some(item => item.n === 54), "Unrelated package issue is excluded")
  check(kit.issuesFor(pg).some(item => item.n === 58), "Shared issue stays visible")
  check(kit.issuesFor("sql-pg", [{ ...kit.issues[0], n: 999 }]).length === 1, "Unknown association stays visible")
  check(kit.issuesFor("unknown").length === kit.issues.length, "Unknown scope does not exclude work")
  check(kit.issuesFor(null).length === kit.issues.length, "All packages retains every issue")
  check(kit.pullsFor(pg).some(item => item.n === 101), "Cross-package pull remains complete")
  check(!kit.pullsFor(pg).some(item => item.n === 102), "Changed-path association filters pulls")
  check(kit.runsFor(pg).some(item => item.id === "run-4804"), "Docs run is associated with PostgreSQL")
  check(kit.runsFor(pg, [{ ...kit.runs[0], id: "new-local-run" }]).length === 1, "New local runs stay visible")
  const original = JSON.stringify(kit.pulls)
  kit.pullsFor(pg)
  check(JSON.stringify(kit.pulls) === original, "Discovery filtering does not mutate pull contents")
  check(kit.pagesFor(pg).length === 4, "PostgreSQL README and three API pages are present")
  const another = kit.repo.config.packages.find(pkg => pkg.slug === "sql-mysql2")
  check(kit.pagesFor(another).length > 0, "Package READMEs supplement curated docs")
  check(kit.sourceFor(kit.pagesFor(pg).find(page => page.title === "PgClient"), pg) === "packages/sql/pg/src/PgClient.ts", "API source resolves to real blob path")
  await route(`${base}/docs`)
  await render(h(kit.PackageDocs))
  check(container.querySelectorAll(".effect-docs-package-row").length === 38, "Docs index groups all 38 packages")
  check(container.querySelectorAll(".effect-docs-package-group").length === 7, "Docs index includes six package families and guides")
  await route(`${base}/docs?package=sql-pg`)
  await render(h(kit.PackageDocs))
  check(container.querySelectorAll(".effect-docs-package-row").length === 1, "Query scopes docs index")
  await route(`${base}/docs/sql-pg?package=sql-pg`)
  await render(h(kit.PackageDocs, { path: "sql-pg" }))
  check(text().includes("Session defaults") && container.querySelector(".repo-docs-article pre"), "Package page renders real README and code")
  check(container.querySelector('.effect-docs-source a[href*="/blob/main/packages/sql/pg/README.md"]'), "README links to its source")
  check(!kit.getSlash("docs.generate") && kit.getSlash("docs.package"), "Docs actions are registered in Ask")
  await route(`${base}/docs/sql-pg/PgConnection?package=sql-pg`)
  await render(h(kit.PackageDocs, { path: "sql-pg/PgConnection" }))
  check(text().includes("source changed since") && container.querySelector('.effect-docs-stale a[href*="runs/run-4804"]'), "Stale page retains generation provenance and source")
  await route(`${base}/docs/sql-pg/missing?package=sql-pg`)
  await render(h(kit.PackageDocs, { path: "sql-pg/missing" }))
  check(text().includes("No docs page at sql-pg/missing"), "Missing page is explicit")
  await route(`${base}/docs/ai-codegen?package=ai-codegen`)
  await render(h(kit.PackageDocs, { path: "ai-codegen" }))
  check(text().includes("No docs for @effect/ai-codegen"), "Package without docs has its own empty state")
  for (const suffix of ['?generation=failed','?generation=preview','?act=generate']) {
    const query = new URLSearchParams(suffix.slice(1))
    await render(kit.docRoutes[1].render({ params: { owner: 'Effect-TS', repo: 'effect', '*': 'sql-pg' }, query }))
    check(text().includes('Page not found.'), 'Removed generation URL is not found: '+suffix)
  }
  for (const flags of [{as:'out'}, {role:'reader'}]) {
    await route(`${base}/docs/sql-pg?package=sql-pg`)
    await render(h(kit.PackageDocs, {path:'sql-pg'}), flags)
    check(text().includes('Session defaults'), 'Public docs stay readable')
    check(!button('/docs.generate @effect/sql-pg'), 'No generation control')
  }
  console.log(`PASS ${assertions} docs and package-filter checks`)
} finally {
  if (root) await act(async () => root.unmount())
  await window.happyDOM.abort()
  for (const channel of channels) { channel.port1.close(); channel.port2.close() }
  await rm(scratch, { recursive: true, force: true })
}
