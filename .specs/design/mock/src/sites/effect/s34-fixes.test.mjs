/* DOM regressions for s34; runs without launching a browser. */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { MessageChannel as NodeMessageChannel } from "node:worker_threads"

const rootPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..")
const requireApp = createRequire(join(rootPath, "apps/app/package.json"))
const { Window } = await import(requireApp.resolve("happy-dom"))
const window = new Window({ url: "https://mock.test/?still=1#/smithers.sh/Effect-TS/effect" })
for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "CustomEvent", "FormData", "sessionStorage", "localStorage", "history"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] })
}
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
    export { RepoFrame } from './.specs/design/mock/src/sites/repo/frame/RepoFrame'
    export { CodeHomeReady } from './.specs/design/mock/src/sites/repo/views/code-home/CodeHome'
    export { ReleasePlan } from './.specs/design/mock/src/sites/effect/releases/ReleasePlan'
    export { Packages, PackageHome } from './.specs/design/mock/src/sites/effect/scope/Packages'
    export * from './.specs/design/mock/src/sites/repo/fixtures'
  `, resolveDir: rootPath, loader: "jsx" },
  bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic",
  nodePaths: [join(rootPath, "apps/app/node_modules"), join(rootPath, "node_modules")],
  alias: { "@smthrs/ui": join(rootPath, "packages/smithers/ui/src/index.ts") }, loader: { ".css": "empty" }
})
const scratch = await mkdtemp(join(tmpdir(), "s34-fixes-"))
const modulePath = join(scratch, "review.mjs")
await writeFile(modulePath, built.outputFiles[0].text)
const kit = await import(pathToFileURL(modulePath).href)
const { React, act } = kit
const h = React.createElement
const container = document.createElement("div")
document.body.append(container)
let root, serial = 0
const failures = []
const check = async (name, run) => {
  try { await run(); console.log(`PASS ${name}`) }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`) }
}
const clear = async () => { if (root) await act(async () => root.unmount()); root = undefined; sessionStorage.clear() }
const render = async (slug, suffix, content, flags = {}) => {
  await clear()
  kit.selectRepo(slug)
  window.location.hash = `#/smithers.sh/${slug}${suffix ? `/${suffix}` : ""}`
  sessionStorage.setItem("site-mock-flags", JSON.stringify({ ...kit.DEFAULTS, as: "in", landing: "open", ...flags }))
  sessionStorage.setItem("repo-ask-open", "false")
  root = kit.createRoot(container)
  await act(async () => root.render(h(kit.MockProvider, { key: ++serial }, content)))
}
const frame = content => h(kit.RepoFrame, { tab: "code" }, content)
const repositoryTabs = () => container.querySelector('nav[aria-label="Repository"]')

try {
  await check("Declared Evals titles, direct Golden set and no counters", async () => {
    for (const [slug, title] of [["effeck/effeck", "Golden set"], ["smithers-canary/smithers", "Evals"]]) {
      await render(slug, "", frame(h("p", null, "Files")))
      const tab = [...repositoryTabs().querySelectorAll("a")].find(link => link.getAttribute("href").includes("/evals"))
      assert.equal(tab.firstChild.textContent.trim(), title)
      assert.ok(!tab.querySelector(".repo-ui-counter"), "Declared tabs have no count")
    }
  })
  await check("Declared Docs title", async () => {
    kit.selectRepo("Effect-TS/effect")
    const docs = kit.repo.config.docs
    const original = docs.title
    try {
      docs.title = "API reference"
      await render("Effect-TS/effect", "", frame(h("p", null, "Files")))
      assert.equal([...repositoryTabs().querySelectorAll("a")].find(link => link.getAttribute("href").endsWith("/docs")).textContent, "API reference")
    } finally { docs.title = original }
  })
  await check("Every branch and package filter has its own label on Effect home", async () => {
    await render("Effect-TS/effect", "", frame(h(kit.CodeHomeReady)))
    const filters = [...container.querySelectorAll('input[placeholder="Find a branch or tag…"], input[placeholder="Find a package…"]')]
    assert.equal(filters.filter(input => input.placeholder === "Find a branch or tag…").length, 2)
    assert.equal(filters.filter(input => input.placeholder === "Find a package…").length, 1)
    assert.equal(new Set(filters.map(input => input.id)).size, filters.length, "Picker IDs must be unique")
    for (const input of filters) {
      assert.equal(input.labels.length, 1)
      assert.equal(document.getElementById(input.id), input)
    }
  })
  await check("Code rows use each entry's commit and its timestamp", async () => {
    for (const slug of ["Effect-TS/effect", "smithers-canary/smithers"]) {
      await render(slug, "", frame(h(kit.CodeHomeReady)))
      const rows = [...container.querySelectorAll(".repo-code-home-file-row")]
      const shas = new Set()
      for (const entry of kit.children("")) {
        const expected = kit.commit(entry.sha) ?? kit.lastCommitFor(entry.path)
        if (!expected) continue
        shas.add(expected.sha)
        const row = rows.find(value => value.querySelector('[role="cell"] a').textContent === entry.path)
        assert.ok(row.querySelector(".repo-code-home-file-message a").getAttribute("href").endsWith(`/commit/${expected.sha}`), entry.path)
        assert.equal(row.querySelector("time").getAttribute("datetime"), expected.date, entry.path)
      }
      assert.ok(shas.size > 1, `${slug} has distinct row commits`)
    }
  })
  await check("Code rows fall back to history only when the entry SHA does not resolve", async () => {
    kit.selectRepo("Effect-TS/effect")
    const entry = kit.children("").find(value => kit.lastCommitFor(value.path))
    assert.ok(entry)
    const original = entry.sha
    const expected = kit.lastCommitFor(entry.path)
    try {
      entry.sha = "missing-entry-commit"
      await render("Effect-TS/effect", "", frame(h(kit.CodeHomeReady)))
      const row = [...container.querySelectorAll(".repo-code-home-file-row")].find(value => value.querySelector('[role="cell"] a').textContent === entry.path)
      assert.ok(row.querySelector(".repo-code-home-file-message a").getAttribute("href").endsWith(`/commit/${expected.sha}`))
    } finally { entry.sha = original }
  })
  await check("Packages, package home and release plan select their declared tabs", async () => {
    for (const [path, content, expected] of [
      ["packages", h(kit.Packages), "Packages"],
      ["packages/sql-pg", h(kit.PackageHome, { slug: "sql-pg" }), "Packages"],
      ["releases/plan?screen=s34-plan", h(kit.ReleasePlan), "Code"]
    ]) {
      for (const flags of [{}, { net: "slow" }, { net: "error" }, { data: "empty" }]) {
        await render("Effect-TS/effect", path, content, flags)
        assert.equal(repositoryTabs().querySelector('[aria-current="page"]').textContent, expected, `${path} ${JSON.stringify(flags)}`)
      }
    }
  })
  await check("Held release recovery follows the compact summary in the primary action slot", async () => {
    await render("Effect-TS/effect", "releases/plan?screen=s34-held&preview=1", h(kit.ReleasePlan), { landing: "install" })
    const main = container.querySelector(".effect-release-main")
    assert.ok(main.firstElementChild.querySelector("#effect-release-impact"), "Impact precedes expandable changesets")
    const impact = container.querySelector("#effect-release-impact").closest("section")
    const held = container.querySelector('[aria-label="Run locally"]')
    assert.ok(held.compareDocumentPosition(impact) & window.Node.DOCUMENT_POSITION_FOLLOWING, "Recovery is above detailed impact")
    assert.ok(container.querySelector(".effect-release-changesets-detail:not([open])"), "Changesets start collapsed")
    assert.ok([...held.querySelectorAll('button')].find(button => button.title === '/copy '+JSON.stringify('pnpm changeset version')))
    assert.equal(container.querySelector('button[title="/release.prepare"]'), null)
    assert.equal(container.querySelector(".effect-release-confirm"), null)
    const actionClass = held.parentElement.className
    await render("Effect-TS/effect", "releases/plan?screen=s34-open&preview=1", h(kit.ReleasePlan))
    assert.equal(container.querySelector('button[title="/release.prepare"]').parentElement.className, actionClass)
  })
  assert.deepEqual(failures, [], "All s34 regressions pass")
} finally {
  await clear()
  await window.happyDOM.abort()
  for (const channel of channels) { channel.port1.close(); channel.port2.close() }
  await rm(scratch, { recursive: true, force: true })
}
