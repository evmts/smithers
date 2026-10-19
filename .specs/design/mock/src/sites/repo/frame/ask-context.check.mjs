/* Exercise the actual four catalog bundles; no browser or layout claims. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const mock = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const req = createRequire(join(mock, '../../../apps/app/package.json'))
const { Window } = await import(req.resolve('happy-dom'))
const aliases = JSON.parse(readFileSync(join(mock, 'src/sites/repo/fixtures/data/effeck__effeck/path-aliases.json'), 'utf8'))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const failures = []
let checks = 0
const check = (value, label) => { checks++; if (!value) failures.push(label) }
const base = 'smithers.sh/effeck/effeck'
const states = {
  ready: 'as=in&role=member&net=ok&data=full',
  loading: 'as=in&role=member&net=slow&data=full',
  error: 'as=in&role=member&net=error&data=full',
  empty: 'as=in&role=member&net=ok&data=empty',
  'signed-out': 'as=out&role=reader&net=ok&data=full',
  reader: 'as=in&role=reader&net=ok&data=full'
}

for (const site of ['default', 'smithers-site', 'effeck-site', 'effect']) {
  const window = new Window({ url: 'http://localhost/?still=1#/__screens', width: 1440, height: 900 })
  // Happy DOM has no Fonts API; model loaded fonts without claiming measured layout.
  if (!window.document.fonts) Object.defineProperty(window.document, 'fonts', { value: { ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} } })
  const qs = selector => window.document.querySelector(selector)
  const open = async route => {
    const [path, raw] = route.split('?')
    const query = new URLSearchParams(raw)
    query.set('ask', '1')
    query.set('guest', 'ok')
    window.location.hash = `#/${path}?${query}`
    await wait(100)
    // Wait for this route to mount, including when the initial React boot is busy.
    for (let attempt = 0; attempt < 40 && (!qs('.repo-frame-ask-heading p') || qs('.repo-frame-skip')?.getAttribute('href') !== `#/${path}?${query}`); attempt++) await wait(50)
  }
  const sourceCheck = (label, path, revision, kind) => {
    const breadcrumb = [...(qs('.repo-code-breadcrumbs')?.querySelectorAll(':scope > span') ?? [])]
      .map(node => node.querySelector('a,strong')?.textContent).join('/')
    check(breadcrumb === path, `${label}: resolved breadcrumb (${breadcrumb} != ${path})`)
    const heading = qs('.repo-frame-ask-heading p')?.textContent
    const expected = `Asking about ${kind === 'blame' ? 'Line history of ' : ''}${path} at ${revision}`
    check(heading?.startsWith(expected), `${label}: subtitle matches breadcrumb (${heading} != ${expected})`)
    check(qs('.repo-frame-suggestion')?.textContent === `Explain ${path}`, `${label}: suggestion names resolved file`)
    check(qs('.repo-frame-composer-foot')?.textContent.includes(` · ${revision} · ${path}`), `${label}: footer names resolved file and ref`)
  }
  try {
    window.document.body.innerHTML = '<div id="root"></div>'
    const html = readFileSync(join(mock, `dist-codex/${site}/index.html`), 'utf8')
    window.eval(`(function(){${html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]}\n})()`)
    await wait(150)
    const meta = window.__SITE__
    const screens = meta.screens.filter(screen => /\/(blob|blame)\/[^/]+\//.test(screen.route.split('?')[0]))
    for (const screen of screens) {
      await open(screen.route)
      const [, owner, name, kind, ref, ...parts] = screen.route.split('?')[0].split('/')
      const requested = parts.map(decodeURIComponent).join('/')
      const path = `${owner}/${name}` === 'effeck/effeck' ? aliases[requested] ?? requested : requested
      sourceCheck(`${site}/${screen.id}`, path, decodeURIComponent(ref), kind)
    }
    // All retained aliases, including loading/error/empty fallbacks, not just the main.vibe review screens.
    let aliasViews = 0
    if (['default', 'effeck-site'].includes(site)) {
      for (const [legacy, path] of Object.entries(aliases)) {
        for (const kind of ['blob', 'blame']) for (const [state, flags] of Object.entries(states)) {
          await open(`${base}/${kind}/main/${legacy}?${flags}`)
          sourceCheck(`${site}/${kind}/${legacy}/${state}`, path, 'main', kind)
          check(window.location.hash.includes(`/${legacy}?`), `${site}/${kind}/${legacy}/${state}: retained legacy URL`)
          aliasViews++
        }
        await open(`${base}/commits/main/${legacy}?${states.ready}`)
        check(qs('.repo-frame-ask-heading p')?.textContent.includes(path), `${site}/${legacy}: history context resolves alias`)
        check(qs('.repo-frame-suggestion')?.textContent === `Explain ${path}`, `${site}/${legacy}: history suggestion resolves alias`)
        check(qs('.repo-frame-composer-foot')?.textContent.includes(path), `${site}/${legacy}: history footer resolves alias`)
      }
      await open(`${base}/docs/user/src/setup/effeck-cli?${states.ready}`)
      check(qs('.repo-frame-ask-heading p')?.textContent.includes('docs/user/src/setup/vibelang-cli'), `${site}: legacy docs context resolves page`)
      check(qs('.repo-frame-composer-foot')?.textContent.includes('docs/user/src/setup/vibelang-cli'), `${site}: legacy docs footer resolves page`)
    }
    console.log(`${site}: ${meta.screens.length} screens / ${meta.routes.length} routes; ${screens.length} file/blame/diagnostic screens; ${aliasViews} alias state views`)
  } finally {
    await window.happyDOM.close()
  }
}
assert.equal(failures.length, 0, `${failures.length} failures:\n${failures.join('\n')}`)
console.log(`PASS ${checks} Ask context assertions across all four catalogs`)
