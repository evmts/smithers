/* PM v2.1 regression checks against the real bundles. No Chromium or layout assertions. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const mock = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const req = createRequire(resolve(mock, '../../../apps/app/package.json'))
const { Window } = await import(req.resolve('happy-dom'))
const wait = () => new Promise(resolve => setTimeout(resolve, 180))
const windows = []
const open = async (w, route) => { w.location.hash = '#/'+route; await wait() }
const main = w => w.document.querySelector('#repo-content')
let checks = 0
const check = (value, why) => { assert.ok(value, why); checks++ }
const removed = []
try {
  for (const [site, slug, pull, flow] of [
    ['default','maya/tinyhttp',34,'implement-issue'],
    ['smithers-site','smithers-canary/smithers',3723,'land'],
    ['effeck-site','effeck/effeck',103,'convert-golden'],
    ['effect','Effect-TS/effect',101,'affected']
  ]) {
    const w = new Window({url:'http://localhost/?still=1#/smithers.sh/'+slug+'?as=in&role=member&net=ok&data=full'})
    w.sessionStorage.setItem('site-mock-flags', JSON.stringify({as:'in', role:'member', net:'ok', data:'full', landing:'open', hosted:'up', model:'connected'}))
    windows.push(w)
    w.document.body.innerHTML = '<div id="root"></div>'
    const html = readFileSync(`${mock}/dist-codex/${site}/index.html`,'utf8')
    w.eval('(function(){'+html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]+'})()')
    await wait()
    const base = 'smithers.sh/'+slug
    const member = 'as=in&role=member&net=ok&data=full&landing=open&hosted=up&model=connected'
    const before = JSON.parse(readFileSync(`/tmp/pm21a-${site}-before.json`,'utf8'))
    const deleted = before.screens.filter(s => !w.__SITE__.screens.some(next => next.id === s.id)).map(s=>s.id)
    for (const id of deleted) check(/^(app-card-bug-(maya-tinyhttp|smithers-canary-smithers)-conversion$|effect-ownership-|effect-ci-affected-|effect-docs-generation-|effect-package-home-(signin|denied|held|check|model-none)$)/.test(id), 'Only PM-cut screen IDs removed: '+id)
    removed.push(...deleted)
    check(w.__SITE__.screens.every(s=>!s.route.includes('/flows/101ame') && !/:suite\b/.test(s.route)), 'Concrete route parameters: '+site)
    await open(w, `${base}?${member}`)
    const tabs = [...w.document.querySelectorAll('nav[aria-label="Repository"] a')]
    check(tabs.slice(0,6).map(a=>a.textContent.replace(/\d+$/,'').trim()).join('|') === 'Code|Issues|Pull requests|Runs|Flows|Wiki', 'Tab order '+site)
    check(tabs.slice(6).every(a=>!a.querySelector('.repo-ui-counter')), 'No declared tab counters '+site)
    check(tabs[6].textContent === 'Docs', 'Docs first declared '+site)
    if (site==='effeck-site') check(tabs.find(a=>a.textContent==='Golden set').getAttribute('href').split('?')[0].endsWith('/evals/convert-golden'), 'Golden set opens its suite')
    check([...main(w).querySelectorAll('.repo-ui-sidebar-section > h2')].map(h=>h.textContent).join('|') === 'Releases', 'Sidebar is Releases only '+site)
    const headerCount = w.document.querySelector('.repo-frame-inbox .repo-ui-counter')?.textContent ?? '0'
    await open(w, `${base}/approvals?${member}`)
    check((main(w).querySelector('h1 .repo-ui-counter')?.textContent ?? '0')===headerCount, 'Header and inbox share count '+site+' header='+headerCount+' inbox='+main(w).querySelector('h1')?.textContent)
    // Every public write view exposes at most one sign-in slot and no write affordances.
    const pullNumber = JSON.parse(readFileSync(`${mock}/src/sites/repo/fixtures/data/${slug.replace('/', '__')}/pulls.json`,'utf8')).find(item=>item.state==='open')?.n ?? pull
    const paths = ['branches',`pull/${pullNumber}`,`pull/${pullNumber}/commits`,`pull/${pullNumber}/checks`,`pull/${pullNumber}/files`,'flows',`flows/${flow}`,'runs','issues','wiki']
    if (site==='smithers-site') paths.push('evals/agent')
    if (site==='effeck-site') paths.push('evals/convert-golden')
    for (const path of paths) {
      await open(w,`${base}/${path}?${member.replace("as=in","as=out")}`)
      const content=main(w)
      check(content, 'View rendered '+site+'/'+path)
      const writes=[...content.querySelectorAll('button[title],a[title],summary[title]')].filter(node => /^\/(branch\.(new|fork|rebase|archive|actions)|box\.open|pull\.(edit|assign|reviewers\.request|merge|review|comment-line|viewed)|flow\.run|eval\.run|issue\.new|wiki\.(edit|new|accept|dismiss))\b/.test(node.title))
      check(!writes.length,'Signed-out writes hidden '+site+'/'+path+': '+writes.map(n=>n.title))
      check(content.querySelectorAll('a[title="/signin"]').length<=1,'At most one primary sign-in slot '+site+'/'+path)
      check(!content.querySelector('a[href*="/approvals"]'),'Signed-out approval links hidden '+site+'/'+path)
      check(!content.textContent.includes('Waiting on you'),'Signed-out waiting filters hidden '+site+'/'+path)
    }
    await open(w,`${base}?${member.replace("as=in","as=out")}`)
    check(!main(w).querySelector('.repo-code-home-app'),'Apps hidden signed out '+site)
    check(!main(w).querySelector('[title^="/box.open"]'),'Signed-out home hides sandbox writes '+site)
    await open(w,`${base}?${member.replace("role=member","role=reader")}`)
    check(!main(w).querySelector('.repo-code-home-app'),'Apps hidden from readers '+site)
    for (const [from,to] of [['actions','runs'],['labels','issues'],['milestones','issues'],['releases/latest','releases/tag/']]) {
      await open(w,`${base}/${from}?${member}`)
      check(w.location.hash.includes(`${base}/${to}`),'GitHub redirect '+site+'/'+from)
    }
    if(site==='default') {
      await open(w,`${base}/evals?${member}`)
      check(main(w).textContent.includes('Page not found.'),'Undeclared tinyhttp Evals is not found')
    }
    if(site==='effect' || site==='default') {
      for (const path of ['settings/ownership','runs?affected=1','packages/sql-pg?check=1','docs/sql-pg?act=generate','docs/sql-pg?generation=preview','docs/sql-pg?generation=failed']) {
        await open(w,`smithers.sh/Effect-TS/effect/${path}${path.includes('?')?'&':'?'}${member}`)
        check(main(w).textContent.includes('Page not found.'),'Cut URL is not found '+site+'/'+path)
      }
    }
    console.log(`PASS ${site}: ${w.__SITE__.screens.length} screens / ${w.__SITE__.routes.length} routes; PM v2.1 navigation, access, inbox, cuts`)
  }
  writeFileSync('/tmp/pm21a-removed-screens.json',JSON.stringify([...new Set(removed)],null,2))
  console.log(`PASS ${checks} PM v2.1 assertions; ${new Set(removed).size} distinct cut screen IDs`)
} finally { for(const w of windows) await w.happyDOM.abort() }
