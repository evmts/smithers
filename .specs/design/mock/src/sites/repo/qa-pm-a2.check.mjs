/* PM d-b1krbg and final fidelity: install destination and retryable read errors. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const build = process.argv.find(a => a.startsWith('--build-root='))?.slice(13) ?? resolve(root, 'dist-codex')
const req = createRequire(resolve(root, '../../../apps/app/package.json'))
const { Window } = await import(req.resolve('happy-dom'))
const wait = ms => new Promise(r => setTimeout(r, ms))
const failures = [], counts = {}, errors = [], identities = {}
let checks = 0
const check = (ok, why) => { checks++; if (!ok) failures.push(why) }
const visible = element => {
  for (let e = element; e; e = e.parentElement) {
    const style = e.ownerDocument.defaultView.getComputedStyle(e)
    if (e.hidden || style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}
for (const site of ['default', 'smithers-site', 'effeck-site', 'effect']) {
  const html = readFileSync(resolve(build, site, 'index.html'), 'utf8')
  const boot = async route => {
    const w = new Window({ url: `http://localhost/?still=1#/${route}`, width: 390, height: 844 })
    w.sessionStorage.setItem('repo-ask-open', 'false')
    w.document.body.innerHTML = '<div id="root"></div>'
    w.document.head.innerHTML = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map(m => m[0]).join('')
    w.eval('(function(){' + html.match(/<script type="module">([\s\S]*?)<\/script>/)[1] + '})()')
    await wait(140)
    return w
  }
  const catalog = await boot('__screens')
  const meta = catalog.__SITE__
  identities[site] = { screens: meta.screens.map(({ id, route }) => ({ id, route })), routes: meta.routes }
  // Launcher errors belong to core/front; this audit owns repository views only.
  const screens = meta.screens.filter(s => /^smithers\.sh\/[^/]+\/[^/?]+/.test(s.route) && (/-error$/.test(s.id) || new URLSearchParams(s.route.split('?')[1]).get('net') === 'error'))
  counts[site] = { screens: meta.screens.length, routes: meta.routes.length, errors: screens.length }
  await catalog.happyDOM.close()
  for (const screen of screens) {
    const w = await boot(screen.route)
    const context = `${site}/${screen.id}`
    try {
      const errorAlerts = () => [...w.document.querySelectorAll('#repo-content [role="alert"], #repo-ask-panel [role="alert"]')].filter(e => visible(e) && /couldn.t|failed|unavailable|didn.t|connection|respond/i.test(e.textContent))
      const alerts = errorAlerts()
      check(alerts.length > 0, `${context}: visible error with reason`)
      const retries = []
      for (const alert of alerts) {
        check(Boolean(alert.querySelector('p')?.textContent.trim()), `${context}: error gives its reason`)
        const retry = [...alert.querySelectorAll('button,a')].find(e => /^Retry$/i.test(e.textContent.trim()) && visible(e) && !e.disabled)
        check(Boolean(retry), `${context}: error has an enabled, visible Retry`)
        if (retry) retries.push(retry)
      }
      errors.push({ site, id: screen.id, reasons: alerts.map(a => a.textContent), retries: retries.length })
      // Read recovery must work, not merely display an inert action.
      for (const retry of retries) retry.click()
      if (retries.length) {
        await wait(850)
        check(errorAlerts().length === 0, `${context}: Retry recovers the failed read`)
      }
    } finally { await w.happyDOM.close() }
  }
  // The home block is shared by default and the Smithers product site.
  if (site === 'default' || site === 'smithers-site') for (const as of ['out', 'in']) {
    const w = await boot(`smithers.sh/smithers-canary/smithers?as=${as}&role=member&net=ok&data=full&landing=install`)
    try {
      const links = [...w.document.querySelectorAll('.repo-code-home-links a')]
      check(JSON.stringify(links.map(a => a.textContent.trim())) === JSON.stringify(['Install Smithers', 'Docs', 'Report a bug', 'Fixed by agents']), `${site}/${as}: amended links in order; no Source on GitHub`)
      const install = links.find(a => a.textContent.trim() === 'Install Smithers')
      check(install?.getAttribute('href') === '#/smithers.sh/', `${site}/${as}: Install opens / on Smithers`)
      check(links.find(a => a.textContent.trim() === 'Report a bug')?.getAttribute('href').split('?')[0] === '#/smithers.sh/smithers-canary/smithers/bug', `${site}/${as}: Report a bug opens /bug`)
      if (install) {
        install.click(); await wait(150)
        check(w.location.hash === '#/smithers.sh/', `${site}/${as}: Install navigates to /`)
        // The shared front route shows the launcher to signed-in people.
        if (as === 'out') check(w.document.body.textContent.includes('npx smthrs@next generate flow coding'), `${site}/${as}: landing contains the run command (#4315)`)
      }
    } finally { await w.happyDOM.close() }
  }
  console.log('checked', site, counts[site])
}
const receipt = { checks, counts, errors, failures, identities }
writeFileSync(join(tmpdir(), build.startsWith(tmpdir()) ? 'qa-pm-a2-before-results.json' : 'qa-pm-a2-results.json'), JSON.stringify(receipt, null, 2))
console.log(JSON.stringify({ checks, counts, failures }, null, 2))
assert.equal(failures.length, 0, 'PM A2 regressions')
