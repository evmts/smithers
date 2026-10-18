/* node .specs/design/mock/src/sites/effect/scope/scope.test.mjs — no browser launch. */
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
const window = new Window({ url: "https://mock.test/?still=1#/smithers.sh/Effect-TS/effect/packages" })
for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "CustomEvent", "FormData", "sessionStorage", "localStorage", "history"]) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] })
window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
globalThis.matchMedia = window.matchMedia
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const channels = []
globalThis.MessageChannel = class extends NodeMessageChannel { constructor() { super(); channels.push(this) } }
const { build } = requireApp("esbuild")
const built = await build({
  stdin: { contents: `
    export { default as React, act } from 'react'
    export { createRoot } from 'react-dom/client'
    export { MockProvider, DEFAULTS } from './.specs/design/mock/src/sites/core/mock'
    export { RepoFrame } from './.specs/design/mock/src/sites/repo/frame'
    export { Packages, PackageHome } from './.specs/design/mock/src/sites/effect/scope/Packages'
    export { scopeFromLocation, scopeDestination, scopedRoute } from './.specs/design/mock/src/sites/repo/frame/packageScope'
    export { selectRepo, repo } from './.specs/design/mock/src/sites/repo/fixtures'
    export { getSlash } from './.specs/design/mock/src/sites/repo/frame/slash'
    export { routes } from './.specs/design/mock/src/sites/effect/scope/routes'
  `, resolveDir: rootPath, loader: "jsx" },
  bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic",
  nodePaths: [join(rootPath, "apps/app/node_modules"), join(rootPath, "node_modules")],
  alias: { "@smthrs/ui": join(rootPath, "packages/smithers/ui/src/index.ts") }, loader: { ".css": "empty" }
})
const scratch = await mkdtemp(join(tmpdir(), "effect-scope-test-"))
const modulePath = join(scratch, "scope.mjs")
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
try {
  kit.selectRepo("Effect-TS/effect")
  const packages = kit.repo.config.packages
  const pg = packages.find(pkg => pkg.slug === "sql-pg")
  check(packages.length === 38, "All package manifests load")
  check(kit.scopeFromLocation(`${base}/tree/main/packages/sql/pg/src`, packages) === pg, "Directory infers package")
  check(kit.scopeFromLocation(`${base}/blob/main/packages/sql/pg/src/PgClient.ts?package=effect`, packages) === pg, "File path overrides stale scope")
  check(kit.scopeFromLocation(`${base}/blob/main/packages/sql/pglite/package.json`, packages)?.slug === "sql-pglite", "Path segment boundaries prevent pg/pglite confusion")
  check(kit.scopeFromLocation(`${base}/blob/main/packages/sql/pg/src/PgClient.ts`, [...packages, { ...pg, name: "parent", path: "packages/sql" }]) === pg, "Longest matching root wins")
  check(kit.scopeFromLocation(`${base}/pull/101?package=sql-pg`, packages) === pg, "Detail pages read query scope")
  check(kit.scopeFromLocation(`${base}/packages/sql-pg?package=effect`, packages) === pg, "Package home identifies itself")
  check(kit.scopeFromLocation(`${base}/issues?package=unknown`, packages) === null, "Unknown scope does not invent a package")
  const switched = kit.scopeDestination(`${base}/pull/101/files?package=effect&as=in&role=reader&q=bug&ref=feature&L=10&act=review`, "sql-pg", packages)
  const switchedQuery = new URLSearchParams(switched.split("?")[1])
  check(switched.startsWith(`${base}/pulls?`), "Switching from PR opens discovery list")
  check(switchedQuery.get("package") === "sql-pg" && switchedQuery.get("q") === "bug" && switchedQuery.get("role") === "reader" && switchedQuery.get("ref") === "feature", "Switch preserves filters, branch and mock flags")
  check(!switchedQuery.has("L") && !switchedQuery.has("act"), "Subject actions and line selections do not leak into lists")
  check(kit.scopeDestination(`${base}/blob/feature/packages/sql/pg/src/PgClient.ts?net=slow`, null, packages).startsWith(`${base}/tree/feature?`), "All packages clears inferred package without losing branch")
  check(kit.scopeDestination(`${base}/packages/sql-pg?ref=fix%2Fpg-aborted-commit`, null, packages).startsWith(`${base}/tree/fix%2Fpg-aborted-commit?`), "Clearing package preserves slash-bearing branch names")
  check(kit.scopeDestination(`${base}/docs/sql-pg/PgClient?net=ok`, "effect", packages).startsWith(`${base}/docs/effect?`), "Docs switches to chosen package")
  check(kit.scopedRoute(`${base}/issues?q=is%3Aopen`, pg).includes("package=sql-pg"), "Scoped links preserve their own query")
  for (const screen of kit.routes.flatMap(route => route.screens)) {
    const q = new URLSearchParams(screen.route.split("?")[1])
    check([...q.keys()].every(key => q.getAll(key).length === 1), `${screen.id} has unambiguous flags`)
  }
  await route(`${base}/packages`)
  await render(h(kit.Packages))
  check(container.querySelectorAll(".effect-package-row").length === 38, "Index renders every package")
  check(container.querySelectorAll(".effect-packages-group").length === 6, "Index groups Core, AI, Atom, Platform, SQL and Tools")
  const pgRow = [...container.querySelectorAll(".effect-package-row")].find(row => row.textContent.includes("@effect/sql-pg") && !row.textContent.includes("@effect/sql-pglite"))
  check(pgRow.querySelector(".effect-package-counts a").getAttribute("href").includes("package=sql-pg"), "Open work links scope to row package")
  await route(`${base}/packages?q=missing-package`)
  await render(h(kit.Packages))
  check(text().includes("No matching packages."), "Search has distinct no-matches state")
  await route(`${base}/packages/sql-pg`)
  await render(h(kit.PackageHome, { slug: "sql-pg" }))
  check(container.querySelector(".effect-scope-picker summary").textContent.includes("@effect/sql-pg"), "Picker shows package identity")
  const tabs = [...container.querySelectorAll('nav[aria-label="Repository"] a')]
  check(tabs.length > 0 && tabs.every(link => new URLSearchParams(link.getAttribute("href").split("?")[1]).get("package") === "sql-pg"), "Every repository tab carries scope")
  check(container.querySelectorAll(".effect-package-file-row").length > 0 && container.querySelector(".effect-package-readme"), "Package home has tree and README")
  check(container.querySelector('a[href="https://www.npmjs.com/package/@effect/sql-pg"]')?.target === "_blank", "npm opens externally")
  check(container.querySelector('.effect-package-sidebar a[href*="packages/effect"]'), "Workspace dependency opens its package home")
  check(kit.getSlash("package.scope") && kit.getSlash("package.open") && !kit.getSlash("package.check"), "Picker is available; removed package check is absent")
  await route(`${base}/packages/bundle`)
  await render(h(kit.PackageHome, { slug: "bundle" }))
  check(text().includes("Private package") && !container.querySelector(".effect-package-npm"), "Private tools omit publication links")
  await route(`${base}/packages/sql-pg`)
  await render(h(kit.PackageHome, { slug: "sql-pg" }), { net: "slow" })
  check(container.querySelector('[aria-label="Loading"]'), "Slow reads show loading")
  await render(h(kit.PackageHome, { slug: "sql-pg" }), { net: "error", data: "empty" })
  check(text().includes("Couldn't load this package.") && !text().includes("This package has no files."), "Error takes precedence over empty data")
  await act(async () => { container.querySelector('button[title="/retry"]').click(); await new Promise(resolve => setTimeout(resolve, 750)) })
  check(text().includes("This package has no files."), "Retry recovers read and then respects empty data")
  await render(h(kit.PackageHome, { slug: "missing" }))
  check(text().includes("Package missing wasn't found."), "Missing package is explicit")
  kit.selectRepo("maya/tinyhttp")
  await route("smithers.sh/maya/tinyhttp")
  await render(h(kit.RepoFrame, { tab: "code" }, "Ordinary repository"))
  check(!container.querySelector(".effect-scope-controls"), "Single-package repositories retain their existing frame")
  console.log(`Passed ${assertions} package scope and page assertions`)
} finally {
  if (root) await act(async () => root.unmount())
  await window.happyDOM.abort()
  for (const channel of channels) { channel.port1.close(); channel.port2.close() }
  await rm(scratch, { recursive: true, force: true })
}
