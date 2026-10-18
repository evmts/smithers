/* Built-UI regressions for dl-0625. CSS contracts are not measured browser layout. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(resolve(root, '../../../apps/app/package.json'))
const { Window } = await import(require.resolve('happy-dom'))
const build = process.argv.find(a => a.startsWith('--build-root='))?.slice(13) ?? resolve(root, 'dist-codex')
const wait = (ms = 100) => new Promise(r => setTimeout(r, ms))
const flags = 'as=in&role=member&net=ok&data=full&guest=off&landing=install&host=install&hosted=up&still=1'
let checks = 0
const failures = [], catalogs = {}
const check = (value, reason) => { checks++; if (!value) failures.push(reason) }
const data = (slug, name) => JSON.parse(readFileSync(resolve(root, 'src/sites/repo/fixtures/data', slug.replace('/', '__'), name + '.json'), 'utf8'))
for (const [site, slug] of [['default','maya/tinyhttp'], ['smithers-site','smithers-canary/smithers'], ['effeck-site','effeck/effeck'], ['effect','Effect-TS/effect']]) {
 const html = readFileSync(resolve(build, site, 'index.html'), 'utf8')
 for (const width of [1440, 1280, 390]) {
  const w = new Window({ url: `http://localhost/#/smithers.sh/${slug}?${flags}`, width, height: 900 })
  const $ = s => w.document.querySelector(s), all = s => [...w.document.querySelectorAll(s)]
  const css = el => el && w.getComputedStyle(el)
  const open = async path => { const [pathname, raw] = path.split('?'); const query = new URLSearchParams(); new URLSearchParams(raw).forEach((value, key) => query.set(key, value)); w.location.hash = `#/smithers.sh/${slug}${pathname ? '/' + pathname : ''}?${query}`; await wait(170) }
  try {
   w.document.body.innerHTML = '<div id="root"></div>'
   w.document.head.innerHTML = [...html.split('</head>')[0].matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[0]).join('')
   w.eval('(function(){' + html.match(/<script type="module">([\s\S]*?)<\/script>/)[1] + '})()')
   await wait(220)
   const screens = w.__SITE__.screens
   if (width === 1440) catalogs[site] = { screens: screens.map(s => ({ id: s.id, route: s.route })), routes: w.__SITE__.routes }
   // D3: exactly one composer; close/reopen and typing exercise both real Send paths.
   const panelExpected = width === 1440
   check(Boolean($('#repo-ask-input')) === panelExpected, `${site}/${width}: default panel state`)
   check(all('#repo-ask-input, .repo-code-home-block input').length === 1, `${site}/${width}: one composer`)
   check(!$('#repo-content').textContent.includes('Ask in the panel'), `${site}/${width}: no redundant handoff card`)
   check(!$('.repo-frame-ask-button').classList.contains('repo-ui-btn-primary'), `${site}/${width}: header Ask secondary`)
   if (panelExpected) {
    check(!$('.repo-code-home-block input'), `${site}: no page prompt while docked`)
    check($('.repo-frame-ask-button').getAttribute('aria-pressed') === 'true', `${site}: header pressed`)
    check(css($('.repo-frame-ask-button')).backgroundColor === css($('.repo-frame-ask')).backgroundColor || css($('.repo-frame-ask-button')).backgroundColor !== 'transparent', `${site}: pressed has surface`)
    check($('.repo-frame-send')?.classList.contains('repo-ui-btn-primary') && $('.repo-frame-send')?.disabled, `${site}: empty docked Send solid and disabled`)
    check(Number(css($('.repo-frame-send')).opacity) === 0.5, `${site}: empty docked Send at half opacity`)
    $('[title="/ask.close"]').click(); await wait()
   }
   const input = $('.repo-code-home-block input')
   const send = $('.repo-code-home-block button[type="submit"], form.repo-code-home-block button:last-child')
   check(input && send?.textContent === 'Send' && send.disabled && send.classList.contains('repo-ui-btn-primary'), `${site}/${width}: closed panel page Send`)
   if (input) { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(input, 'Where should I start reading?'); input.dispatchEvent(new w.Event('input', { bubbles: true })); await wait() }
   check(send && !send.disabled, `${site}/${width}: typing enables page Send`)
   if (send) { send.click(); await wait() }
   check($('#repo-ask-input') && !$('.repo-code-home-block input'), `${site}/${width}: page Send hands off to single panel`)
   w.sessionStorage.setItem('repo-ask-open', 'false')
   $('.repo-frame-ask-button')?.click(); await wait()
   if (width === 1280) continue
   // D2/4/5/10/12: immutable links, actual commits, bounded sidebar labels, readable code.
   const prefixes = {default: 'code-', 'smithers-site': 'smithers-site-', 'effeck-site':'effeck-site-', effect:'effect-repo-'}
   const findScreen = suffix => screens.find(s => s.id === prefixes[site] + suffix)
   for (const suffix of ['tree', 'directory', 'file', 'blame']) {
    const screen = findScreen(suffix)
    if (!screen) continue
    w.location.hash = '#/' + screen.route; await wait(180)
    const copy = $('.repo-code-permalink')
    if (suffix !== 'blame') {
     check(copy?.classList.contains('repo-ui-btn-primary') && copy.textContent.includes('Copy permalink'), `${site}/${width}/${suffix}: labelled primary permalink`)
     check(copy && css(copy).minHeight === (width === 390 ? '40px' : '36px'), `${site}/${width}/${suffix}: permalink height`)
     check(copy && css(copy.querySelector('span')).display !== 'none', `${site}/${width}/${suffix}: permalink label visible`)
     if (copy) {
      let copied = ''
      w.navigator.clipboard.writeText = async text => { copied = text }
      copy.click(); await wait()
      check(copied.startsWith(`https://smithers.sh/${slug}/${suffix === 'file' ? 'blob' : 'tree'}/` + data(slug,'branches').find(b => b.name === 'main').head), `${site}/${width}/${suffix}: immutable permalink`)
     }
    } else if (copy) check(!copy.classList.contains('repo-ui-btn-primary'), `${site}/${width}: blame permalink quiet`)
    for (const author of all('.repo-code-latest .repo-ui-person')) check(author.textContent.includes(author.title), `${site}/${width}/${suffix}: commit author visible`)
    for (const header of all('.repo-code-main .repo-ui-box-header')) check(header.textContent.trim(), `${site}/${width}/${suffix}: commit header not empty`)
    const treeRows = all('.repo-code-tree-file')
    for (const row of [...new Set([...treeRows.slice(0, 5), ...treeRows.slice(-3), ...treeRows.filter(row => row.hasAttribute('aria-current'))])]) {
     check(row.title && row.querySelector('span')?.textContent === row.title, `${site}/${suffix}: complete file title`)
     check(css(row.querySelector('span'))?.whiteSpace === 'nowrap' && css(row.querySelector('span'))?.textOverflow === 'ellipsis', `${site}/${suffix}: file label ellipsis`)
    }
    for (const source of all('.repo-code-source, .repo-code-raw')) check(css(source).backgroundColor === css($('.repo-ui-box')).backgroundColor, `${site}/${width}/${suffix}: code uses surface`)
    if (site === 'smithers-site' && suffix === 'directory') check(!$('.repo-code-readme')?.textContent.match(/(?:title:|description:|sidebar:)/), 'D1: README metadata hidden')
   }
   // D6: same live records drive summary, visible rows and active repo-tab count.
   await open(`runs?${flags}`)
   const runs = data(slug,'runs'), decisions = data(slug,'approvals')
   const waiting = runs.filter(r => r.state === 'waiting' && decisions.some(d => d.run === r.id && d.state === 'waiting' && d.askedOf === 'maya')).length
   check($('.repo-runs-summary')?.textContent.startsWith(`${runs.filter(r => r.state === 'running').length} running · ${waiting} waiting on you`), `${site}: summary equals fixture rows`)
   const active = runs.filter(r => ['running','waiting','queued'].includes(r.state)).length
   check(Number($('.repo-ui-tabs a[href*="/runs"] .repo-ui-counter')?.textContent ?? 0) === active, `${site}: Runs tab equals same records`)
   check(all('.repo-runs-list-row').length === runs.length, `${site}: all runs displayed`)
   if (site === 'effeck-site') {
    const suspended = data(slug,'branches').find(b => b.sandbox?.state === 'suspended')
    await open(`branches?${flags}`)
    if (suspended) check(css($('.repo-history-dot-suspended')).backgroundColor === css($('.repo-history-muted')).color, 'D9: suspended sandbox neutral')
    const diagnostic = findScreen('file-diagnostic')
    w.location.hash = '#/' + diagnostic.route; await wait(180)
    check($('.repo-code-file-toolbar > .repo-code-diagnostic-count')?.textContent.includes('2 errors') && css($('.repo-code-diagnostic-count')).display !== 'none', `D12/${width}: errors stay visible`)
    await open(`branches/main/terminal?${flags}`)
    check($('.repo-history-terminal-transcript') && !$('.repo-history-terminal-transcript .repo-history-shell-input'), `D11/${width}: input outside transcript`)
    check(css($('.repo-history-terminal-transcript'))?.overflowY === 'auto' && css($('.repo-history-terminal-pane')).display === 'flex', `D11/${width}: bounded scrolling transcript`)
    for (const n of [32,33,34]) {
     await open(`issues/${n}?${flags}&ask=1`)
     check($('.repo-frame-suggestions')?.textContent.includes(`#${n}: ${data(slug,'issues').find(i => i.n === n).title}`), `D7: suggestions name #${n}`)
     check(!$('.repo-frame-suggestions')?.textContent.includes('Did the hover crash reach main?'), `D7: no unrelated crash question #${n}`)
    }
    for (const state of ['held', 'denied']) {
     const screen = findScreen('implement-' + state)
     w.location.hash = '#/' + screen.route; await wait(180)
     if (width === 390) check(css($('.repo-issues-confirm')).boxSizing === 'border-box' && css($('.repo-issues-confirm')).marginInline === '6px', `D14: ${state} inset focus card`)
    }
   }
   const receiptNumbers = site === 'smithers-site' ? [4218,4217,4214,4209] : site === 'effeck-site' ? [31,32,33,34] : data(slug,'issues').filter(issue => issue.receipt?.landed).slice(0, 2).map(issue => issue.n)
   for (const n of receiptNumbers) {
    await open(`issues/${n}?${flags}`)
    const disclosure = $('.repo-issues-receipt-disclosure')
    check(disclosure, `${site}/${width}/#${n}: stages have a disclosure`)
    if (!disclosure) continue
    check(disclosure.open === (width !== 390), `${site}/${width}/#${n}: receipt initially ${width === 390 ? 'collapsed' : 'open'}`)
    if (data(slug,'issues').find(i => i.n === n)?.receipt?.landed) check($('.repo-issues-main-evidence a[href*="/commit/"]'), `${site}/#${n}: one-line main commit link`)
    if (width === 390) {
     check(css(disclosure.querySelector('summary')).display !== 'none', `${site}/#${n}: stages disclosure visible`)
     disclosure.querySelector('summary').click(); await wait()
     check(disclosure.open, `${site}/#${n}: stages disclosure opens`)
    }
   }
   await open(`issues?q=is:fixed-by-agents&${flags}`)
   if (width === 390) check(all('.repo-issues-saved > a').every(a => css(a).minHeight === '40px' && css(a).whiteSpace === 'nowrap') && css($('.repo-issues-saved')).overflowX === 'auto', `${site}: D13 scroll row with 40px chips`)
   if (site === 'effeck-site') {
    await open(`issues?q=is:fixed-by-agents&${flags}&data=empty`)
    check($('.repo-frame-state h2')?.textContent === 'No issues fixed by agents yet.', 'D15: contextual empty copy')
   }
   if (site === 'smithers-site' || site === 'effeck-site') {
    const sent = findScreen('bug-sent')
    check(sent.route.includes('receipt=sample'), `${site}: sent catalog requests sample receipt`)
    w.location.hash = '#/' + sent.route; await wait(180)
    const n = Math.max(...data(slug,'issues').map(issue => issue.n)) + 1
    check($('#repo-content')?.textContent.includes('#' + n) && $('#repo-content')?.textContent.includes('maya'), `${site}: sent opens maya new issue #${n}`)
   }
   console.log('checked', site, width)
  } finally { await w.happyDOM.close() }
 }
}
writeFileSync(join(tmpdir(), process.argv.some(a => a.startsWith('--build-root=')) ? 'dl-0625-before-catalogs.json' : 'dl-0625-catalogs.json'), JSON.stringify(catalogs, null, 2))
console.log(JSON.stringify({ checks, failures, counts: Object.fromEntries(Object.entries(catalogs).map(([site,c]) => [site, {screens:c.screens.length,routes:c.routes.length}])) }, null, 2))
assert.equal(failures.length, 0, 'dl-0625 regression failures')
