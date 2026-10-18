/* Browser-free route and interaction checks. Uses the workspace's installed happy-dom and React. */
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../../..")
const requireApp = createRequire(join(root, "apps/app/package.json"))
const { Window } = await import(pathToFileURL(requireApp.resolve("happy-dom")))
const window = new Window({ url: "http://localhost/" })
for (const key of ["window", "document", "sessionStorage", "localStorage", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Node", "Element", "Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "FormData"]) {
  Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true })
}
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true })
globalThis.matchMedia = window.matchMedia.bind(window)
globalThis.MessageChannel = class { port1 = { onmessage: null }; port2 = { postMessage: data => setImmediate(() => this.port1.onmessage?.({ data })) } }
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const artifacts = mkdtempSync(join(tmpdir(), "smithers-evals-check-"))
const bundle = async (contents, name, plugins = []) => {
  const result = await requireApp("esbuild").build({ stdin: { contents, resolveDir: root, sourcefile: name + ".tsx", loader: "tsx" }, bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", plugins,
    nodePaths: [join(root, "apps/app/node_modules"), join(root, "node_modules")], define: { __SITE__: '"smithers-site"' } })
  const target = join(artifacts, name + ".cjs"); writeFileSync(target, result.outputFiles[0].text)
  return createRequire(import.meta.url)(target)
}
const m = await bundle(`
import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {MockProvider, DEFAULTS} from './.specs/design/mock/src/sites/core/mock'
import {selectRepo, repo, runs, to, file} from './.specs/design/mock/src/sites/repo/fixtures'
import {Markdown} from './.specs/design/mock/src/sites/repo/ui/Markdown'
import {getSlash} from './.specs/design/mock/src/sites/repo/frame/slash'
import {Evals} from './.specs/design/mock/src/sites/repo/views/evals/Evals'
import {EvalSuite} from './.specs/design/mock/src/sites/repo/views/evals/Suite'
import {configuredEvals} from './.specs/design/mock/src/sites/repo/views/evals/model'
import {CodeHome} from './.specs/design/mock/src/sites/repo/views/code-home/CodeHome'
import {Issues} from './.specs/design/mock/src/sites/repo/views/issues/Issues'
import {Docs} from './.specs/design/mock/src/sites/repo/views/docs/Docs'
import {Stack} from './.specs/design/mock/src/sites/repo/views/pulls/Stack'
export {React,act,createRoot,MockProvider,DEFAULTS,selectRepo,repo,runs,to,file,Markdown,getSlash,Evals,EvalSuite,configuredEvals,CodeHome,Issues,Docs,Stack}
`, "interactions")
let app
let checks = 0
const check = (ok, message) => { checks++; assert.ok(ok, message) }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const all = selector => [...document.querySelectorAll(selector)]
const text = () => document.body.textContent
const button = label => all("button").find(element => element.textContent.trim() === label)
const click = async element => { check(element, "Click target exists"); await m.act(async () => { element.click(); await wait(5) }) }
const base = "smithers.sh/smithers-canary/smithers"
const mount = async (Component, path, flags = {}, props = {}, slug = 'smithers-canary/smithers') => {
  if (app) await m.act(async () => app.unmount())
  sessionStorage.clear(); sessionStorage.setItem("repo-ask-open", "false")
  sessionStorage.setItem("site-mock-flags", JSON.stringify({ ...m.DEFAULTS, as: "in", role: "member", landing: "open", ...flags }))
  window.location.hash = `#/smithers.sh/${slug}/${path}`; await wait(2)
  m.selectRepo(slug)
  document.body.innerHTML = '<div id="root"></div>'
  app = m.createRoot(document.getElementById("root"))
  await m.act(async () => { app.render(m.React.createElement(m.MockProvider, null, m.React.createElement(Component, props))); await wait(5) })
}
try {
  await mount(m.Evals, "evals")
  check(all('.repo-evals-list-row').length === 5, "All five suites render")
  check(all('.repo-evals-sparkline').length === 5 && !document.querySelector('.repo-evals-sparkline svg'), "Recorded suites show snapshots without invented time series")
  check(all('.repo-ui-tabs a').find(a => a.textContent.startsWith("Evals")).textContent === "Evals", "Declared Evals has no count")
  const tabs = all('.repo-ui-tabs a').map(a => a.textContent)
  check(tabs.indexOf("Evals") > tabs.indexOf("Wiki") && tabs.indexOf("Evals") < tabs.indexOf("Settings"), "Declared Evals follows Wiki and precedes Settings")
  check(m.getSlash("eval.run").fields[0].options.length === 5, "Ask collects only a missing suite")
  const importedRow = all('.repo-evals-list-row').find(row => row.textContent.includes('SWE-bench Verified'))
  check(importedRow.textContent.includes('Imported snapshot · not in this repository'), 'SWE-bench list discloses its imported origin')
  check(!importedRow.querySelector('a[href*="/blob/"]'), 'Imported snapshot has no repository-file link in the list')
  await click(document.querySelector('.repo-frame-ask-button'))
  check(text().includes('Asking about evals in smithers-canary/smithers'), 'List Ask context names evals and the repository')
  for (const [flags, expected] of [[{ as: "out" }, "sign in to run"], [{ role: "reader" }, "members can run"], [{ data: "empty" }, "No eval suites yet."], [{ net: "slow" }, "Loading"], [{ net: "error" }, "The eval score store didn't respond."]]) {
    await mount(m.Evals, "evals", flags)
    check(text().includes(expected), `List state: ${JSON.stringify(flags)}`)
  }
  await click(button("Retry")); await m.act(async () => wait(750))
  check(all('.repo-evals-list-row').length === 5, "Retry recovers the actual list")
  for (const [flags, expected] of [[{ as: "out" }, "Sign in to run this eval."], [{ role: "reader" }, "Only members"], [{ landing: "install" }, "smthrs eval run packages/smithers/agent/regression/agent.eval.ts"], [{ hosted: "paused" }, "Hosted machines are paused."]]) {
    await mount(m.EvalSuite, "evals/agent?act=run", flags, { id: "agent" })
    check(text().includes(expected), `Launch state: ${JSON.stringify(flags)}`)
    check(!button("Confirm run"), "Blocked launch cannot confirm")
  }
  await mount(m.EvalSuite, "evals/agent", {}, { id: "agent" })
  await click(document.querySelector('.repo-frame-ask-button'))
  check(text().includes(`Asking about the ${m.configuredEvals().find(suite => suite.id === 'agent').title} eval`), 'Suite Ask context names the eval')
  const before = m.runs.length
  await click(button("Run this eval"))
  check(button("Confirm run") && m.runs.length === before, "Confirmation precedes the run")
  check(all('.repo-ui-btn-primary').length === 1, "One primary action in confirmation")
  await click(button("Confirm run"))
  check(m.runs.length === before + 1 && m.runs[0].state === "queued", "Confirmation creates an honest queued run")
  check(!button("Confirm run") && text().includes("View run"), "Queued run is linked without claiming completion")
  await m.act(async () => m.getSlash("eval.confirm").run({}, { flags: m.DEFAULTS, location: base + "/evals/agent", closeAsk() {} }))
  check(m.runs.length === before + 1, "Repeated launch deduplicates the pending run")
  await mount(m.EvalSuite, "evals/review-seeded-bugs", {}, { id: "review-seeded-bugs" })
  const toggle = document.getElementById('repo-evals-case-missing-await-flush')
  await click(toggle)
  check(toggle.getAttribute("aria-expanded") === "true", "Case details expand by keyboard-reachable control")
  check(!document.getElementById('repo-evals-detail-missing-await-flush').hidden, "Expanded case exposes detail")
  await m.act(async () => m.getSlash("eval.case").run({ suite: "review-seeded-bugs", case: "missing-await-flush" }, { flags: m.DEFAULTS, location: "", closeAsk() {} }))
  check(toggle.getAttribute("aria-expanded") === "false", "Slash case uses the same expansion control")
  await mount(m.EvalSuite, "evals/swebench?act=run", {}, { id: "swebench" })
  check(text().includes("Recorded fixture wave") && !button("Confirm run"), "Recorded SWE-bench fixture cannot masquerade as an executable suite")
  check(document.querySelector('.repo-evals-suite-subtitle').textContent.includes('Imported snapshot · not in this repository'), 'SWE-bench detail discloses its imported origin')
  check(!all('.repo-evals-suite a').some(link => /\/blob\/.*scorecard/.test(link.getAttribute('href'))), 'Imported snapshot has no repository-file evidence link')
  check(!m.file('evals/swebench/fixtures/scorecard.json') && !m.file('evals/swebench/fixtures/scorecard.md'), 'Imported scorecards are absent from repository files')
  await mount(m.EvalSuite, "evals/authoring", {}, { id: "authoring" })
  check(text().includes("Inconclusive") && text().includes("No validator execution receipt"), "Authoring snapshot is inconclusive")
  for (const [flags, expected] of [[{ data: "empty" }, "No eval suites yet."], [{ net: "slow" }, "Loading"], [{ net: "error" }, "Couldn't load this eval."]]) {
    await mount(m.EvalSuite, "evals/agent", flags, { id: "agent" }); check(text().includes(expected), "Suite read state")
  }
  await mount(m.EvalSuite, "evals/not-here", {}, { id: "not-here" }); check(text().includes("Eval suite not found."), "Missing suite is distinct from empty")
  await mount(m.Evals, "evals")
  await click(document.querySelector('.repo-frame-ask-button'))
  const composer = document.querySelector('.repo-frame-composer textarea')
  await m.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(composer, '/eval.run')
    composer.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  await m.act(async () => {
    composer.closest('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    await wait(750)
  })
  check(document.querySelector('.repo-frame-confirm select'), 'Ask accepts /eval.run and asks for the missing suite')
  await mount(m.CodeHome, "", {}, { owner: 'smithers-canary', name: 'smithers' })
  check(text().includes('Ask about Smithers') && all('.repo-code-home-app').length === 4, 'Real prompt and four home app cards render')
  check(all('.repo-code-home-evidence').length === 4, 'Home renders four fixed-issue evidence strips')
  const main = document.querySelector('.repo-code-home-main')
  const precedes = (a, b) => Boolean(a.compareDocumentPosition(b) & 4)
  const homeOrder = ['.repo-code-home-intro', 'form.repo-code-home-block', '.repo-code-home-links', '.repo-code-home-evidence', '.repo-code-home-apps', '.repo-code-home-files', '.repo-code-home-readme'].map(selector => main.querySelector(selector))
  check(homeOrder.every(Boolean) && homeOrder.every((element, i) => !i || precedes(homeOrder[i - 1], element)), 'Prompt, apps, links and evidence appear between the toolbar and files')
  check(!button('Ask about this repo'), 'Prompt replaces the README Ask action')
  const readme = document.querySelector('.repo-code-home-readme')
  const ascii = m.file('README.md').content.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)[1].replace(/^\n/, '')
  check(readme.querySelector('pre code').textContent === ascii, 'ASCII wordmark preserves every line and space')
  check(readme.querySelector('pre').style.textAlign === 'center' && readme.querySelector('p strong').closest('p').style.textAlign === 'center', 'Wordmark and introductory paragraph are centered')
  check(!readme.textContent.includes('<!--') && !readme.textContent.includes('<pre') && !readme.textContent.includes('Generated from'), 'README HTML and generated comment never appear as prose')
  for (const label of ['Install Smithers', 'Docs', 'Report a bug', 'Fixed by agents']) check(all('a').some(a => a.textContent.trim() === label), `Home link: ${label}`)
  await mount(m.Issues, "issues?q=is:fixed-by-agents")
  check(all('.repo-issues-list-row').length === 4, 'Issues Fixed by agents view lists the same four receipts')
  await mount(m.Stack, "stack", {}, { filter: 'all' })
  check(document.querySelector('.repo-ui-page-header h1').textContent === 'Landing queue', 'Configured Stack title appears on the page')
  check(all('.repo-pulls-family-nav a').some(link => link.textContent.startsWith('Landing queue')), 'Pull request switch uses the configured Stack title')
  check(text().includes('You land; the queue runs your submitted tests and gates first.'), 'Landing queue explains human approval and ordered landing')
  check(!button('Add TODO'), 'Queue-only repos hide Add TODO')
  check(all('.repo-pulls-stack-title h2').every(heading => !/^(Landing:|Queued for the lander:|Refused:|Landed:)/.test(heading.textContent)), 'Queue titles omit redundant state prefixes')
  for (const label of ['Landing', 'Refused', 'Landed']) check(all('.repo-pulls-stack-state').some(state => state.textContent.startsWith(label)), `Queue state: ${label}`)
  await click(document.querySelector('.repo-frame-ask-button'))
  check(text().includes('Asking about the Landing queue in smithers-canary/smithers'), 'Queue Ask context uses the configured title')
  await mount(m.Stack, 'stack', { data: 'empty' }, { filter: 'all' })
  check(text().includes('Nothing in the Landing queue.') && !text().includes('Make a TODO') && !button('Add TODO'), 'Empty queue uses its configured name without TODO instructions')
  await mount(m.CodeHome, '', {}, { owner: 'maya', name: 'tinyhttp' }, 'maya/tinyhttp')
  check(document.querySelector('.repo-code-home-block input') && button('Send') && !document.querySelector('.repo-code-home-apps'), 'Default repository has one page composer when Ask is closed')
  await mount(m.Stack, 'stack', {}, { filter: 'all' }, 'maya/tinyhttp')
  check(button('Add TODO') && document.querySelector('.repo-ui-page-header h1').textContent === 'Stack', 'Default Stack retains its name and Add TODO')
  await mount(m.Markdown, '', {}, { source: '---\ntitle: Hidden metadata\ndescription: Hidden details\n---\n# Visible body' })
  check(text().includes('Visible body') && !text().includes('Hidden metadata') && !text().includes('Hidden details'), 'Shared README/wiki Markdown hides YAML metadata')
  await mount(m.Markdown, '', {}, { source: '<!-- hidden\ncomment --><p align="center" onclick="unsafe()">A <strong>safe &amp; sound</strong> <em>paragraph</em><br><code>&lt;T&gt;</code> <a href="./src/index.ts" onclick="unsafe()">source</a> <a href="https://example.com/?a=1&amp;b=2">external</a> <a href="java&#x0a;script:unsafe()">blocked</a></p><picture><source srcset="https://example.com/image.webp"><img src="missing.png" alt="Fallback image" onerror="unsafe()"></picture><widget>Keep <em>children</em></widget>' })
  check(document.querySelector('p').style.textAlign === 'center' && document.querySelector('strong').textContent === 'safe & sound', 'Safe HTML renders alignment and decoded text')
  check(document.querySelector('em').textContent === 'paragraph' && document.querySelector('br') && document.querySelector('code').textContent === '<T>', 'HTML emphasis, breaks and inline code render')
  check(all('a').find(a => a.textContent === 'source').getAttribute('href').endsWith('/blob/main/src/index.ts'), 'HTML links resolve through repo routes')
  const external = all('a').find(a => a.textContent === 'external')
  check(external.target === '_blank' && external.rel === 'noopener noreferrer' && external.getAttribute('href') === 'https://example.com/?a=1&b=2', 'External HTML links are safe and entities decode')
  check(!all('a').some(a => a.textContent === 'blocked') && !document.querySelector('[onclick], [onerror], script, source, picture, widget, img'), 'Unsupported HTML, unsafe URLs and missing images cannot inject active markup')
  check(text().includes('Fallback image') && text().includes('Keep children') && !text().includes('hidden'), 'Missing images keep alt text; unknown tags keep text; comments disappear')
  await mount(m.Markdown, '', {}, { source: '<p>Visible<!-- fake </p> --> text</p>' })
  check(document.querySelector('p').textContent === 'Visible text' && !text().includes('fake'), 'Tags inside comments cannot end an HTML block')
  await mount(m.Markdown, '', {}, { source: '```html\n<!-- example -->\n<pre>kept as code</pre>\n```\n\n`<strong>literal</strong>`\n\n## Heading\n\n- **Bold** [docs](docs/installation.md)' })
  assert.equal(document.querySelector('pre code').textContent.trimEnd(), '<!-- example -->\n<pre>kept as code</pre>')
  check(all('code').some(code => code.textContent === '<strong>literal</strong>'), 'Fenced and inline code keep literal HTML and comments')
  check(document.querySelector('h2').textContent === 'Heading' && document.querySelector('li strong').textContent === 'Bold', 'Existing Markdown blocks and inline formatting remain intact')
  const blob = m.file('README.md'), original = { ...blob }
  try {
    Object.assign(blob, { path: 'wordmark.svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>' })
    await mount(m.Markdown, '', {}, { source: '<img src="./wordmark.svg" alt="Dataset wordmark">' })
    check(document.querySelector('img')?.getAttribute('src').startsWith('data:image/svg+xml;') && document.querySelector('img').alt === 'Dataset wordmark', 'Images backed by the dataset render without an external request')
  } finally { Object.assign(blob, original) }
  await mount(m.Docs, "docs/installation", {}, { path: 'installation' })
  check(text().includes('Installation'), 'Repo Docs shows the real installation page')
  check(all('a').some(a => a.getAttribute('href')?.includes('packages/smithers/docs/installation.md')), 'Docs source points into the declared real docs root')
  await m.act(async () => app.unmount()); app = undefined

  // Evaluate the real entry with only its root mount suppressed; no browser is launched.
  const entryPath = join(root, '.specs/design/mock/src/sites/smithers-site-main.tsx')
  const entry = readFileSync(entryPath, 'utf8').replaceAll('from "./', 'from "./.specs/design/mock/src/sites/')
  const site = await bundle(entry + '\nexport { allRoutes, resolveRoute }', 'site-registry', [{ name: 'suppress-root', setup(build) {
    build.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: 'root', namespace: 'check' }))
    build.onLoad({ filter: /.*/, namespace: 'check' }, () => ({ contents: 'export const createRoot = () => ({render(){}})' }))
  } }])
  const screens = window.__SITE__.screens
  const routes = site.allRoutes()
  check(screens.every(screen => !/tinyhttp/.test(decodeURIComponent(screen.route))), 'No tinyhttp screen remains in this site')
  check(screens.every(screen => screen.site === 'smithers-site'), 'Every screen is retagged for this site')
  check(new Set(screens.map(screen => screen.id)).size === screens.length, 'Screen IDs are unique')
  for (const route of routes) {
    check(route.screens.length > 0, `${route.pattern} has screens`)
    for (const screen of route.screens) check(site.resolveRoute(screen.route)?.route.pattern === route.pattern, `${screen.id} resolves its registered pattern`)
  }
  const data = name => JSON.parse(readFileSync(join(root, '.specs/design/mock/src/sites/repo/fixtures/data/smithers-canary__smithers', name + '.json'), 'utf8'))
  for (const screen of screens.filter(screen => screen.id.startsWith('smithers-site-'))) {
    const path = screen.route.split('?')[0].replace(base + '/', '')
    if (path.startsWith('blob/') || path.startsWith('blame/')) check(data('files').some(file => file.path === path.split('/').slice(2).join('/')), 'Curated file exists')
    if (path.startsWith('issues/') && path !== 'issues/new') check(data('issues').some(issue => issue.n === Number(path.split('/')[1])), 'Curated issue exists')
    if (path.startsWith('pull/')) check(data('pulls').some(pull => pull.n === Number(path.split('/')[1])), 'Curated pull exists')
    if (path.startsWith('runs/')) check(data('runs').some(run => run.id === path.split('/')[1]), 'Curated run exists')
  }
  console.log(`PASS ${checks} checks · ${routes.length} route patterns · ${screens.length} Smithers site screens`)
  console.log('Curated IDs: ' + screens.filter(screen => screen.id.startsWith('smithers-site-')).map(screen => screen.id).join(', '))
} finally {
  if (app) await m.act(async () => app.unmount())
  await window.happyDOM.abort()
  window.close()
  rmSync(artifacts, { recursive: true, force: true })
}
