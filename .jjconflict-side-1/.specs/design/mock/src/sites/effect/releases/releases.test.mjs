/* node .specs/design/mock/src/sites/effect/releases/releases.test.mjs — DOM checks without launching a browser. */
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
const window = new Window({ url: "https://mock.test/?still=1#/smithers.sh/Effect-TS/effect/releases/plan" })
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
    export { setRoutes, resolveRoute } from './.specs/design/mock/src/sites/core/router'
    export { ReleasePlan } from './.specs/design/mock/src/sites/effect/releases/ReleasePlan'
    export { PackageReleases } from './.specs/design/mock/src/sites/effect/releases/configuration'
    export { VersionPull } from './.specs/design/mock/src/sites/effect/releases/VersionPull'
    export { routes } from './.specs/design/mock/src/sites/effect/releases/routes'
    export * from './.specs/design/mock/src/sites/effect/releases/model'
    export { selectRepo, repo, pulls, pull, run } from './.specs/design/mock/src/sites/repo/fixtures'
    export { extras } from './.specs/design/mock/src/sites/repo/fixtures/data/Effect-TS__effect'
    export { getSlash } from './.specs/design/mock/src/sites/repo/frame/slash'
  `, resolveDir: rootPath, loader: "jsx" },
  bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic",
  nodePaths: [join(rootPath, "apps/app/node_modules"), join(rootPath, "node_modules")],
  alias: { "@smthrs/ui": join(rootPath, "packages/smithers/ui/src/index.ts") }, loader: { ".css": "empty" }
})
const scratch = await mkdtemp(join(tmpdir(), "effect-releases-test-"))
const modulePath = join(scratch, "releases.mjs")
await writeFile(modulePath, built.outputFiles[0].text)
const kit = await import(pathToFileURL(modulePath).href)
const { React, act } = kit
const h = React.createElement
const base = "smithers.sh/Effect-TS/effect"
const container = document.createElement("div"); document.body.append(container)
let root, serial = 0, assertions = 0
const check = (value, message) => { assert(value, message); assertions++ }
const route = async suffix => { await act(async () => { window.location.hash = `#/${base}/${suffix}`; window.dispatchEvent(new window.HashChangeEvent("hashchange")) }) }
const render = async (component, flags = {}) => {
  sessionStorage.setItem("site-mock-flags", JSON.stringify({ ...kit.DEFAULTS, as: "in", landing: "open", ...flags }))
  sessionStorage.setItem("repo-ask-open", "false")
  root ??= kit.createRoot(container)
  await act(async () => root.render(h(kit.MockProvider, { key: ++serial }, component)))
}
const click = async selector => {
  const element = container.querySelector(selector)
  check(element, `Control exists: ${selector}`)
  await act(async () => element.click())
}
const text = () => container.textContent
const wait = async ms => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) })
try {
  kit.selectRepo("Effect-TS/effect")
  kit.setRoutes(kit.routes)
  const preview = kit.computePreview()
  check(preview.packages.length === 31, "Preview includes the full fixed group")
  check(preview.direct === 1 && preview.fixed === 30, "Direct changes remain separate from fixed expansion")
  check(preview.packages.every(pkg => !kit.extras.releasePlan.privatePackagesExcluded.includes(pkg.name)), "Private tools never enter the plan")
  check(new Set(preview.packages.map(pkg => pkg.nextVersion)).size === 1, "All fixed group versions move together")
  check(kit.extras.releasePlan.nextVersion === null, "Mock preview never overwrites checkout-derived evidence")
  check(kit.previewIsStale(preview, kit.movedHead), "Main moving invalidates preview")
  check(!kit.previewIsStale(preview, preview.base), "Unchanged head retains preview")
  check(kit.previewIsStale({ ...preview, inputs: "older changesets" }, preview.base), "Changed inputs also invalidate preview")
  for (const entry of kit.routes) {
    check(entry.screens.length > 0, `${entry.pattern} has screens`)
    for (const screen of entry.screens) check(Boolean(kit.resolveRoute(screen.route)), `${screen.id} resolves`)
  }

  await route("releases/plan?screen=test-ready&package=sql-pg")
  await render(h(kit.ReleasePlan))
  check(container.querySelectorAll(".effect-release-changeset").length === 2, "Exactly two pending changesets appear")
  check(text().includes("workflow-reset-retry.md") && text().includes("concrete-schema-brand-identifiers.md"), "Both source files are linked")
  check(text().includes("Release includes all 31 public packages."), "Selected package never reduces fixed impact")
  check(!text().includes("4.0.0-rc.119"), "Ready state does not guess next version")
  check(container.querySelectorAll(".effect-release-package-grid a").length === 38, "All public and private package links exist")
  await click('button[title="/release.preview"]')
  check(text().includes("4.0.0-rc.119") && text().includes("Preview computed"), "Preview computes and displays mocked CLI response")
  check(kit.getSlash("release.prepare") && kit.getSlash("release.preview"), "Ask exposes the same release actions")
  await click('button[title="/release.prepare"]')
  check(container.querySelector(".effect-release-confirm") && !kit.pull(111), "Preparation requires confirmation")
  await act(async () => {
    const form = container.querySelector(".effect-release-confirm form")
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
  })
  check(text().includes("Preparing version PR") && !kit.pull(111), "Duplicate submission remains one in-progress preparation")
  await wait(1300)
  check(text().includes("Version PR is open"), "Only completion shows an opened PR")
  check(kit.pulls.filter(item => item.n === 111).length === 1, "Preparation registers one version PR")
  check(kit.pull(111).files.filter(file => file.path.endsWith("package.json")).length === 31, "Version PR contains every public manifest")
  check(kit.pull(111).files.filter(file => file.status === "deleted").length === 2, "Version PR consumes the two pending changesets")
  check(kit.pull(111).commits[0].length === 40, "Version commit uses a valid SHA shape")
  check(kit.run("run-4803").state === "succeeded", "Preparation links a completed run")
  check(kit.run("run-4803").stages.at(-1).log.includes("No packages published."), "Preparation does not claim publication")
  await act(async () => { kit.getSlash("release.prepare").run({}, { flags: { as: "in", role: "member" }, location: `${base}/releases/plan?package=sql-pg`, closeAsk() {} }) })
  check(window.location.hash.includes("/pull/111?package=sql-pg"), "Repeat preparation opens the existing PR with scope")
  check(kit.pulls.filter(item => item.n === 111).length === 1, "Repeat never creates a duplicate PR")
  await route("releases/plan")
  await render(h(kit.ReleasePlan))
  check(text().includes("Version PR is open"), "Reload reconnects to the opened version PR")
  kit.saveSession(kit.initialSession())
  await route("releases/plan?act=prepare")
  await render(h(kit.ReleasePlan))
  check(!container.querySelector(".effect-release-confirm") && container.querySelector('button[title="/release.preview"]'), "Direct prepare entry first requires a preview")

  await route("releases/plan?screen=test-stale&stale=1")
  await render(h(kit.ReleasePlan))
  check(text().includes("Main moved since this preview") && !container.querySelector('button[title="/release.prepare"]'), "Stale preview cannot prepare")
  await act(async () => { kit.getSlash("release.prepare.confirm").run({}, { closeAsk() {} }) })
  check(!text().includes("Preparing version PR"), "Slash confirmation also blocks stale preview")
  await click('button[title="/release.preview"]')
  check(!text().includes("Main moved since this preview") && container.querySelector('button[title="/release.prepare"]'), "Preview again refreshes the base")

  await route("releases/plan?screen=test-confirm&preview=1&act=prepare")
  await render(h(kit.ReleasePlan), { as: "out" })
  check(text().includes("Sign in to prepare a version PR.") && container.querySelectorAll(".effect-release-changeset").length === 2, "Signed-out gate preserves public content")
  await render(h(kit.ReleasePlan), { role: "reader" })
  check(text().includes("Only members of Effect-TS/effect can prepare a version PR."), "Reader cannot prepare")
  await render(h(kit.ReleasePlan), { landing: "install" })
  check(text().includes("pnpm changeset version") && [...container.querySelectorAll("button")].some(button => button.title === "/copy " + JSON.stringify("pnpm changeset version")), "Held state has a working local command")
  check(!container.querySelector(".effect-release-confirm"), "Held state cannot confirm hosted preparation")
  await render(h(kit.ReleasePlan), { landing: "install", host: "install" })
  check(container.querySelector(".effect-release-confirm"), "Own install is not held by the hosted restriction")

  await route("releases/plan?screen=test-failed&failed=1")
  await render(h(kit.ReleasePlan))
  check(text().includes("Couldn’t prepare the version PR") && text().includes("Main is unchanged."), "Preparation failure gives the actual reason")
  await click('button[title="/release.prepare"]')
  check(container.querySelector(".effect-release-confirm"), "Failed preparation is retryable")
  await render(h(kit.ReleasePlan), { data: "empty" })
  check(text().includes("No pending changesets") && !container.querySelector(".effect-release-changeset"), "Empty plan does not show historical changesets")
  await render(h(kit.ReleasePlan), { net: "slow" })
  check(container.querySelector('[aria-label="Loading"]'), "Slow plan reads show skeletons")
  await render(h(kit.ReleasePlan), { net: "error", data: "empty" })
  check(text().includes("Couldn't load the release plan.") && !text().includes("No pending changesets"), "Plan read failure takes precedence over empty data")
  await click('button[title="/retry"]')
  await wait(750)
  check(text().includes("No pending changesets"), "Retry recovers the plan read")

  await route("releases?package=sql-pg")
  await render(h(kit.PackageReleases))
  check(container.querySelectorAll(".repo-releases-entry").length === 4, "Package releases show all four rc entries")
  check(text().includes("PostgreSQL returns") && !text().includes("Arbitrary.configureGlobal"), "Scoped notes contain the package changelog only")
  check(container.querySelector('a[title="/release.preview"]').textContent.includes("2 pending"), "Release sidebar links the pending version plan")
  await render(h(kit.PackageReleases, { tag: "4.0.0-rc.118" }))
  check(container.querySelectorAll(".repo-releases-entry").length === 1, "Package release detail retains scope")
  await route("releases")
  await render(h(kit.PackageReleases))
  check(text().includes("Arbitrary.configureGlobal"), "Unscoped releases retain shared notes")
  await route("releases?package=ai-codegen")
  await render(h(kit.PackageReleases))
  check(text().includes("Private package") && !container.querySelector(".repo-releases-entry"), "Private packages have no published entries")
  await route("releases?package=sql-pg")
  await render(h(kit.PackageReleases), { as: "out" })
  check(container.querySelectorAll(".repo-releases-entry").length === 4, "Signed-out visitors read public release notes")
  await render(h(kit.PackageReleases), { net: "error", data: "empty" })
  check(text().includes("Couldn't load releases."), "Release read failures never appear empty")
  await click('button[title="/retry"]')
  await wait(750)
  check(text().includes("No releases for @effect/sql-pg"), "Release retry respects empty data after recovery")
  await route("pull/111")
  await render(h(kit.VersionPull))
  check(text().includes("Version packages") && text().includes("#111") && container.querySelector('a[href$="/pull/111/files"]'), "Prepared PR opens the shared PR UI and its file tab")
  kit.selectRepo("maya/tinyhttp")
  await act(async () => { window.location.hash = "#/smithers.sh/maya/tinyhttp/releases"; window.dispatchEvent(new window.HashChangeEvent("hashchange")) })
  await render(kit.routes.find(route => route.pattern.endsWith("/:repo/releases")).render({ params: { owner: "maya", repo: "tinyhttp" } }))
  check(container.querySelector(".repo-releases-page") && !container.querySelector(".effect-release-page"), "Single-package repos delegate to stage 1")
  console.log(`Passed ${assertions} release assertions`)
} finally {
  if (root) await act(async () => root.unmount())
  await window.happyDOM.abort()
  for (const channel of channels) { channel.port1.close(); channel.port2.close() }
  await rm(scratch, { recursive: true, force: true })
}
