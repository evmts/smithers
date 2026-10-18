/* Docked-width regressions against the real four entry points. Happy DOM does not
 * measure layout; grid tracks/container queries and code hit boxes need the
 * orchestrator's Chromium overlap probe before claiming measured clearance. */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const req = createRequire(resolve(root, '../../../apps/app/package.json'))
const { Window } = await import(req.resolve('happy-dom'))
const builds = process.argv.find(arg => arg.startsWith('--build-root='))?.slice(13) ?? resolve(root, 'dist-codex')
const wait = (ms = 100) => new Promise(r => setTimeout(r, ms))
const flags = 'as=in&role=member&net=ok&data=full&host=install&landing=open&model=connected'
const failures = [], windows = [], htmls = new Map()
let checks = 0, visited = 0, forms = 0, tokens = 0
const check = (value, message) => { checks++; if (!value) failures.push(message) }
const $ = (w, selector) => w.document.querySelector(selector)
const all = (w, selector) => [...w.document.querySelectorAll(selector)]
const boot = async (site, route, saved = {}, width = 1440) => {
  const w = new Window({ url: `http://localhost/?still=1#/${route}`, width, height: 900 })
  windows.push(w)
  for (const [key, value] of Object.entries(saved)) w.sessionStorage.setItem(key, value)
  const html = htmls.get(site) ?? readFileSync(resolve(builds, site, 'index.html'), 'utf8')
  htmls.set(site, html)
  w.document.body.innerHTML = '<div id="root"></div>'
  w.document.head.innerHTML = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map(m => m[0]).join('')
  w.eval('(function(){' + html.match(/<script type="module">([\s\S]*?)<\/script>/)[1] + '})()')
  await wait(180)
  return w
}
const open = async (w, route) => { w.location.hash = '#/' + route; await wait() }
// Deliberately independent of formSubject(): new catalog form routes cannot
// silently disappear from the inventory when the frame classifier regresses.
const isForm = route => {
  const [path, raw] = route.split('?'), q = new URLSearchParams(raw)
  return /\/(?:issues\/new|bug)$/.test(path) || /\/settings(?:\/|$)/.test(path)
    || /\/releases$/.test(path) && q.get('draft') === '1'
    || /\/branches$/.test(path) && q.has('dialog')
    || /\/wiki(?:\/|$)/.test(path) && (q.get('new') === '1' || q.get('edit') === '1')
    || /\/flows(?:\/|$)/.test(path) && (q.has('run') || q.get('act') === 'run')
    || /\/evals(?:\/|$)/.test(path) && q.get('act') === 'run'
    || /\/releases\/plan$/.test(path) && q.get('act') === 'prepare'
}
try {
  for (const [site, slug, screenCount, routeCount] of [
    ['default', 'maya/tinyhttp', 514, 56], ['smithers-site', 'smithers-canary/smithers', 118, 48],
    ['effeck-site', 'effeck/effeck', 157, 50], ['effect', 'Effect-TS/effect', 127, 56]
  ]) {
    const w = await boot(site, `smithers.sh/${slug}?${flags}`)
    const meta = w.__SITE__
    // Counts are the qa-1440 floor (10-18 morning). Later rounds add screens and routes (lane C, /change), so this
    // guards against losing them, not against growth.
    check(meta.screens.length >= screenCount && meta.routes.length >= routeCount, `${site}: retained screen/route counts (at least ${screenCount}/${routeCount})`)
    console.log(`${site}: ${meta.screens.length} screens / ${meta.routes.length} routes`)
    check($(w, '.repo-frame')?.dataset.askOpen === 'true', `${site}: ordinary 1440px load docks Ask`)
    // Happy DOM drops the modern lh unit; inspect the delivered declaration as
    // well as its supported inline/padding/alignment cascade below.
    check(/\.repo-frame \.repo-hovers-token\s*\{[^}]*height: 1lh/.test(htmls.get(site)), `${site}: token hit box declares one inherited line`)
    const screens = process.argv.includes('--probe') ? meta.screens.filter(s => /^(history-branches(?:-new)?|releases-draft|wiki-edit|effeck-site-golden-case-01-hero-batch-lookup|smithers-site-receipt-4218)$/.test(s.id)) : meta.screens
    for (const screen of screens) {
      check(Boolean(meta.resolve(screen.route)), `${site}/${screen.id}: route still resolves`)
      await open(w, screen.route)
      visited++
      // Keep all views mounted at the docked desktop viewport. Width semantics
      // are reviewed from the included CSS, never inferred from Happy DOM boxes.
      const content = $(w, '#repo-content')
      if (content) check(content.childElementCount > 0, `${site}/${screen.id}: content renders`)
      for (const row of all(w, '.repo-history-branch-row')) {
        const actions = row.querySelector('.repo-history-branch-actions')
        const pill = row.querySelector('.repo-history-pull-link')
        check(!pill || pill.parentElement === actions, `${site}/${screen.id}: PR shares the action group`)
        check(!row.querySelector('.repo-history-branch-status .repo-history-pull-link'), `${site}/${screen.id}: no PR in divergence track`)
        const compact = row.querySelector('.repo-history-divergence-text')
        if (row.querySelector('.repo-history-divergence')) check(/^\d+ behind · \d+ ahead$/.test(compact?.textContent), `${site}/${screen.id}: compact counters retain both numbers`)
      }
      for (const token of all(w, '.repo-hovers-token')) {
        const style = w.getComputedStyle(token)
        check(style.display === 'inline' && style.paddingTop === '0px' && style.paddingBottom === '0px', `${screen.id}: tokens are inline without vertical padding`)
        check(parseFloat(style.minHeight) === 0 && style.verticalAlign === 'top', `${screen.id}: token hit box has no native minimum and aligns to its line`)
        check(style.lineHeight === w.getComputedStyle(token.parentElement).lineHeight, `${screen.id}: token inherits code line-height`)
        tokens++
      }
      for (const evidence of all(w, '.repo-issues-main-evidence')) {
        check(w.getComputedStyle(evidence).marginBottom === '16px', `${screen.id}: On main has 16px below it`)
      }
      if (isForm(screen.route)) {
        forms++
        console.log(`FORM ${site}/${screen.id} ${screen.route}`)
        const fresh = await boot(site, screen.route, { 'repo-ask-open': 'true' })
        // Guest-off is the existing explicit denial of Ask, independent of the form policy.
        const q = new URLSearchParams(screen.route.split('?')[1])
        const askAllowed = q.get('as') === 'in' || ['ok', 'ceiling'].includes(q.get('guest'))
        check(Boolean($(fresh, '#repo-ask-panel')) === askAllowed, `${site}/${screen.id}: fresh 1440 form docks permitted Ask beside the form`)
        for (const width of [1439, 1280, 390]) {
          const narrow = await boot(site, screen.route, { 'repo-ask-open': 'true' }, width)
          check($(narrow, '.repo-frame')?.dataset.askOpen === 'false' && !$(narrow, '#repo-ask-panel'), `${site}/${screen.id}@${width}: fresh form closes Ask despite saved-open`)
          await narrow.happyDOM.close()
          windows.splice(windows.indexOf(narrow), 1)
        }
        // Opening help is still allowed; release/bug state must not become Ask text.
        if (q.has('draft') && q.get('as') !== 'out') {
          await wait()
          check($(fresh, '#repo-ask-input')?.value === '', `${screen.id}: subject draft never seeds Ask`)
          check($(fresh, '.repo-frame-send')?.disabled, `${screen.id}: untouched Ask cannot Send`)
        }
        await fresh.happyDOM.close()
        windows.splice(windows.indexOf(fresh), 1)
      }
    }
    await open(w, `smithers.sh/${slug}?${flags}&ask=%2F`)
    const list = $(w, '.repo-frame-commands'), composer = $(w, '.repo-frame-composer')
    check(list?.parentElement === composer, `${site}: commands anchored to their composer`)
    check(w.getComputedStyle(composer).position === 'relative', `${site}: composer is the list containing block`)
    check(list && w.getComputedStyle(list).position === 'absolute' && w.getComputedStyle(list).bottom === 'calc(100% + 8px)', `${site}: command list sits 8px above composer`)
    // The return route can keep the release's draft while restoring an Ask draft.
    const restore = await boot(site, `smithers.sh/${slug}/releases?${flags}&draft=1&ask=1&askDraft=${encodeURIComponent('Explain v1.0 notes?')}`)
    check($(restore, '#repo-ask-input')?.value === 'Explain v1.0 notes?', `${site}: independent Ask draft restores over release state`)
    check(!$(restore, '.repo-frame-send')?.disabled, `${site}: actual restored text enables Send`)
    await restore.happyDOM.close()
    windows.splice(windows.indexOf(restore), 1)
    await w.happyDOM.close()
  }
  const css = readFileSync(resolve(root, 'src/sites/repo/views/history/history.css'), 'utf8')
  check(/branch-list\s*\{[^}]*minmax\(0, 1fr\) 144px max-content/.test(css), 'Action group owns an intrinsic grid track')
  check(/branch-actions\s*\{[^}]*gap: 8px/.test(css), 'Action group has 8px gaps')
  check(/branch-list-heading,[\s\S]*?grid-template-columns: subgrid/.test(css), 'Header shares row tracks')
  check(/@container repo-branches \(width < 900px\)[\s\S]*?divergence \{ display: none;/.test(css), 'Divergence bars collapse on content width below 900px')
  check(/@container repo-branches \(width < 600px\)/.test(css), 'Phone rows stack within their available content width')
  // Both sign-in writer paths are exercised end to end by qa2 and qa1c.
  for (const name of ['AskPanel.tsx', 'RepoFrame.tsx']) {
    const source = readFileSync(resolve(root, 'src/sites/repo/frame', name), 'utf8')
    check(!/\.(?:get|set)\(["']draft["']/.test(source), `${name}: no Ask draft collision`)
  }
  if (failures.length) throw new Error(`${failures.length}/${checks} assertions failed:\n${failures.join('\n')}`)
  console.log(`PASS qa1440: ${checks} assertions; ${visited} catalog screens; ${forms} fresh form loads; ${tokens} token controls. Layout measurement deferred to Chromium.`)
} finally { for (const w of windows) await w.happyDOM.close() }
