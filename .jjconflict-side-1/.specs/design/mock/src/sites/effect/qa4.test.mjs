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
    export { Packages, PackageHome, PackagesReady } from './.specs/design/mock/src/sites/effect/scope/Packages'
    export { PackageDocs } from './.specs/design/mock/src/sites/effect/docs/configuration'
    export { Matrix } from './.specs/design/mock/src/sites/effect/ci/Matrix'
    export { Commits } from './.specs/design/mock/src/sites/repo/views/history/Commits'
    export { PullPage } from './.specs/design/mock/src/sites/repo/views/pulls/PullPage'
    export { matrixFor, setupRun } from './.specs/design/mock/src/sites/effect/ci/model'
    export { extras } from './.specs/design/mock/src/sites/repo/fixtures/data/Effect-TS__effect'
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


const effect = (suffix, content, flags) => render("Effect-TS/effect", suffix, content, flags)
const primary = () => [...container.querySelectorAll('#repo-content .repo-ui-btn-primary')]
try {
  await check("3: CI totals derive from the active package, including excluded and missing results", async () => {
    for (const [id, slug, missing] of [["run-4802", "sql-pg", false], ["run-4802", "sql-sqlite-bun", false], ["run-4806", "sql-pg", true]]) {
      await effect(`runs/${id}/matrix?package=${slug}${missing ? '&result=missing' : ''}`, h(kit.Matrix, { id }))
      const pkg = kit.repo.config.packages.find(value => value.slug === slug)
      const matrix = kit.matrixFor(id, missing)
      const totals = container.querySelector('.effect-ci-totals')
      for (const state of ['success', 'failure', 'excluded']) {
        const expected = matrix.results.filter(value => value.package === pkg.name && value.state === state).length
        const label = { success: 'passed', failure: 'failed', excluded: 'excluded' }[state]
        assert.ok([...totals.children].some(span => span.textContent === `${expected} ${expected === 1 ? label.replace(/s$/, "") : label}`), `${slug}: ${state}`)
      }
      if (missing) assert.match(totals.textContent, /1 not reported/)
      assert.match(totals.getAttribute('aria-label'), new RegExp(pkg.name))
    }
  })
  await check("6: main directory history contains descendants and preserves inferred package scope", async () => {
    const path = 'packages/sql/pg/src'
    const history = kit.history('main', path)
    assert.ok(history.length > 0)
    assert.ok(history.every(item => item.files.some(file => file.path.startsWith(path + '/'))))
    assert.ok(!history.some(item => item.sha === kit.branches.find(branch => branch.name === 'fix/pg-aborted-commit').head), 'Unmerged fix is not main history')
    await effect(`commits/main/${path}`, h(kit.Commits, { reference: 'main', path }))
    assert.equal(container.querySelector('.effect-scope-picker summary').textContent, '@effect/sql-pg')
    assert.equal(container.querySelector('.repo-history-count').textContent, `${history.length} ${history.length === 1 ? "commit" : "commits"}`)
    assert.equal(container.querySelector('.repo-history-days .repo-history-commit-title').textContent, history[0].title)
  })
  await check("7: all repositories attribute agent proposals and merge decisions to people", async () => {
    for (const slug of ['maya/tinyhttp', 'smithers-canary/smithers', 'effeck/effeck', 'Effect-TS/effect']) {
      kit.selectRepo(slug)
      for (const pull of kit.pulls.filter(item => item.agent)) {
        await render(slug, `pull/${pull.n}`, h(kit.PullPage, { n: pull.n, tab: 'conversation' }))
        const summary = container.querySelector('.repo-pulls-branch-summary').textContent
        assert.ok(!summary.includes(`${pull.author} wants to merge`))
        assert.ok(summary.includes(`for ${pull.agent.for}`))
        if (pull.merged) assert.ok(summary.includes(`${pull.merged.by} merged`))
      }
    }
  })
  await check("PM cuts: package checks, doc generation and affected launch controls are absent", async () => {
    await effect('packages/sql-pg', h(kit.PackageHome, { slug: 'sql-pg' }))
    assert.ok(!container.querySelector('[title^="/package.check"]'))
    await effect('docs/sql-pg', h(kit.PackageDocs, { path: 'sql-pg' }))
    assert.ok(!container.querySelector('[title^="/docs.generate"]'))
    await effect('runs/run-4802/matrix', h(kit.Matrix, { id: 'run-4802' }))
    assert.ok(!container.querySelector('[title^="/run.affected"]'))
  })
  await check("14: PgClient API exposes source-backed signatures and usage", async () => {
    await effect('docs/sql-pg/PgClient?package=sql-pg', h(kit.PackageDocs, { path: 'sql-pg/PgClient' }))
    const article = container.querySelector('.repo-docs-article')
    for (const symbol of ['PgClient service', 'make', 'layer', 'Usage']) assert.ok([...article.querySelectorAll('h2')].some(node => node.textContent.replace(/#$/, "").trim() === symbol))
    assert.match(article.textContent, /Layer\.Layer<PgClient/)
  })
  await check("15: fixture-backed home orders text, prompt, links, completed evidence, Files", async () => {
    for (const flags of [{}, { as: 'out' }]) {
      await effect('?package=sql-pg', frame(h(kit.CodeHomeReady)), flags)
      const main = container.querySelector('.repo-code-home-main')
      const nodes = [...main.children]
      const index = selector => nodes.findIndex(node => node.matches(selector) || node.querySelector(selector))
      assert.ok(index('.repo-code-home-intro') < index('.repo-code-home-block:not(.repo-code-home-intro)'))
      assert.ok(index('.repo-code-home-block:not(.repo-code-home-intro)') < index('.repo-code-home-links'))
      assert.ok(index('.repo-code-home-links') < index('.repo-code-home-evidence'))
      assert.ok(index('.repo-code-home-evidence') < index('.repo-code-home-files-heading'))
      if(flags.as === 'out') {
        assert.ok(!main.querySelector('.repo-code-home-block input'), 'Guest-off home has no live prompt')
        assert.ok([...main.querySelectorAll('button')].some(b=>b.textContent==='Sign in to ask about @effect/sql-pg'))
      } else assert.equal(main.querySelector('input[placeholder="Which checks cover @effect/sql-pg?"]').required, true)
      assert.equal(main.querySelectorAll('.repo-code-home-evidence [data-complete="true"]').length, 5)
      assert.equal(primary().length, flags.as === "out" ? 0 : 1)
    }
  })
  await check("16: package counters equal fixture relations and name issues, pull requests and owners", async () => {
    await effect('packages', h(kit.Packages))
    for (const row of container.querySelectorAll('.effect-package-row')) {
      const pkg = kit.repo.config.packages.find(item => item.name === row.querySelector('.effect-package-name').textContent)
      for (const [kind, subjects, label] of [['issue', kit.issues, 'issues'], ['pull', kit.pulls, 'pull requests']]) {
        const refs = new Set(kit.extras.relations.filter(value => value.kind === kind && (value.packages.includes(pkg.name) || (value.basis === 'shared-input' && !value.packages.length))).map(value => value.ref))
        const expected = subjects.filter(value => refs.has(String(value.n)) && ['open', 'draft'].includes(value.state)).length
        assert.ok([...row.querySelectorAll('.effect-package-counts a')].some(link => link.textContent === `${expected} ${expected === 1 ? label.replace(/s$/, "") : label}`))
      }
      for (const svg of row.querySelectorAll('.effect-package-counts svg')) { assert.equal(svg.getAttribute('width'), '16'); assert.ok(svg.children.length > 0, 'Metadata icons draw a glyph') }
      assert.match(row.querySelector('.effect-package-owner-meta').textContent, /Owners/)
      for (const owner of pkg.owners) assert.ok(row.querySelector('.effect-package-owner-meta').textContent.includes(owner))
    }
  })
  await check("17: setup failure leaves shared checks neutral and not started", async () => {
    await effect(`runs/${kit.setupRun.id}/matrix`, h(kit.Matrix, { id: kit.setupRun.id }))
    const shared = container.querySelector('.effect-ci-shared')
    assert.ok(shared.querySelector('[data-state="blocked"]'))
    assert.ok(!shared.textContent.includes('Pending'))
    assert.match(shared.textContent, /Not started — install failed/)
  })
  await check("18: open version PR is a review state", async () => {
    await effect('releases/plan?screen=qa4-existing&existing=1', h(kit.ReleasePlan))
    assert.ok(container.querySelector('.effect-release-notice-review'))
    assert.equal(container.querySelector('.effect-release-notice-success'), null)
  })
  assert.deepEqual(failures, [], "All stage 4 regressions pass")
} finally {
  await clear()
  await window.happyDOM.abort()
  for (const channel of channels) { channel.port1.close(); channel.port2.close() }
  await rm(scratch, { recursive: true, force: true })
}
