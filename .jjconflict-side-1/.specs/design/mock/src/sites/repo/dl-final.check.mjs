/* Delivered UI contracts for d-nl8rwa; Happy DOM does not measure browser overlap. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const req = createRequire(resolve(root, '../../../apps/app/package.json'))
const { Window } = await import(req.resolve('happy-dom'))
const build = process.argv.find(a => a.startsWith('--build-root='))?.slice(13) ?? resolve(root, 'dist-codex')
const wait = () => new Promise(r => setTimeout(r, 140))
const failures = [], counts = {}, checked = [], identities = {}
let assertions = 0
const check = (ok, why) => { assertions++; if (!ok) failures.push(why) }
const targets = new Set(['runs-run-cancel-confirm', 'runs-run-retry-confirm', 'effect-releases-plan-confirm', 'docs-anchor', 'pulls-files-review', 'pulls-files-reader', 'flows-list-run', 'wiki-proposal-confirm', 'smithers-evals-confirm', 'smithers-evals-held', 'smithers-evals-denied', 'smithers-evals-paused', 'smithers-evals-signin', 'effeck-site-eval-signin', 'effeck-site-eval-held', 'effeck-site-eval-denied'])
for (const site of ['default', 'smithers-site', 'effeck-site', 'effect']) {
 const html = readFileSync(resolve(build, site, 'index.html'), 'utf8')
 const boot = async (route, width, theme) => {
  const w = new Window({ url: `http://localhost/?still=1&theme=${theme}#/${route}`, width, height: 900 })
  w.sessionStorage.setItem('repo-ask-open', 'false')
  // Happy DOM does not resolve the app's layered token declarations.
  w.document.documentElement.style.cssText = '--font-mono: monospace; --border: #888; --text: #222; --surface: #fff';
  w.document.body.innerHTML = '<div id="root"></div>'
  w.document.head.innerHTML = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map(m => m[0]).join('')
  w.eval('(function(){' + html.match(/<script type="module">([\s\S]*?)<\/script>/)[1] + '})()')
  await wait()
  return w
 }
 const catalogWindow = await boot('__screens', 1440, 'light')
 const meta = catalogWindow.__SITE__
 const screens = meta.screens
 counts[site] = { screens: screens.length, routes: meta.routes.length }
 identities[site] = { screens: screens.map(s => ({id:s.id,route:s.route})), routes:meta.routes }
 await catalogWindow.happyDOM.close()
 const selected = screens.filter(s => /^smithers.sh\/(?:maya\/tinyhttp|smithers-canary\/smithers|effeck\/effeck|Effect-TS\/effect)(?:\/|\?)/.test(s.route) && (targets.has(s.id) || /(?:-docs(?:$|-)|^docs$)/.test(s.id)))
 for (const width of [1440, 390]) for (const theme of ['light', 'dark']) for (const screen of selected) {
  const w = await boot(screen.route, width, theme)
  const $ = s => w.document.querySelector(s), all = s => [...w.document.querySelectorAll(s)]
  const css = el => el && w.getComputedStyle(el)
  const context = `${site}/${screen.id}/${width}/${theme}`
  try {
   const frame = $('.repo-frame'), global = $('.repo-frame-global'), skip = $('.repo-frame-skip')
   check(frame && global && skip && $('#repo-content'), context + ': repo frame renders')
   if (!frame || !global || !skip) continue
   check(global.parentElement === frame && global.nextElementSibling?.classList.contains('repo-frame-workspace'), context + ': global header precedes workspace in document flow')
   check(css(global).position === 'relative' && css(global).height === (width === 390 ? '50px' : '56px'), context + ': header reserves normal-flow height')
   check(css(skip).clipPath === 'inset(50%)' && css(skip).transform.includes('translateY'), context + ': unfocused skip clipped offscreen')
   skip.focus(); check(w.document.activeElement === skip && /\.repo-frame-skip:focus\s*\{[^}]*transform:\s*none;[^}]*clip-path:\s*none/.test(html), context + ': keyboard focus reveals skip (delivered focus rule; Happy DOM caches pseudo styles)')
   skip.click(); check(w.document.activeElement === $('#repo-content'), context + ': skip reaches content')
   check(css(skip).clipPath === 'inset(50%)', context + ': skip hides after leaving focus')
   for (const paragraph of all('.repo-docs-article .repo-ui-markdown p')) check(!/^\s*\|.*\|\s*\|?\s*[-:]{2}/.test(paragraph.textContent), context + ': no raw table prose')
   for (const wrapper of all('.repo-ui-markdown-table')) {
    check(css(wrapper).overflowX === 'auto' && css(wrapper).maxWidth === '100%', context + ': local table scrollport')
    check(css(wrapper.querySelector('table')).fontSize === '14px', context + ': table 14px')
    for (const cell of wrapper.querySelectorAll('th, td')) check(css(cell).padding === '12px' && css(cell).borderTopWidth === '1px', context + ': padded bordered cells')
   }
   if (screen.id === 'smithers-site-docs' || screen.id === 'effeck-site-docs') check(all('.repo-ui-markdown-table table').length > 0, context + ': real comparison tables')
   if (screen.id === 'effeck-site-docs-004-installation') check(all('.repo-ui-markdown-table table').length >= 2, context + ': both installation matrices')
   if (/docs-hover-(?:find|signed-out)$/.test(screen.id)) {
    const trigger = $('.repo-hovers-token[data-name="find"]')
    check(all('.repo-hovers-card').length === 1 && $('.repo-hovers-card code')?.textContent.includes('Effect.Effect<User, UserNotFound, Users>'), context + ': exactly one actual compiler hover on fresh route')
    trigger?.closest('pre').dispatchEvent(new w.Event('scroll'));
    trigger?.dispatchEvent(new w.MouseEvent('mouseout', { bubbles: true }));
    await new Promise(r => setTimeout(r, 220))
    const card = $('.repo-hovers-card')
    check(card && trigger?.getAttribute('aria-expanded') === 'true', context + ': route hover survives initial pre scroll')
    check(css(card)?.padding === '12px' && css(card?.querySelector('code'))?.fontSize === '13px', context + ': tooltip type and padding')
    check(parseFloat(card?.style.left) >= 16 && parseFloat(card?.style.left) <= width - Math.min(380,width-32) - 16, context + ': tooltip horizontal gutter clamp')
   }
   if (screen.id === 'effeck-site-docs-examples-compile') {
    check(all('.repo-evals-axis-label').map(e => e.textContent).join(',') === '0,50,100', context + ': HTML axis labels')
    check(all('.repo-evals-axis-label').every(e => css(e).fontSize === '12px' && !e.closest('svg')), context + ': labels cannot scale with SVG')
    check(css($('.repo-evals-plot'))?.height === (width === 390 ? '160px' : '180px') && css($('.repo-evals-plot'))?.paddingLeft === '24px', context + ': responsive plot dimensions')
    check(!$('.repo-evals-plot svg text'), context + ': no scaled SVG text')
   }
   checked.push(context)
  } finally { await w.happyDOM.close() }
 }
 console.log('checked', site, counts[site])
}
const receipt = { assertions, checked, counts, failures, identities }
writeFileSync(join(tmpdir(), build.startsWith(tmpdir()) ? 'dl-final-before-regressions.json' : 'dl-final-regressions.json'), JSON.stringify(receipt, null, 2))
console.log(JSON.stringify({ assertions, variants:checked.length, counts, failures }, null, 2))
assert.equal(failures.length, 0, 'd-nl8rwa regression failures')
