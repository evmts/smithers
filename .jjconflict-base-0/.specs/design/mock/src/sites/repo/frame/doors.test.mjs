// Real frame/Ask interactions in Node's existing happy-dom; no browser launch.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { checkDoors } from "./doors.check.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../..")
const requireApp = createRequire(join(root, "apps/app/package.json"))
const { Window } = await import(requireApp.resolve("happy-dom"))
const window = new Window({ url: "https://mock.test/?still=1" })
for (const key of ["window", "document", "navigator", "sessionStorage", "localStorage", "history", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Element", "Node", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "FormData"]) {
  Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true })
}
globalThis.matchMedia = window.matchMedia.bind(window)
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
globalThis.MessageChannel = class { port1 = { onmessage: null }; port2 = { postMessage: data => setImmediate(() => this.port1.onmessage?.({ data })) } }
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let copied = ""
let clipboardError = false
Object.defineProperty(navigator, "clipboard", { value: { writeText: async value => {
  if (clipboardError) throw new Error("Clipboard permission denied.")
  copied = value
} }, configurable: true })
const artifacts = mkdtempSync(join(tmpdir(), "frame-doors-"))
const output = join(artifacts, "check.cjs")
const bundle = await requireApp("esbuild").build({
  stdin: { contents: `
    import React, { act } from "react"
    import { createRoot } from "react-dom/client"
    import { MockProvider, DEFAULTS } from "./.specs/design/mock/src/sites/core/mock"
    import { useLocation } from "./.specs/design/mock/src/sites/core/router"
    import { selectRepo } from "./.specs/design/mock/src/sites/repo/fixtures"
    import { CodeHome } from "./.specs/design/mock/src/sites/repo/views/code-home/CodeHome"
    import { getSlash, parseSlash, registerSlash } from "./.specs/design/mock/src/sites/repo/frame/slash"
    import { toast } from "./.specs/design/mock/src/sites/repo/ui/Toast"
    const Page = () => {
      const location = useLocation()
      const [owner, name] = location.split("?")[0].split("/").slice(1, 3)
      selectRepo(owner + "/" + name)
      return <CodeHome owner={owner} name={name} />
    }
    export { React, act, createRoot, MockProvider, DEFAULTS, Page, getSlash, parseSlash, registerSlash, toast }
  `, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  nodePaths: [join(root, "apps/app/node_modules"), join(root, "node_modules")]
})
writeFileSync(output, bundle.outputFiles[0].text)
const m = createRequire(import.meta.url)(output)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const qs = selector => document.querySelector(selector)
const all = selector => [...document.querySelectorAll(selector)]
const panelText = () => qs(".repo-frame-conversation")?.textContent ?? ""
let app
let count = 0
const check = (value, message) => { assert.ok(value, message); count++ }
const mount = async (flags = {}, path = "maya/tinyhttp", query = "", open = true) => {
  if (app) await m.act(async () => app.unmount())
  sessionStorage.clear()
  localStorage.clear()
  document.documentElement.dataset.theme = "light"
  sessionStorage.setItem("repo-ask-open", String(open))
  sessionStorage.setItem("site-mock-flags", JSON.stringify({ ...m.DEFAULTS, as: "in", role: "member", ...flags }))
  window.location.hash = `#/smithers.sh/${path}${query}`
  await wait(2)
  document.body.innerHTML = '<div id="root"></div>'
  app = m.createRoot(qs("#root"))
  await m.act(async () => { app.render(m.React.createElement(m.MockProvider, null, m.React.createElement(m.Page))); await wait(5) })
}
const click = async element => {
  check(element, "Action button exists")
  await m.act(async () => { element.click(); await wait(5) })
}
const ask = async line => {
  if (!qs("#repo-ask-panel")) await click(qs(".repo-frame-ask-button"))
  // The registered /ask handler sends through the same composer send() as Enter/Send.
  await m.act(async () => {
    await m.getSlash("ask").run({ question: line }, { flags: JSON.parse(sessionStorage.getItem("site-mock-flags")), location: window.location.hash.slice(2), closeAsk() {} })
    await wait(5)
  })
}
const action = title => all(".repo-frame-conversation button").filter(button => button.title === title && button.textContent !== "Cancel").at(-1)

try {
  // The scanner must reject new names in either tree, ignore comments, and understand grouped names.
  const scanRoot = join(artifacts, "sites")
  for (const site of ["repo", "effect"]) mkdirSync(join(scanRoot, site), { recursive: true })
  writeFileSync(join(scanRoot, "repo", "sample.tsx"), `
    // registerSlash("missing", {})
    registerSlash("known", {})
    ;["open", "close"].map(action => registerSlash("box." + action, {}))
    const view = <><button title="/known input"/><button title={\`/box.open branch\`}/><button title="/missing"/></>
  `)
  writeFileSync(join(scanRoot, "effect", "sample.tsx"), '<button title="/effect.missing"/>')
  assert.deepEqual(checkDoors(scanRoot).missing.map(item => item.name).sort(), ["/effect.missing", "/missing"]); count++

  await mount()
  for (const name of ["files", "repo.clone", "repo.import", "copy", "ask", "cancel", "ask.close", "account.menu", "theme", "signout", "search", "signin", "notice.dismiss"]) check(m.getSlash(name), `Registered /${name}`)
  for (const name of ["theme", "signout", "signin", "account.menu", "ask.close"]) check(m.getSlash(name).userOnly, `/${name} has a user-only reason`)

  await ask("/search")
  check(qs('.repo-frame-command-field input[name="query"]'), "Missing search opens a labeled form")
  await ask("/cancel")
  check(!qs(".repo-frame-command-field"), "Cancel removes the open Ask form")
  await ask("/copy")
  check(qs('.repo-frame-command-field textarea[name="text"]'), "Missing copy text opens a textarea")
  await ask("/cancel")
  await ask("/ask")
  check(qs('.repo-frame-command-field textarea[name="question"]'), "Missing question opens a form")
  await ask("/cancel")
  await ask("/repo.import")
  check(qs('.repo-frame-command-field input[name="repository"]'), "Missing repository opens a form")

  await mount()
  await ask("/theme")
  check(qs('select[name="theme"]'), "Missing theme offers the two themes")
  await ask("/cancel")
  await ask("/theme dark")
  check(document.documentElement.dataset.theme === "light", "Typing theme does not change the browser")
  await click(action("/theme"))
  check(document.documentElement.dataset.theme === "dark" && localStorage.getItem("site-mock-theme") === "dark", "Theme button updates and persists theme")
  await ask("/account.menu")
  check(!qs(".repo-frame-account"), "Typing account menu waits for a click")
  await click(action("/account.menu"))
  check(qs(".repo-frame-account"), "Account button opens the real menu")

  await mount()
  const exact = 'line one\n  line two "quoted"'
  copied = ""
  await ask(`/copy ${JSON.stringify(exact)}`)
  check(copied === "", "Copy waits for a browser gesture")
  await click(action("/copy"))
  check(copied === exact, "Copy preserves newlines, spacing, and quotes")
  clipboardError = true
  await ask('/copy "retry me"')
  await click(action("/copy"))
  check(panelText().includes("Clipboard permission denied."), "Clipboard failure stays visible")
  clipboardError = false
  await click(action("/copy"))
  check(copied === "retry me", "Clipboard retry runs the same handler")
  await m.act(async () => { m.toast("First notice"); m.toast("Second notice") })
  const notice = all(".repo-ui-toast").find(item => item.textContent.includes("First notice"))
  const dismiss = notice.querySelector("button").title
  await ask(dismiss)
  check(!all(".repo-ui-toast").some(item => item.textContent.includes("First notice")), "Slash dismisses the addressed notification")
  check(all(".repo-ui-toast").some(item => item.textContent.includes("Second notice")), "Other notifications remain")

  await mount({ as: "out", guest: "off", role: "reader" })
  await ask('/search "router test"')
  check(window.location.hash.startsWith("#/smithers.sh/signin?return="), "Guest-off Ask opens the sign-in route")
  check(!window.location.hash.includes("/search?q=router%20test"), "Guest-off Ask does not execute search")
  await mount({ as: "out", guest: "ok", role: "reader" })
  await ask('/search "router test"')
  check(window.location.hash.includes("/search?q=router%20test"), "Allowlisted guest search navigates without a write gate")
  await mount({ role: "reader" })
  await ask("/repo.clone")
  check(qs(".repo-code-home-code-menu").open, "Reader clone opens the Code menu")
  await ask("/box.open main")
  check(panelText().includes("Only members"), "Reader cannot start a sandbox")
  check(!window.location.hash.includes("/terminal"), "Denied sandbox does not navigate")
  await mount({}, "maya/tinyhttp", "?dialog=sandbox")
  await ask("/cancel")
  check(!qs(".repo-code-home-dialog"), "Cancel also closes the Code home sandbox dialog")

  await mount({}, "maya/not-imported")
  check(qs(".repo-frame-ask-button"), "Import view exposes Ask")
  await ask("/repo.import maya/not-imported")
  check(qs(".repo-code-home-import button").textContent === "Import requested", "Slash import updates the same button state")
  check(document.body.textContent.includes("Check GitHub App access"), "Import request does not claim completion")
  await ask("How does this repository work?")
  check(panelText().includes("hasn't been imported"), "Unknown repository gets no stale fixture answer")
  await ask("/files")
  check(panelText().includes("Import this repository to continue."), "Unknown repository cannot open another repository's files")
  check(window.location.hash.includes("maya/not-imported"), "Unavailable commands keep the requested repository")

  await mount({ net: "error" }, "maya/tinyhttp", "?ask=sample")
  check(qs('.repo-frame-ask-error button[title="/ask.retry"]'), "Answer error has a Retry")
  check(m.getSlash("ask.retry"), "Answer retry is registered while the error is visible")
  await ask("/ask.retry")
  check(!qs(".repo-frame-ask-error"), "Slash retry starts the same answer read")
  await m.act(async () => { await wait(750) })
  check(!qs(".repo-frame-typing"), "Retried answer settles")
  await mount({ net: "error" })
  check(m.getSlash("retry"), "Page retry is registered")
  await ask("/retry")
  check(qs(".repo-code-home-files"), "Page retry restores the actual file read")

  await mount()
  await ask("/signout")
  check(JSON.parse(sessionStorage.getItem("site-mock-flags")).as === "in", "Signout waits for a person")
  await click(action("/signout"))
  check(JSON.parse(sessionStorage.getItem("site-mock-flags")).as === "out" && window.location.hash.includes("as=out"), "Signout updates flags and route")
  await mount({ as: "out", guest: "ok", role: "reader" })
  await ask("/signin")
  check(!window.location.hash.includes("/signin"), "Allowlisted guest Signin waits for authorization")
  await click(action("/signin"))
  check(window.location.hash.includes("smithers.sh/signin?return="), "Signin keeps the current return route")
  await mount()
  await ask("/ask.close")
  check(qs("#repo-ask-panel"), "Close Ask waits for a click")
  await click(action("/ask.close"))
  check(!qs("#repo-ask-panel"), "Close button closes Ask")
  check(document.activeElement === qs(".repo-frame-ask-button"), "Closing Ask restores focus")
  await mount({}, "maya/tinyhttp/tree/main/src")
  await ask("/files")
  check(window.location.hash.endsWith("/tree/main"), "Files keeps the current reference")
  console.log(`PASS: ${count} frame/Ask behavioral and audit checks.`)
} finally {
  if (app) await m.act(async () => app.unmount())
  await window.happyDOM.close()
  rmSync(artifacts, { recursive: true, force: true })
}
