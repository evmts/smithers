/* Fidelity regressions on the built entry points, including a genuinely fresh hash load.
 * Happy DOM checks behavior; measured Chromium layout belongs to the orchestrator. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..')
const req=createRequire(resolve(root,'../../../apps/app/package.json'))
const {Window}=await import(req.resolve('happy-dom'))
const builds=process.argv.find(x=>x.startsWith('--build-root='))?.slice(13)??resolve(root,'dist-codex')
const wait=(ms=95)=>new Promise(r=>setTimeout(r,ms))
const flags='as=in&role=member&net=ok&data=full&host=install&landing=open&model=connected'
let checks=0;const failures=[],windows=[]
const check=(v,m)=>{checks++;if(!v)failures.push(m)}
const htmls=new Map()
const boot=async(site,path,width=1440,saved={})=>{
 const w=new Window({url:`http://localhost/?still=1#/smithers.sh/${path}`,width,height:900});windows.push(w)
 // Unlike the old harness: no provider seeding and no navigation after startup.
 for(const [k,v] of Object.entries(saved))w.sessionStorage.setItem(k,v)
 const html=htmls.get(site)??readFileSync(resolve(builds,site,'index.html'),'utf8');htmls.set(site,html)
 w.document.body.innerHTML='<div id="root"></div>'
 w.document.head.innerHTML=[...html.split('</head>')[0].matchAll(/<style>([\s\S]*?)<\/style>/g)].map(x=>x[0]).join('')
 w.eval('(function(){'+html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]+'})()');await wait(180)
 return w
}
const $=(w,s)=>w.document.querySelector(s),all=(w,s)=>[...w.document.querySelectorAll(s)]
const open=async(w,path)=>{w.location.hash='#/smithers.sh/'+path;await wait()}
try{
 for(const [site,slug] of [['default','maya/tinyhttp'],['smithers-site','smithers-canary/smithers'],['effeck-site','effeck/effeck'],['effect','Effect-TS/effect']]){
  for(const suffix of ['', '/issues']){
   for(const width of [1440,1280,390]){
    const w=await boot(site,`${slug}${suffix}?as=in&role=member&net=ok&data=full`,width)
    check($(w,'.repo-frame')?.dataset.askOpen===String(width>=1440),`${site}${suffix}@${width}: fresh initial dock`)
    check(Boolean($(w,'#repo-ask-panel'))===(width>=1440),`${site}${suffix}@${width}: initial panel exists`)
    if(!suffix&&width===1440){
     check(!$(w,'#repo-content').textContent.includes('Ask in the panel')&&!$(w,'.repo-code-home-block input'),`${site}: open panel removes home prompt`)
     check(!$(w,'#repo-content [title^="/ask"].repo-ui-btn-primary'),`${site}: home Ask yields to Send`)
     check($(w,'.repo-frame-send.repo-ui-btn-primary'),`${site}: Send owns composer submit`)
     $(w,'[title="/ask.close"]')?.click();await wait()
     check($(w,'.repo-frame')?.dataset.askOpen==='false',`${site}: close works`)
     const saved=Object.fromEntries(['repo-ask-open','site-mock-flags'].map(k=>[k,w.sessionStorage.getItem(k)]).filter(([,v])=>v!==null))
     const reload=await boot(site,`${slug}?${flags}`,1440,saved)
     check(!$(reload,'#repo-ask-panel')&&reload.sessionStorage.getItem('repo-ask-open')==='false',`${site}: explicit close survives reload`)
     await reload.happyDOM.abort()
    }
    await w.happyDOM.abort()
   }
  }
  const w=await boot(site,`${slug}?${flags}`)
  console.log(`${site}: ${w.__SITE__.screens.length} screens / ${w.__SITE__.routes.length} routes`)
  // Each list's five states, scoped to the view (Ask is a separate composer surface).
  for(const path of ['blame/main/README.md','commits/main','branches','releases','search?q=router']){
   for(const [state,extra] of [['ready',flags],['loading',flags.replace('net=ok','net=slow')],['error',flags.replace('net=ok','net=error')],['empty',flags.replace('data=full','data=empty')],['signed-out',flags.replace('as=in','as=out')],['reader',flags.replace('role=member','role=reader')]]){
    await open(w,`${slug}/${path}${path.includes('?')?'&':'?'}${extra}`)
    const primaries=all(w,'#repo-content .repo-ui-btn-primary').filter(a=>!(state==='signed-out'&&a.title==='/signin'))
    check(primaries.length===0,`${site} ${path} ${state}: list has zero solid buttons (${primaries.map(a=>a.textContent)})`)
   }
  }
  for(const path of ['issues/new','settings','flows/implement-issue?run=1','branches?dialog=new']){
   await open(w,`${slug}/${path}${path.includes('?')?'&':'?'}${flags}`)
   check($(w,'#repo-ask-panel'),`${site} ${path}: form/action docks at 1440`)
  }
  const docPath={'default':'getting-started','smithers-site':'installation','effeck-site':'user/src/getting-started/004-installation','effect':'sql-pg/PgClient'}[site]
  await open(w,`${slug}/docs/${docPath}?${flags}`)
  check($(w,'.repo-docs-page-header .repo-ui-btn-primary'),`${site}: declared Docs Ask stays primary`)
  check(!$(w,'.repo-docs-code-toolbar .repo-ui-btn-primary'),`${site}: declared Docs Copy stays secondary`)
  const fixture=JSON.parse(readFileSync(resolve(root,'src/sites/repo/fixtures/data',slug.replace('/','__'),'pulls.json'),'utf8'))
  const people=JSON.parse(readFileSync(resolve(root,'src/sites/repo/fixtures/data',slug.replace('/','__'),'people.json'),'utf8'))
  const viewer=people.find(p=>p.role==='owner').login
  for(const p of fixture){
   await open(w,`${slug}/pull/${p.n}?${flags}`)
   const owed=p.state==='open'&&p.agent&&p.checks.length>0&&p.checks.every(c=>c.state==='success')&&(p.reviewers.length?p.reviewers.includes(viewer):p.agent?.for===viewer)&&!p.reviews.some(r=>r.author===viewer&&r.state!=='commented')
   const handoff=$(w,'#repo-content').textContent.includes('Your review is next')
   check(handoff===Boolean(owed),`${site} PR ${p.n}: handoff only when viewer owes open passed agent review`)
  }
  await open(w,`${slug}/pulls?q=is%3Aclosed&${flags}`)
  check(!$(w,'#repo-content').textContent.includes('Your review is next'),`${site}: closed list has no review handoff`)
  const n=fixture[0].n
  for(const tab of ['', '/commits','/checks','/files']){
   await open(w,`${slug}/pull/${n}${tab}?${flags.replace('role=member','role=reader')}`)
   check(!all(w,'#repo-content button').some(b=>!b.disabled&&/^Edit$|^Request review$|^Assign$|^Review changes$/.test(b.textContent.trim())),`${site}${tab}: no reader write controls`)
   if(tab==='/files')check(fixture.find(p=>p.n===n).files.length ? $(w,'#repo-content').textContent.includes('Members can review changes.') : !$(w,'[title^="/pull.review"]'),`${site}: reader review slot exists only for a nonempty diff`)
  }
  if(site==='effect'||site==='default'){
   for(const [id,expected] of [['effect-ci-matrix-scoped','sql-pg'],['effect-ci-matrix-excluded','platform-bun'],['effect-ci-matrix-missing','sql-pg'],['effect-ci-matrix-setup-failure',null]]){
    const route=w.__SITE__.screens.find(s=>s.id===id).route
    await open(w,route.replace('smithers.sh/',''))
    const href=$(w,'.effect-ci-actions .repo-ui-btn-primary')?.getAttribute('href')??''
    check(expected?!href:href.includes('stage=setup-bun')&&!href.includes('project='),`${id}: only a failing job has a primary`)
   }
  }
  if(site==='default'){
   for(const id of ['code-home-guest-limit','code-home-held']){
    const route=w.__SITE__.screens.find(s=>s.id===id).route
    const fresh=await boot(site,route.replace('smithers.sh/',''))
    check($(fresh,'.repo-frame')&&$(fresh,'#repo-ask-panel')&&!$(fresh,'.front-signin'),`${id}: fresh load stays in repo`)
    check($(fresh,'#repo-ask-panel')?.textContent.includes(id.endsWith('held')?"Hosted runs that change code are held.":"question limit"),`${id}: actual restriction shown`)
    await fresh.happyDOM.abort()
   }
   await open(w,`maya/tinyhttp/issues/33?${flags}`)
   check($(w,'#repo-content .repo-ui-btn-primary')?.textContent==='New issue','Issue detail primary follows Views table')
   check(!$(w,'[title="/issue.comment 33"]')?.classList.contains('repo-ui-btn-primary'),'Issue comment stays secondary')
   await open(w,`maya/tinyhttp/issues/33?${flags.replace('role=member','role=reader')}`)
   check(!all(w,'#repo-content button').some(b=>!b.disabled&&/^Edit$|^Close issue$/.test(b.textContent.trim())),'Reader cannot edit or close even their own issue')
   const commits=JSON.parse(readFileSync(resolve(root,'src/sites/repo/fixtures/data/maya__tinyhttp/commits.json'),'utf8'))
   const unreviewed=commits.find(c=>c.agent&&c.checks.some(check=>check.state==='failure'))
   await open(w,`maya/tinyhttp/commit/${unreviewed.sha}?${flags}`)
   check($(w,'.repo-history-receipt')&&!$(w,'.repo-history-receipt').textContent.includes('Unknown')&&$(w,'.repo-history-receipt').textContent.includes('Evidence unavailable'),'Missing receipt evidence has no invented actor')
   await open(w,`maya/tinyhttp/stack?filter=failed&${flags}`)
   const retry=$(w,'.repo-pulls-topbar .repo-ui-btn-primary')
   check(retry?.textContent==='Retry the first failed item','Failed filter promotes first visible retry')
   retry?.click();await wait()
   check($(w,'.repo-pulls-form-card')&&all(w,'#repo-content .repo-ui-btn-primary').length===1,'Retry confirmation has sole view primary')
   await open(w,`maya/tinyhttp/stack?filter=working&${flags}`)
   check(!$(w,'#repo-content .repo-ui-btn-primary'),'No actionable item: no Stack primary')
   for(const kind of ['new','fork','rebase','archive','sandbox']){
    await open(w,`maya/tinyhttp/branches?dialog=${kind}&branch=archive%2Fradix-router&${flags}`)
    check(all(w,'#repo-content .repo-ui-btn-primary').length===1,`${kind}: one solid dialog action`)
   }
   await open(w,`maya/tinyhttp/blob/main/src/router.ts?L=3-5&${flags.replace('role=member','role=reader')}`)
   check(!$(w,'button[title="/todo.make"]'),'Reader has no active Make TODO')
   check($(w,'#repo-content').textContent.includes('Members can make TODOs.'),'Reader TODO slot is muted permission line')
   for(const ask of ['approval','view','/box.open','/repo.import']){
    await open(w,`maya/tinyhttp?${flags}&ask=${encodeURIComponent(ask)}`)
    check(!$(w,'#repo-content [title^="/ask"].repo-ui-btn-primary'),'Ask view has no competing solid home prompt')
    check(all(w,'#repo-ask-panel .repo-ui-btn-primary').length<=1,`${ask}: one panel primary`)
   }
  }
  for(const screen of w.__SITE__.screens.filter(s=>/eval.*sign(in|ed-out)|releases-empty|docs-install/.test(s.id))){
   await open(w,screen.route.replace('smithers.sh/',''))
   check(all(w,'#repo-content .repo-ui-btn-primary').length<=1,`${site}/${screen.id}: one primary`)
   if(/releases-empty/.test(screen.id))check(!all(w,'#repo-content a').some(a=>a.textContent.includes('Version packages')),`${screen.id}: zero pending means no version action`)
   if(/docs-install/.test(screen.id)&&$(w,'.repo-docs-article')){
    check($(w,'.repo-docs-page-header .repo-ui-btn-primary'),`${screen.id}: Docs Ask stays primary`)
    check(!$(w,'.repo-docs-code-toolbar .repo-ui-btn-primary'),`${screen.id}: Copy code stays secondary`)
   }
  }
  await w.happyDOM.abort()
 }
 if(failures.length){console.error(failures.join('\n'));throw new Error(`${failures.length}/${checks} fidelity assertions failed`)}
 console.log(`PASS qa-eval1: ${checks} fresh-load, access, review, filter and primary assertions`)
} finally {for(const w of windows)await w.happyDOM.abort()}
