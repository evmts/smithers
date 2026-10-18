import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"

// Browser-free interaction checks; uses only the workspace's installed dependencies.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../../..")
const requireApp = createRequire(join(root, "apps/app/package.json"))
const artifacts = mkdtempSync(join(tmpdir(), "flows-wiki-check-"))
const { Window } = await import(pathToFileURL(requireApp.resolve("happy-dom")))
const window = new Window({ url: "http://localhost/" })
for (const key of ["window", "document", "sessionStorage", "localStorage", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Node", "Element", "Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "FormData"]) {
  Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true })
}
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true })
globalThis.matchMedia = window.matchMedia.bind(window)
globalThis.MessageChannel = class {
  port1 = { onmessage: null }
  port2 = { postMessage: data => setImmediate(() => this.port1.onmessage?.({ data })) }
}
const compiled = join(artifacts, "check.cjs")
const entry = `
import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {MockProvider, DEFAULTS} from './.specs/design/mock/src/sites/core/mock'
import {selectRepo, repo, flows, wiki, agents} from './.specs/design/mock/src/sites/repo/fixtures'
import {getSlash} from './.specs/design/mock/src/sites/repo/frame/slash'
import {Flows} from './.specs/design/mock/src/sites/repo/views/flows/Flows'
import {Flow} from './.specs/design/mock/src/sites/repo/views/flows/Flow'
import {Agents} from './.specs/design/mock/src/sites/repo/views/flows/Agents'
import {Wiki, applyProposal} from './.specs/design/mock/src/sites/repo/views/wiki/Wiki'
import {routes as flowRoutes} from './.specs/design/mock/src/sites/repo/views/flows/routes'
import {routes as wikiRoutes} from './.specs/design/mock/src/sites/repo/views/wiki/routes'
export {React,act,createRoot,MockProvider,DEFAULTS,selectRepo,repo,flows,wiki,agents,getSlash,Flows,Flow,Agents,Wiki,applyProposal,flowRoutes,wikiRoutes}
`
const bundle = await requireApp("esbuild").build({
  stdin: { contents: entry, resolveDir: root, sourcefile: "flows-wiki-check.tsx", loader: "tsx" },
  bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
  nodePaths: [join(root, "apps/app/node_modules"), join(root, "node_modules")]
})
writeFileSync(compiled, bundle.outputFiles[0].text)
const m = createRequire(import.meta.url)(compiled)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let app
let count = 0
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw new Error(message); count++ }
const qs = selector => document.querySelector(selector)
const all = selector => [...document.querySelectorAll(selector)]
const text = () => document.body.textContent
const button = label => all("button").find(button => button.textContent.trim() === label)
const click = async element => {
  assert(element, "Click target exists")
  await m.act(async () => element.click())
}
const submit = async form => m.act(async () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })))
const change = async (element, value) => m.act(async () => {
  const prototype = element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : element.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value)
  element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }))
})
const mount = async (Component, props = {}, path = "flows", flags = {}, slug = "maya/tinyhttp") => {
  if (app) await m.act(async () => app.unmount())
  sessionStorage.clear()
  sessionStorage.setItem("repo-ask-open", "false")
  sessionStorage.setItem("site-mock-flags", JSON.stringify({ ...m.DEFAULTS, as: "in", landing: "open", role: "member", ...flags }))
  window.location.hash = `#/smithers.sh/${slug}/${path}`
  await wait(1)
  m.selectRepo(slug)
  document.body.innerHTML = '<div id="root"></div>'
  app = m.createRoot(qs("#root"))
  await m.act(async () => { app.render(m.React.createElement(m.MockProvider, null, m.React.createElement(Component, props))); await wait(5) })
}
const slash = async (name, values = {}) => {
  const command = m.getSlash(name)
  assert(command, `${name} is registered`)
  await m.act(async () => command.run(values, { flags: { ...m.DEFAULTS, as: "in", role: "member" }, location: window.location.hash, closeAsk() {} }))
}
try {
  await mount(m.Flows)
  assert(all(".repo-flows-list-row").length === m.flows.length, "All flows render")
  await click(button("Run a flow"))
  assert(qs(".repo-flows-run-card select"), "Flow picker opens")
  assert(all(".repo-ui-btn-primary").length === 1, "Run form has one primary action")
  await mount(m.Flow, { name: "implement-issue" }, "flows/implement-issue?run=1")
  assert(qs('.repo-flows-form input[type="number"]').value, "Issue input is prefilled")
  await submit(qs(".repo-flows-form form"))
  assert(button("Start run"), "Inputs lead to confirmation")
  assert(!sessionStorage.getItem("repo-runs:maya/tinyhttp"), "Confirmation precedes run creation")
  await submit(qs(".repo-flows-form form"))
  const local = JSON.parse(sessionStorage.getItem("repo-runs:maya/tinyhttp"))
  const created = Object.values(local.runs)[0]
  assert(created.state === "running" && created.flow === "implement-issue", "New running record is saved")
  assert(window.location.hash.endsWith(`/runs/${created.id}`), "Start navigates to the new run")
  await mount(m.Flow, { name: "implement-issue" }, "flows/implement-issue?run=1", { landing: "install" })
  assert(text().includes("Hosted runs that change code are held."), "Code changes are held")
  assert(!button("Continue") && !button("Start run"), "Held run cannot launch")
  await mount(m.Flow, { name: "review-change" }, "flows/review-change?run=1", { landing: "install" })
  assert(button("Continue"), "Read-only review remains available")
  await mount(m.Flow, { name: "implement-issue" }, "flows/implement-issue?run=1", { role: "reader" })
  assert(text().includes("Only members can run flows.") && !qs(".repo-flows-run-card"), "Reader sees permission explanation without a run form")
  assert(button("Request access") && !button("Run this flow"), "Reader gets access recovery instead of a member Run button")
  await mount(m.Flow, { name: "implement-issue" }, "flows/implement-issue?run=1", { as: "out" })
  assert(!qs(".repo-flows-run-card") && all("a").some(link => link.textContent.includes("Sign in")), "Signed-out primary offers Sign in without a write form")
  await mount(m.Flow, { name: "implement-issue" }, "flows/implement-issue")
  assert(all(".repo-flows-node").length === 5 && all(".repo-flows-edges g").length === 4, "Graph renders all nodes and edges")
  await click(qs('[role="switch"]'))
  assert(qs('[role="switch"]').getAttribute("aria-checked") === "false", "Trigger button updates state")
  await slash("triggers.set", { trigger: "1", enabled: "on" })
  assert(qs('[role="switch"]').getAttribute("aria-checked") === "true", "Slash trigger shares state")
  await mount(m.Flow, { name: "implement-issue" }, "flows/implement-issue?tab=source")
  assert(qs(".repo-ui-code-line code").textContent.length > 0, "Source reads fixture code")
  await mount(m.Flow, { name: "implement-issue" }, "flows/implement-issue?tab=runs")
  assert(all(".repo-flows-run-row").length > 0, "Flow run links render")
  await mount(m.Agents, {}, "agents", { model: "none" })
  assert(text().includes("Codex isn't connected"), "Disconnected subscription warns")
  const agentSelect = qs(".repo-flows-agent-card select")
  const nextModel = [...agentSelect.options].find(option => option.value !== agentSelect.value).value
  await change(agentSelect, nextModel)
  assert(agentSelect.value === nextModel && text().includes("now uses"), "Model edit updates state and toast")
  await mount(m.Agents, {}, "agents", { role: "reader" })
  assert(!qs(".repo-flows-agent-card select") && all(".repo-flows-agent-facts dd").some(item => item.textContent.includes(m.agents[0].model)), "Readers see read-only models")
  await mount(m.Wiki, { slug: "middleware-order" }, "wiki/middleware-order")
  assert(qs(".repo-wiki-proposal") && text().includes("high confidence"), "Wiki distinguishes inference and pending proposal")
  await click(button("Accept"))
  assert(button("Confirm accept") && qs(".repo-wiki-proposal"), "Proposal requires confirmation")
  await click(button("Confirm accept"))
  assert(!qs(".repo-wiki-proposal") && text().includes("revision 6"), "Acceptance updates revision and removes proposal")
  assert(qs(".repo-wiki-body").textContent.includes("Credentials require an explicit origin"), "Accepted diff changes page content")
  await mount(m.Wiki, { slug: "middleware-order" }, "wiki/middleware-order")
  await click(button("Dismiss"))
  assert(!qs(".repo-wiki-proposal") && text().includes("revision 5"), "Dismiss leaves revision unchanged")
  await mount(m.Wiki, { slug: "architecture" }, "wiki/architecture?edit=1")
  const draft = "# Architecture\n\nA reviewed request boundary."
  await change(qs(".repo-wiki-editor textarea"), draft)
  await click(button("Preview"))
  assert(qs(".repo-wiki-preview").textContent.includes("A reviewed request boundary."), "Preview reflects draft")
  await submit(qs(".repo-wiki-editor"))
  assert(qs(".repo-wiki-body").textContent.includes("A reviewed request boundary."), "Save updates body")
  assert(text().includes("revision 13") && text().includes("Written by a person"), "Save records human provenance and revision")
  await click(button("History"))
  assert(qs(".repo-wiki-history").textContent.includes("Revision 13"), "History includes local revision")
  await mount(m.Wiki, { slug: "middleware-order" }, "wiki/middleware-order", { role: "reader" })
  assert(!button("Edit") && !button("Accept"), "Reader has no member write controls")
  await mount(m.Wiki, { slug: "missing" }, "wiki/missing")
  assert(text().includes("Wiki page not found."), "Unknown wiki page is truthful")
  await mount(m.Wiki, {}, "wiki", { data: "empty" })
  assert(text().includes("No wiki pages yet."), "Empty wiki is distinct")
  await click(button("New page"))
  assert(qs(".repo-wiki-editor textarea"), "Empty wiki starts a page editor")
  await mount(m.Flows, {}, "flows", { net: "error" })
  assert(text().includes("didn't respond") && button("Retry"), "Error includes reason and retry")
  await mount(m.Flows, {}, "flows", { net: "slow" })
  assert(qs(".repo-frame-loading"), "Slow read starts with loading")
  for (const slug of ["smithers-canary/smithers", "effeck/effeck", "Effect-TS/effect"]) {
    await mount(m.Flows, {}, "flows", {}, slug)
    assert(all(".repo-flows-list-row").length === m.flows.length, `Flows use current dataset: ${slug}`)
    assert(!all(".repo-flows-list-row a").some(link => link.href.includes("maya/tinyhttp")), `No hardcoded repo links: ${slug}`)
    await mount(m.Wiki, {}, "wiki", {}, slug)
    assert(qs(".repo-wiki-main h1"), `Wiki falls back to first page: ${slug}`)
  }
  const screens = [...m.flowRoutes, ...m.wikiRoutes].flatMap(route => route.screens)
  assert(new Set(screens.map(screen => screen.id)).size === screens.length, "Screen IDs are unique")
  assert([...m.flowRoutes, ...m.wikiRoutes].every(route => route.screens.length), "Every route has review screens")
  console.log(`PASS ${count} flows, agents, and wiki assertions`)
} finally {
  if (app) await m.act(async () => app.unmount())
  await window.happyDOM.close()
  rmSync(artifacts, { recursive: true, force: true })
}
