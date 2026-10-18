/* Crawl regressions against the actual --no-prerender bundles; no Chromium or layout claims. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const requireApp = createRequire(join(mockRoot, "../../../apps/app/package.json"))
const { Window } = await import(requireApp.resolve("happy-dom"))
const baselineDir = process.argv.find(arg => arg.startsWith("--baseline-dir="))?.split("=")[1]
const windows = []
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const flags = "as=in&role=member&net=ok&data=full&landing=open&hosted=up&host=hosted&model=connected"
const open = async (window, route) => {
  window.location.hash = `#/${route}`
  await wait(80)
}
const load = async site => {
  const html = readFileSync(join(mockRoot, `dist-codex/${site}/index.html`), "utf8")
  const window = new Window({ url: "http://localhost/?still=1" })
  windows.push(window)
  window.document.body.innerHTML = '<div id="root"></div>'
  // The build emits an import-free module; isolate its bindings from window's native `screen` property.
  window.eval(`(function(){${html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]}\n})()`)
  await wait(80)
  return window
}
const content = window => window.document.querySelector("#repo-content")?.innerHTML
const named = link => (link.getAttribute("aria-label") || link.textContent || link.getAttribute("title") || "").trim()

try {
  const sites = {}
  for (const site of ["default", "smithers-site", "effeck-site", "effect"]) {
    const window = sites[site] = await load(site)
    const meta = window.__SITE__
    assert.equal(meta.site, site)
    assert.equal(new Set(meta.screens.map(screen => screen.id)).size, meta.screens.length, `${site}: unique screen IDs`)
    for (const screen of meta.screens) assert.ok(meta.resolve(screen.route), `${site}/${screen.id}: resolves`)
    for (const route of meta.routes) assert.ok(meta.screens.some(screen => meta.resolve(screen.route) === route), `${site}: screen for ${route}`)
    if (baselineDir) {
      const before = JSON.parse(readFileSync(join(baselineDir, `qa1b-${site}-before.json`), "utf8"))
      for (const screen of before.screens.filter(screen => !/^(effect-ownership-|effect-ci-affected-|effect-docs-generation-|effect-package-home-(signin|denied|held|check|model-none)$)/.test(screen.id))) assert.ok(meta.screens.some(value => value.id === screen.id), `${site}: retained ${screen.id}`)
      for (const route of before.routes.filter(route => !route.endsWith("/settings/ownership"))) assert.ok(meta.routes.includes(route), `${site}: retained ${route}`)
    }
    let subjects = 0
    for (const screen of meta.screens) {
      const query = new URLSearchParams(screen.route.split('?')[1])
      if ((query.has('data') && query.get('data') !== 'full') || (query.has('net') && query.get('net') !== 'ok')) continue
      // Deliberate missing-subject scenarios keep their honest recovery screen.
      const deliberateMissing = /missing|not.found|unknown|absent|no.such|not.imported/i.test(`${screen.id} ${screen.label}`)
      if (deliberateMissing) continue
      await open(window, screen.route)
      const main = window.document.querySelector('#repo-content')
      if (!main) continue // Front pages and the review index have no repository subject.
      const headings = [...main.querySelectorAll('h1,h2,h3')].map(node => node.textContent).join(' ')
      assert.ok(!/\b(?:flow|page|run|pull request|issue|commit|file|branch|release|package) (?:was )?not found\b|wasn't found|couldn't be found/i.test(headings), `${site}/${screen.id}: real fixture subject; ${headings}`)
      subjects++
      if(subjects % 50 === 0) console.log(`${site}: ${subjects} subjects checked; ${screen.id}`)
    }
    console.log(`PASS ${site}: ${meta.screens.length} screens, ${meta.routes.length} routes; every route covered; ${subjects} full-data subjects rendered`)
  }

  const defaults = sites.default.__SITE__
  const base = "smithers.sh/Effect-TS/effect"
  for (const suffix of ["packages", "packages/sql-pg", "runs/run-4802/matrix", "runs/run-4802", "releases/plan", "releases", "releases/tag/4.0.0-rc.118", "docs", "docs/sql-pg", "pull/111", "pull/111/commits", "pull/111/checks", "pull/111/files"]) {
    const route = `${base}/${suffix}${suffix.includes("?") ? "&" : "?"}${flags}`
    assert.equal(defaults.resolve(route), sites.effect.__SITE__.resolve(route), `${suffix}: shared route`)
    assert.ok(defaults.resolve(route), `${suffix}: registered`)
    await open(sites.default, route)
    await open(sites.effect, route)
    assert.ok(content(sites.default), `${suffix}: repository content rendered`)
    assert.equal(content(sites.default), content(sites.effect), `${suffix}: identical repository content across sites`)
  }
  console.log("PASS Effect views: identical default/effect content, including package, CI, release and docs routes")

  for (const suffix of ["runs", "releases", "docs", "settings/models"]) {
    const route = `smithers.sh/effeck/effeck/${suffix}?${flags}`
    await open(sites.default, route)
    await open(sites["effeck-site"], route)
    assert.equal(content(sites.default), content(sites["effeck-site"]), `${suffix}: Effeck keeps its default view`)
  }
  await open(sites.default, `smithers.sh/maya/tinyhttp/packages?${flags}`)
  assert.ok(!sites.default.document.querySelector(".effect-packages-heading"), "Effect package view is gated to Effect-TS/effect")
  console.log("PASS Effect overrides preserve other repositories' views")

  for (const path of ["evals", "evals/agent"]) {
    const screens = defaults.screens.filter(screen => screen.route.split("?")[0] === `smithers.sh/smithers-canary/smithers/${path}`)
    for (const state of ["net=ok", "net=slow", "net=error", "data=empty", "as=out"]) {
      assert.ok(screens.some(screen => screen.route.includes(state)), `${path}: ${state} screen`)
    }
  }
  console.log("PASS default Evals list and suite: ready/loading/error/empty/signed-out screens")

  const effeck = sites["effeck-site"]
  const commit = effeck.__SITE__.screens.find(screen => screen.id === "effeck-site-commit")
  for (const width of [1440, 390]) {
    effeck.happyDOM.setViewport({ width, height: 900 })
    await open(effeck, commit.route)
    const markdown = effeck.document.querySelector(".repo-ui-markdown")
    assert.ok(markdown.textContent.includes("Effect<A, E, R>"), "Commit preserves TypeScript generic prose")
    for (const link of effeck.document.querySelectorAll('#repo-content a[href]')) {
      assert.ok(named(link), `Commit link has a name: ${link.outerHTML}`)
      assert.ok(!link.getAttribute("href").endsWith("/blob/main/"), "No empty blob target")
    }
  }
  console.log("PASS Effeck commit: named links, no empty file target, preserved generic prose at desktop/phone viewport settings")
} finally {
  for (const window of windows) await window.happyDOM.abort()
}
