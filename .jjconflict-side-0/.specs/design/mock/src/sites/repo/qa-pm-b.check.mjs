/* PM d-0vuoef: reviewer ownership, form docking and truthful act doors. No Chromium. */
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
const wait = (ms = 100) => new Promise(r => setTimeout(r, ms))
const flags = 'as=in&role=member&net=ok&data=full&host=install&landing=open&model=connected'
const failures = [], counts = {}, identities = {}
let checks = 0
const check = (ok, why) => { checks++; if (!ok) failures.push(why) }
const $ = (w, s) => w.document.querySelector(s)
const all = (w, s) => [...w.document.querySelectorAll(s)]
const open = async (w, path) => { w.location.hash = '#/smithers.sh/' + path; await wait() }
const send = async (w, text) => {
  if (!$(w, '#repo-ask-input')) { $(w, '.repo-frame-ask-button')?.click(); await wait() }
  const input = $(w, '#repo-ask-input')
  check(input, 'Ask input exists')
  if (!input) return
  Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, text)
  input.dispatchEvent(new w.Event('input', { bubbles: true }))
  await wait()
  $(w, '.repo-frame-composer').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }))
  await wait(220)
}
for (const [site, slug, number] of [['default', 'maya/tinyhttp', 9001], ['smithers-site', 'smithers-canary/smithers', 9001], ['effeck-site', 'effeck/effeck', 9001], ['effect', 'Effect-TS/effect', 103]]) {
  const html = readFileSync(resolve(build, site, 'index.html'), 'utf8')
  const boot = async (path, width = 1440, saved = {}) => {
    const w = new Window({ url: `http://localhost/?still=1#/smithers.sh/${path}`, width, height: width === 390 ? 844 : 900 })
    for (const [key, value] of Object.entries(saved)) w.sessionStorage.setItem(key, value)
    w.document.body.innerHTML = '<div id="root"></div>'
    w.document.head.innerHTML = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map(m => m[0]).join('')
    w.eval('(function(){' + html.match(/<script type="module">([\s\S]*?)<\/script>/)[1] + '})()')
    await wait(160)
    return w
  }
  const w = await boot(`${slug}?${flags}`)
  try {
    counts[site] = { screens: w.__SITE__.screens.length, routes: w.__SITE__.routes.length }
    identities[site] = { screens: w.__SITE__.screens, routes: w.__SITE__.routes }
    const data = name => JSON.parse(readFileSync(resolve(root, 'src/sites/repo/fixtures/data', slug.replace('/', '__'), name + '.json'), 'utf8'))
    if (site === 'smithers-site' || site === 'effeck-site') {
      const main = data('branches').find(branch => branch.name === data('repo').defaultBranch).head
      check(w.__SITE__.screens.find(screen => screen.id === `${site}-commit`)?.route.split('?')[0] === `smithers.sh/${slug}/commit/${main}`, `${site}: original commit screen stays on main`)
    }
    const fixture = data('pulls').find(p => p.n === number)
    check(fixture?.state === 'open' && fixture.agent && fixture.checks.length && fixture.checks.every(c => c.state === 'success') && fixture.reviewers.includes('maya') && !fixture.reviews.some(r => r.author === 'maya' && r.state !== 'commented'), `${site}: open passed agent fixture awaits maya`)
    await open(w, `${slug}/pulls?${flags}`)
    const next = $(w, '.repo-pulls-next')
    check(next?.textContent.includes('Open the next one to review') && next.classList.contains('repo-ui-btn-primary'), `${site}: requested review has one solid next action`)
    check(all(w, '#repo-content .repo-ui-btn-primary').length === 1, `${site}: list has exactly one primary`)
    for (const path of [`pull/${number}`, 'pulls', 'stack']) {
      await open(w, `${slug}/${path}?${flags}`)
      check($(w, '#repo-content').textContent.includes('Checks passed. Your review is next.'), `${site}/${path}: maya receives review handoff`)
      await open(w, `${slug}/${path}?${flags.replace('as=in', 'as=out')}`)
      check(!$(w, '#repo-content').textContent.includes('Your review is next.'), `${site}/${path}: visitor never receives personal review handoff`)
    }
    // Everyone has already reviewed: no invented primary, and no agent verdict.
    for (const item of data('pulls')) w.sessionStorage.setItem(`repo-pulls-v1:${slug}:pull:${item.n}`, JSON.stringify({ ...item, reviewers: ['cora'], reviews: [{ author: 'cora', state: 'approved', date: item.updated, body: 'Reviewed.' }] }))
    await open(w, `${slug}/pulls?${flags}`)
    check(!$(w, '.repo-pulls-next') && $(w, '#repo-content').textContent.includes('Nothing waits on your review.'), `${site}: quiet no-review state`)
    check($(w, '#repo-content').textContent.includes('Checks passed.') && !$(w, '#repo-content').textContent.includes('Your review is next.'), `${site}: other reviewers see Checks passed`)
    w.sessionStorage.clear()
    for (const path of ['settings', 'settings/models', 'issues/new', 'bug']) for (const width of [1440, 1600, 1439, 1280, 390]) {
      const fresh = await boot(`${slug}/${path}?${flags}`, width, { 'repo-ask-open': 'true' })
      check(Boolean($(fresh, '#repo-ask-panel')) === (width >= 1440), `${site}/${path}@${width}: fresh form docking boundary`)
      await fresh.happyDOM.close()
    }
    const prompt = data('repo').config.home?.find(b => b.type === 'prompt')
    if (prompt) for (const as of ['in', 'out']) {
      const fresh = await boot(`${slug}?${flags.replace('as=in', `as=${as}`)}&guest=ok`)
      check($(fresh, '.repo-frame-ask-heading h2')?.textContent === prompt.title.replaceAll('{package}', 'the workspace'), `${site}/${as}: configured home prompt title`)
      check($(fresh, '#repo-ask-input')?.placeholder === prompt.placeholder.replaceAll('{package}', 'the workspace'), `${site}/${as}: configured home placeholder`)
      await fresh.happyDOM.close()
    }
    await open(w, `${slug}/runs?${flags}`)
    check($(w, '.repo-runs-nav-inbox')?.textContent.includes('Run approvals') && !$(w, '.repo-runs-nav-inbox')?.textContent.includes('Waiting on you'), `${site}: run approvals have their own label`)
    if (site === 'default') {
      for (const n of [34, 35]) {
        await open(w, `${slug}/pull/${n}?${flags}`)
        check(!$(w, '#repo-content').textContent.includes('Your review is next.'), `default/#${n}: failure/approval retained`)
      }
      for (const role of ['member', 'reader']) {
        await open(w, `${slug}/blob/main/src/router.ts?L=40-52&todo=1&${flags.replace('role=member', `role=${role}`)}`)
        check(!$(w, '[aria-label="Copy permalink"]')?.classList.contains('repo-ui-btn-primary'), `default/${role}: TODO makes permalink quiet`)
        check(all(w, '#repo-content .repo-ui-btn-primary').length === 1, `default/${role}: TODO owns the only view primary`)
      }
      await open(w, `${slug}/branches/main/terminal?${flags.replace('data=full', 'data=empty')}`)
      const link = all(w, '#repo-content a').find(a => a.textContent === 'Open branches')
      check(link?.title === '/branches' && !link.classList.contains('repo-ui-btn-primary') && link.getAttribute('href').split('?')[0].endsWith('/branches'), 'default: terminal empty link is quiet and navigates')
      await open(w, `${slug}/runs?${flags}`)
      await send(w, 'cancel run')
      check($(w, '.repo-frame-confirm [name="run"]'), 'Plain request with missing run opens the registered input form')
      check(!w.location.hash.includes('confirm=cancel'), 'Missing run cannot start cancellation')
      for (const auth of [flags.replace('as=in', 'as=out') + '&guest=ok', flags.replace('role=member', 'role=reader')]) {
        await open(w, `${slug}/runs?${auth}`)
        await send(w, 'cancel run-512')
        check(!w.location.hash.includes('confirm=cancel') && !$(w, '.repo-runs-confirm'), 'Plain request preserves signed-out and reader authorization')
      }
      for (const text of ['cancel run-512', '/run.cancel run-512']) {
        await open(w, `${slug}/runs?${flags}`)
        await send(w, text)
        check(w.location.hash.includes('/runs/run-512?') && w.location.hash.includes('confirm=cancel') && $(w, '.repo-runs-confirm'), `default: ${text} opens the same run-cancel form`)
        check($(w, '.repo-runs-confirm')?.textContent.includes('Cancel'), 'Cancel still awaits the person')
      }
      await open(w, `${slug}?${flags}`)
      await send(w, 'make a TODO for issue 29')
      check($(w, '.repo-issues-confirm') || $(w, '.repo-frame-confirm'), 'default: plain TODO request opens its existing act form')
      await open(w, `${slug}/issues/29?${flags}`)
      check(!$(w, '#repo-content').textContent.includes('made a TODO'), 'plain request does not create a TODO without confirmation')
    }
    if (site === 'effeck-site') for (const tab of ['', '/commits', '/checks', '/files']) {
      await open(w, `${slug}/pull/103${tab}?${flags}`)
      check($(w, '.repo-pulls-title-status')?.textContent.includes('Uncommitted proposal') && !$(w, '.repo-pulls-title-status')?.textContent.includes('merge'), `Effeck #103${tab}: truthful uncommitted status`)
    }
    if (site === 'effect') {
      await open(w, `${slug}?${flags}`)
      const strip = $(w, '.repo-code-home-evidence .repo-issues-receipt')
      const accepted = all(w, '.repo-code-home-evidence .repo-issues-receipt li').find(li => li.querySelector('strong')?.textContent === 'Accepted')
      check(accepted?.querySelector('time')?.dateTime === '2026-10-06T11:20:00Z', 'Effect: Accepted stage is dated')
      check(strip?.textContent.includes('Landed by maya') || strip?.textContent.includes('On main'), 'Effect: final stage names a person or On main')
      await open(w, `${slug}?${flags}&package=sql-pg`)
      check($(w, '.repo-frame-ask-heading h2')?.textContent === 'Ask about @effect/sql-pg', 'Effect: docked home prompt uses package scope')
    }
  } finally { await w.happyDOM.close() }
  console.log(site, counts[site])
}
writeFileSync(join(tmpdir(), 'qa-pm-b' + (build.startsWith(tmpdir()) ? '-before' : '') + '-results.json'), JSON.stringify({ checks, counts, failures, identities }, null, 2))
console.log(JSON.stringify({ checks, failures }, null, 2))
assert.equal(failures.length, 0, 'PM B regressions')
