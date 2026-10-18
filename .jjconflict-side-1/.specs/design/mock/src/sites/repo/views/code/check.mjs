// Behavioral checks using the workspace's existing happy-dom; no browser launch.
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../../..")
const requireApp = createRequire(join(root, "apps/app/package.json"))
const { Window } = await import(pathToFileURL(requireApp.resolve("happy-dom")))
const window = new Window({ url: "http://localhost/" })
for (const key of ["window", "document", "history", "sessionStorage", "localStorage", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Node", "Element", "Event", "CustomEvent", "KeyboardEvent", "PointerEvent", "MouseEvent", "FormData"]) {
  Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true })
}
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true })
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
globalThis.matchMedia = window.matchMedia.bind(window)
globalThis.MessageChannel = class {
  port1 = { onmessage: null }
  port2 = { postMessage: data => setImmediate(() => this.port1.onmessage?.({ data })) }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let copied = ""
Object.defineProperty(navigator, "clipboard", { value: { writeText: async value => { copied = value } }, configurable: true })
const artifacts = mkdtempSync(join(tmpdir(), "repo-code-check-"))
const compiled = join(artifacts, "check.cjs")
const bundle = await requireApp("esbuild").build({
  stdin: {
    contents: `
      import React, { act } from 'react'
      import { createRoot } from 'react-dom/client'
      import { MockProvider, DEFAULTS } from './.specs/design/mock/src/sites/core/mock'
      import { useLocation, resolveRoute, setRoutes } from './.specs/design/mock/src/sites/core/router'
      import { selectRepo, repo, file, tree, branch, blame, commit } from './.specs/design/mock/src/sites/repo/fixtures'
      import { routes } from './.specs/design/mock/src/sites/repo/views/code/routes'
      import { getSlash } from './.specs/design/mock/src/sites/repo/frame/slash'
      import { readSelection } from './.specs/design/mock/src/sites/repo/views/code/CodeView'
      setRoutes(routes)
      const Page = () => {
        const match = resolveRoute(useLocation())
        return match ? match.route.render(match.context) : <p>Other family route</p>
      }
      export { React, act, createRoot, MockProvider, DEFAULTS, selectRepo, repo, file, tree, branch, blame, commit, routes, readSelection, Page, getSlash }
    `,
    resolveDir: root,
    sourcefile: "code-check.tsx",
    loader: "tsx"
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  jsx: "automatic",
  nodePaths: [join(root, "apps/app/node_modules"), join(root, "node_modules")]
})
writeFileSync(compiled, bundle.outputFiles[0].text)
const m = createRequire(import.meta.url)(compiled)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const qs = selector => document.querySelector(selector)
const all = selector => [...document.querySelectorAll(selector)]
const text = () => document.body.textContent
let app
let assertions = 0
const assert = (value, message) => {
  if (!value) throw new Error(message)
  assertions++
}
const mount = async (suffix, flags = {}, slug = "maya/tinyhttp", width = 1440) => {
  if (app) await m.act(async () => app.unmount())
  window.happyDOM.setViewport({ width, height: 900 })
  sessionStorage.clear()
  sessionStorage.setItem("repo-ask-open", "false")
  sessionStorage.setItem("site-mock-flags", JSON.stringify({ ...m.DEFAULTS, as: "in", role: "member", ...flags }))
  m.selectRepo(slug)
  window.location.hash = `#/smithers.sh/${slug}/${suffix}`
  await wait(1)
  document.body.innerHTML = '<div id="root"></div>'
  app = m.createRoot(document.getElementById("root"))
  await m.act(async () => {
    app.render(m.React.createElement(m.MockProvider, null, m.React.createElement(m.Page)))
    await wait(5)
  })
}
const click = async (element, shiftKey = false) => {
  assert(element, "Click target exists")
  await m.act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, shiftKey }))
    await wait(5)
  })
}

const style = document.createElement("style")
style.textContent = ["apps/app/src/mainview/styles/tokens.css", ".specs/design/mock/src/sites/repo/ui/ui.css", ".specs/design/mock/src/sites/repo/repo.css", ".specs/design/mock/src/sites/repo/frame/frame.css", ".specs/design/mock/src/sites/repo/views/code/code.css"].map(path => readFileSync(join(root, path), "utf8")).join("\n")
document.head.append(style)

try {
  console.log("Checking tree and file navigation")
  await mount("tree/main")
  assert(all('.repo-code-file-row').length > 5, "Root lists fixture files and folders")
  assert(!qs('.repo-code-sidebar'), "Tree root has no file sidebar")
  assert(qs('.repo-code-readme h1'), "Root renders README")
  await mount("tree/main/src/middleware")
  assert(all('.repo-code-file-row').length === 4, "Middleware folder has parent plus three files")
  assert(qs('.repo-code-tree-items a[aria-current="page"]').textContent === "middleware", "File tree expands current directory")
  assert(all('.repo-code-tree-items details[open]').length >= 2, "Ancestors are expanded")
  await click(qs('.repo-code-sidebar-toggle'))
  assert(!qs('#repo-code-file-tree'), "File tree collapses")

  await mount("blob/main/src/router.ts")
  assert(all('.repo-code-source-line').length === 179, "Every router line is rendered")
  assert(qs('[data-line="179"]'), "Last source line is present")
  assert(qs('.repo-code-token-keyword'), "Source has token syntax colors")
  assert(all('.repo-code-symbol').length > 7, "Identifiers and references have symbol controls")
  assert(all('.repo-ui-btn-primary').length === 1, "File has one primary action")
  await click(qs('[data-line="40"] .repo-code-line-number'))
  await click(qs('[data-line="52"] .repo-code-line-number'), true)
  assert(all('.repo-code-source-line[data-selected]').length === 13, "Shift click selects all 13 lines")
  assert(text().includes('Ask about lines 40-52'), "Selected range offers contextual Ask")
  await click(qs('.repo-code-permalink'))
  assert(copied.includes(`/blob/${m.branch('main').head}/src/router.ts#L40-L52`), "Permalink pins commit and line range")
  await click(qs('.repo-code-selection button[title="/lines.ask"]'))
  assert(qs('.repo-frame-ask textarea').value.includes('lines 40-52 of src/router.ts'), "Ask receives selected source context")

  for (const flags of [{}, { as: "out", guest: "ok" }]) {
    await mount("blob/main/src/router.ts?L=40-52", flags)
    await click(qs('.repo-code-selection button[title="/lines.ask"]'))
    const composer = qs('.repo-frame-ask textarea')
    assert(composer?.value.includes('lines 40-52 of src/router.ts'), 'URL-selected range fills Ask for '+(flags.as ?? 'in'))
    assert(document.activeElement === composer, 'URL-selected Ask focuses composer')
    await click(qs('.repo-code-sidebar-toggle'))
    assert(!qs('#repo-code-file-tree'), 'Files toggle remains bound with L=')
    await click(qs('.repo-code-sidebar-toggle'))
    assert(qs('#repo-code-file-tree'), 'Files toggle reopens with L=')
    const toggle = m.getSlash('files.toggle')
    assert(toggle, 'Files slash binding stays registered with L=')
    await m.act(async () => toggle.run({}, { flags: {...m.DEFAULTS, ...flags}, closeAsk() {}, location: window.location.hash.slice(2) }))
    assert(!qs('#repo-code-file-tree'), 'Files slash toggles the current L= view')
  }
  console.log("Checking phone file controls")
  await mount("blob/main/src/router.ts", {}, "maya/tinyhttp", 390)
  const permalink = qs('[aria-label="Copy permalink"]')
  assert(permalink?.closest('.repo-code-path-header'), "Phone permalink stays in path row")
  assert(window.getComputedStyle(permalink.querySelector('span')).display!=='none', "Phone permalink preserves its label")
  assert(window.getComputedStyle(permalink).minHeight==='40px' && permalink.classList.contains('repo-ui-btn-primary'), "Phone permalink is a 40px solid primary")
  assert(window.getComputedStyle(qs('.repo-code-file-toolbar')).flexWrap==='wrap', "Phone file controls can wrap while retaining diagnostics")
  assert(window.getComputedStyle(qs('.repo-code-file-overflow')).display==='block', "Phone exposes file overflow")
  assert(window.getComputedStyle(qs('.repo-code-toolbar-desktop')).display==='none', "Raw stays out of phone toolbar")
  assert(qs('.repo-code-source').style.getPropertyValue('--repo-code-number-width')==='calc(3ch + 12px)', "Line-number width follows longest number plus 12px")
  assert(window.getComputedStyle(qs('.repo-code-line-number')).textAlign==='right', "Line numbers align right")
  await click(qs('.repo-code-file-overflow summary'))
  await click(qs('.repo-code-file-overflow button'))
  assert(qs('.repo-code-raw'), "Phone Raw action opens real raw view")
  await mount("blob/main/src/router.ts", {}, "maya/tinyhttp", 600)
  assert(window.getComputedStyle(qs('.repo-code-permalink > span')).display!=='none', "600px preserves permalink label")
  assert(window.getComputedStyle(qs('.repo-code-file-overflow')).display==='block' && [...document.querySelectorAll('.repo-code-file-overflow button')].some(button => button.textContent==='Copy path'), "Desktop overflow retains Copy path")

  await mount("blob/main/src/router.ts?L=40-52&todo=1")
  console.log("Checking TODO and permission states")
  assert(qs('dialog[open]'), "TODO opens form card")
  assert(qs('#repo-code-todo-title').value === 'lines 40-52 of src/router.ts', "TODO is prefilled from selection")
  await m.act(async () => qs('.repo-code-todo-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })))
  assert(qs('.repo-code-todo-toast a').getAttribute('href').endsWith('/stack'), "Created TODO toast links to Stack")
  assert(!qs('dialog'), "TODO form closes on create")

  await mount("blob/main/src/router.ts?L=1&todo=1", { as: "out" })
  assert(qs('.repo-code-selection a[title="/signin"]') && !qs('button[title="/todo.make"]') && !qs('dialog'), "Signed out hides TODO and offers one Sign in")
  assert(all('.repo-code-source-line').length === 179, "Signed out can still read")
  await mount("blob/main/src/router.ts?L=1&todo=1", { role: "reader" })
  assert(text().includes('Only members of maya/tinyhttp can add TODOs'), "Reader sees permission reason")
  assert(!qs('.repo-code-todo-form'), "Reader cannot create TODO")

  await mount("blob/main/src/router.ts")
  console.log("Checking symbols and diagnostics")
  await click(qs('.repo-code-symbol'))
  assert(qs('.repo-code-symbol-card code').textContent.includes('parseQuery'), "Symbol shows signature")
  assert(qs('.repo-code-symbol-card a').getAttribute('href').includes('src/query.ts?L=7'), "Definition points to exact file and line")
  assert(all('.repo-code-symbol-card a')[1].getAttribute('href').includes('search?q=symbol%3AparseQuery'), "References use search")

  await mount("blob/main/src/middleware/cors.ts")
  assert(qs('.repo-code-diagnostic-count').textContent.includes('1 warning'), "Header counts warning")
  assert(qs('[data-line="25"] .repo-code-gutter-mark'), "Diagnostic has gutter mark")
  assert(qs('[data-line="25"] code').title.includes('Wildcard origin'), "Diagnostic explains warning")
  assert(qs('[data-line="25"] code').tabIndex === 0, "Diagnostic is keyboard reachable")
  await click(qs('.repo-code-diagnostic-count'))
  assert(qs('[data-line="25"][data-selected]'), "Warning count navigates to diagnostic line")

  await mount("blob/main/README.md")
  console.log("Checking Markdown and raw source")
  assert(qs('.repo-code-readme h1').textContent === 'tinyhttp', "Markdown defaults to preview")
  await click(all('.repo-code-segment').find(element => element.title.startsWith('/file.view code')))
  assert(all('.repo-code-source-line').length === 49, "Markdown Code displays every line")
  await click(qs('[title="/file.view raw README.md"]'))
  assert(qs('.repo-code-raw').textContent === m.file('README.md').content, "Raw preserves complete file")
  await click(qs('[title="/file.view code README.md"]'))
  assert(!qs('.repo-code-raw'), "Code exits raw view")

  await mount("blame/main/src/router.ts")
  console.log("Checking blame and agent run links")
  assert(all('.repo-code-source-line').length === 179, "Blame includes every source line exactly once")
  assert(all('.repo-code-blame-range').length === m.blame('src/router.ts').length, "Blame renders every fixture range")
  assert(qs('.repo-code-blame-agent a[href$="runs/run-507"]'), "Agent-written range links writing run")
  assert(qs('.repo-code-blame-agent').getAttribute('aria-label').includes('written by smithers-agent'), "Agent attribution names author, run, and person")
  await click(qs('.repo-code-prior'))
  assert(window.location.hash.includes('/blame/') && window.location.hash.includes('prior=1'), "Prior blame navigates to parent revision")
  assert(text().includes("Historical file contents aren't included"), "Unavailable history is truthful")
  await mount("blame/main/README.md")
  assert(all('.repo-code-source-line').length === 49, "README blame renders source rather than Markdown")

  await mount("blob/main/src/router.ts", { net: "error" })
  console.log("Checking failed, slow, empty, and missing reads")
  assert(text().includes('GitHub sync timed out'), "Read error gives reason")
  assert(!qs('.repo-code-source'), "Read error does not show fixture content as success")
  await click(qs('.repo-frame-state button'))
  assert(qs('.repo-code-source'), "Retry repairs read")
  await mount("blob/main/src/router.ts", { net: "slow" })
  assert(qs('.repo-frame-loading-file'), "Slow read has file skeleton")
  await m.act(async () => wait(1550))
  assert(qs('.repo-code-source'), "Slow read resolves")
  await mount("tree/main/src", { data: "empty" })
  assert(text().includes('This folder is empty.'), "Empty folder is explicit")
  await mount("blob/main/assets/router.png")
  assert(text().includes('No assets/router.png at main'), "Absent image path is not found")
  assert(qs('.repo-frame-state a').getAttribute('href').includes('/tree/main/assets'), "Not found offers parent directory")
  assert(m.readSelection('path?L=18-12', 30).start === 12, "Reverse line range normalizes")
  assert(m.readSelection('path?L=0', 30) === null, "Zero line is rejected")
  assert(m.readSelection('path?L=31', 30) === null, "Out of range line is rejected")
  assert(m.readSelection('path?L=invalid', 30) === null, "Invalid line is rejected")
  for (const slug of ['smithers-canary/smithers', 'effeck/effeck', 'Effect-TS/effect']) {
    console.log(`Checking fixture switching: ${slug}`)
    await mount('tree/main', {}, slug, 390)
    assert(qs('.repo-code-breadcrumbs').textContent.includes(m.repo.name), `Tree uses selected dataset: ${slug}`)
    const entry = m.tree.find(item => item.kind === 'file' && m.file(item.path))
    await mount(`blob/main/${entry.path}`, {}, slug, 390)
    assert(qs('.repo-code-breadcrumbs').textContent.includes(m.repo.name), `File uses selected dataset: ${slug}`)
    assert(!text().includes('maya/tinyhttp'), `No stale repository text: ${slug}`)
  }
  const ids = m.routes.flatMap(route => route.screens.map(screen => screen.id))
  assert(new Set(ids).size === ids.length, "Screen IDs are unique")
  assert(m.routes.every(route => route.screens.length), "Every route has review screens")
  console.log(`PASS ${assertions} code-view behavioral checks`)
} finally {
  if (app) await m.act(async () => app.unmount())
  await window.happyDOM.close()
  rmSync(artifacts, { recursive: true, force: true })
}
