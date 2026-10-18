/* Screenshot regressions on the actual built catalogs. Happy DOM verifies content and CSS contracts;
 * Chromium layout, overflow and screenshots remain the orchestrator's checks. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..')
const req=createRequire(resolve(root,'../../../apps/app/package.json'))
const {Window}=await import(req.resolve('happy-dom'))
const buildDir=process.argv.find(a=>a.startsWith('--build-root='))?.slice(13)??resolve(root,'dist-codex')
const wait=(ms=65)=>new Promise(r=>setTimeout(r,ms))
const flags='as=in&role=member&net=ok&data=full&landing=open&host=install&model=connected&still=1'
const failures=[];let checks=0,scanned=0
const check=(value,why)=>{checks++;if(!value)failures.push(why)}
const plural=/\b1\s+(?:(?:open|changed|more|public|symbol)\s+)?(?:branches|tags|releases|commits|files|packages|runs|issues|checks|cases|results|comments|pull requests|members|flows|lines|minutes|seconds|hours|days|weeks|months|years|errors|warnings|conversations|tokens|suites|agents|models|approvals|decisions|changes|entries)\b/gi
const fixture=(slug,name)=>JSON.parse(readFileSync(resolve(root,'src/sites/repo/fixtures/data',slug.replace('/','__'),name+'.json'),'utf8'))
const seen={}
for(const [site,slug,pr] of [['default','maya/tinyhttp',34],['smithers-site','smithers-canary/smithers',3723],['effeck-site','effeck/effeck',103],['effect','Effect-TS/effect',101]]) {
 const w=new Window({url:'http://localhost/?still=1',width:390,height:844})
 const $=s=>w.document.querySelector(s),all=s=>[...w.document.querySelectorAll(s)]
 const open=async path=>{w.location.hash='#/smithers.sh/'+slug+(path?'/' + path:'');await wait()}
 try {
  const html=readFileSync(resolve(buildDir,site,'index.html'),'utf8')
  w.document.body.innerHTML='<div id="root"></div>'
  w.document.head.innerHTML=[...html.split('</head>')[0].matchAll(/<style>([\s\S]*?)<\/style>/g)].map(x=>x[0]).join('')
  w.eval('(function(){'+html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]+'})()');await wait(180)
  seen[site]={screens:w.__SITE__.screens.length,routes:w.__SITE__.routes.length}
  const people=fixture(slug,'people'),viewer=people.find(p=>p.role==='owner').login
  const approvals=fixture(slug,'approvals'),stack=fixture(slug,'stack'),pulls=fixture(slug,'pulls')
  const expected=everyone=>approvals.filter(a=>a.state==='waiting'&&(everyone||a.askedOf===viewer)).length
   +stack.filter(s=>s.state==='needs-answer'&&(everyone||s.owner===viewer)&&!approvals.some(a=>a.run===s.run&&a.askedOf===s.owner&&a.question===s.question?.text)).length
   +pulls.filter(p=>['open','draft'].includes(p.state)&&p.reviewers.some(v=>(everyone||v===viewer)&&!p.reviews.some(r=>r.author===v&&r.state!=='commented'))).length
  for(const everyone of [false,true]) {
   await open(`approvals?${flags}${everyone?'&filter=everyone':''}`)
   for(let attempt=0;attempt<30&&!$('h1 .repo-ui-counter');attempt++)await wait(50)
   const count=Number($('h1 .repo-ui-counter')?.textContent)
   check(count===expected(everyone),`${site}: distinct ${everyone?'everyone':'personal'} decision count (${count}/${expected(everyone)})`)
   if(!everyone)check(Number($('.repo-frame-inbox .repo-ui-counter')?.textContent)===count,`${site}: header equals personal inbox`)
   check(all('#repo-content .repo-runs-approval, #repo-content .repo-runs-stack-question, #repo-content .repo-runs-inbox-row').length===count,`${site}: one row per decision`)
   check(!all('#repo-content a').some(a=>a.textContent==='Review pull'),`${site}: Review label`)
  }
  if(site==='default') {
   await open(`approvals?${flags}`)
   check($('h1 .repo-ui-counter')?.textContent==='4','One run approval plus three review requests, CORS counted once: 4')
   const card=all('#repo-content .repo-runs-approval').find(x=>x.textContent.includes('Choose the CORS'))
   check(card?.textContent.includes('Require explicit CORS origins with credentials')&&card?.textContent.includes('#33')&&card?.textContent.includes('#34'),'Run approval names Stack context')
   card?.querySelector('[title="/approval.answer approval-cors Throw a configuration error"]')?.click();await wait()
   card?.querySelector('[title="/approval.answer.confirm approval-cors Throw a configuration error"]')?.click();await wait()
   check($('h1 .repo-ui-counter')?.textContent==='3','Answer decrements distinct count once')
   check(JSON.parse(w.sessionStorage.getItem('repo-pulls-v1:maya/tinyhttp:stack')??'[]').find(s=>s.id==='todo-33')?.state==='working','Answer resolves linked Stack question')
   check(JSON.parse(w.sessionStorage.getItem('repo-runs:maya/tinyhttp')??'{}').approvals?.['approval-cors']?.state==='approved','Person answers run approval')
   await open(`stack?${flags}`)
   check(!$('#repo-content').textContent.includes('When credentials is true and origin is *'),'Stack no longer asks the answered decision')
   w.sessionStorage.removeItem('repo-pulls-v1:maya/tinyhttp:stack')
   w.sessionStorage.setItem('repo-runs:maya/tinyhttp',JSON.stringify({runs:{},approvals:{}}))
   await open(`?${flags}`)
   await open(`stack?${flags}`)
   $('[title="/stack.answer todo-33 Throw a configuration error"]')?.click();await wait()
   check(JSON.parse(w.sessionStorage.getItem('repo-runs:maya/tinyhttp')??'{}').approvals?.['approval-cors']?.state==='approved','Stack answer resolves the same run approval')
   await open(`approvals?${flags}`)
   check($('h1 .repo-ui-counter')?.textContent==='3','Stack answer removes one decision from inbox')
   await open('flows/implement-issue?as=out&net=ok&data=full')
   check(!$('.repo-flows-trigger button'),'Signed-out triggers are text')
   check(!$('#repo-content').textContent.includes('Sign in to change triggers'),'No second sign-in sentence')
   check(all('#repo-content [title="/signin"]').length===1,'One view sign-in')
   await open(`issues/new?${flags}`)
   check($('.repo-issues-new-heading')?.textContent.includes('Issues/New issue'),'New issue breadcrumb separator')
  }
  for(const tab of ['', '/commits','/checks','/files']) {
   await open(`pull/${pr}${tab}?${flags}`)
   const header=$('.repo-pulls-detail-header')
   if(pulls.find(p=>p.n===pr)?.agent) {
    const person=pulls.find(p=>p.n===pr).agent.for
    check(header?.textContent.split(`for ${person}`).length===2,`${site}${tab}: requester once`)
    check(!$('.repo-pulls-agent-context')?.textContent.includes('for '),`${site}${tab}: second line excludes requester`)
   }
   if(site==='effeck-site')check(header?.textContent.includes('Uncommitted proposal')&&!header?.textContent.includes('0 commits'),`${tab}: proposal header does not invent commits`)
  }
  if(site==='effect') {
   await open(`docs/sql-pg/PgClient?${flags}&package=sql-pg`)
   check($('.effect-scope-picker')&&!$('.effect-docs-package-select'),'One docs package picker')
   await open(`releases/plan?${flags}`)
   check($('.repo-frame .repo-ui-tabs [aria-current="page"]')?.textContent.includes('Code'),'Release plan selects Code')
   check(!all('code').some(c=>c.textContent==='Preview needed'),'Preview needed in body face')
  }
  // CSS/focus contracts at both settings; these are not measured layout assertions.
  if(site==='default') {
   const askScreen=w.__SITE__.screens.find(screen=>screen.id==='code-home-ask-agent-approval')
   for(const width of [1440,390]) {
    w.happyDOM.setViewport({width,height:900})
    w.location.hash='#/'+askScreen.route;await wait(140)
    const input=$('#repo-ask-input');input?.focus();await wait()
    check(input&&w.getComputedStyle(input).outlineStyle==='none',`${width}: only composer container owns focus ring`)
    const panel=$('#repo-ask-panel'),heading=$('.repo-frame-ask-heading')
    if(panel&&heading){
     panel.getBoundingClientRect=()=>({top:20})
     heading.getBoundingClientRect=()=>({bottom:124})
     w.dispatchEvent(new w.Event('resize'))
     check(panel.style.getPropertyValue('--repo-ask-header-height')==='104px',`${width}: card clearance tracks actual sheet header`)
    }
    if(width===390)check(w.getComputedStyle($('.repo-frame-crumbs')).display==='none','Phone omits truncated duplicate breadcrumb')
   }
  }
  if(site==='effect') {
   await open(`?${flags}`)
   const controls=$('.effect-scope-controls'),summaries=all('.effect-scope-controls > details > summary')
   check(controls&&w.getComputedStyle(controls).flexWrap==='nowrap','Phone branch and package selectors share a row')
   check(summaries.length===2&&summaries.every(node=>w.getComputedStyle(node).justifyContent==='flex-start'),'Phone selectors align labels left')
   check(summaries.length===2&&w.getComputedStyle(summaries[0]).font===w.getComputedStyle(summaries[1]).font,'Phone selectors share a body face')
  }
  w.sessionStorage.clear()
  for(const screen of w.__SITE__.screens) {
   w.location.hash='#/'+screen.route;await wait(35);scanned++
   const content=$('#root')
   if(!content)continue
   // Source snippets are data, not UI count labels.
   const clone=content.cloneNode(true);clone.querySelectorAll('pre,script,style').forEach(n=>n.remove())
   const samples=[clone.textContent,...[...clone.querySelectorAll('[aria-label]')].map(n=>n.getAttribute('aria-label'))]
   for(const sample of samples){plural.lastIndex=0;const hits=[...sample.matchAll(plural)].map(x=>x[0]);check(!hits.length,`${site}/${screen.id}: singular count labels: ${hits.join(', ')}`)}
   if(/GitHub sync failed|Last sync failed/i.test($('#repo-content [role="alert"]')?.textContent??'')) {
    check($('.repo-frame-github')?.classList.contains('repo-frame-sync-error'),`${site}/${screen.id}: sync failure body has failed header chip`)
    check(!$('.repo-frame-github')?.textContent.includes('Synced with GitHub'),`${site}/${screen.id}: no contradictory successful sync`)
   }
   if(site==='smithers-site'&&/^(smithers-site-(home|receipt-|issue$|fixed-by-agents|commit$)|code-home-smithers)/.test(screen.id)) {
    check(!content.textContent.includes('Evidence unavailable'),`${screen.id}: omit missing queue evidence`)
    for(const stepper of all('.repo-issues-receipt')) {
     check(stepper.children.length===4,`${screen.id}: four recorded queue stages`)
     const disclosure=stepper.closest('.repo-issues-receipt-disclosure')
     check(disclosure&&!disclosure.open,`${screen.id}: phone stages start behind a disclosure`)
     check(disclosure?.querySelector('summary')?.textContent==='Stages',`${screen.id}: stages can be opened by name`)
     check(!stepper.textContent.includes('In review'),`${screen.id}: no invented PR stage`)
     check(stepper.textContent.includes('On main')&&!/Landed by (smithers|agent)/i.test(stepper.textContent),`${screen.id}: truthful human/no-approver label`)
     check(!all('.repo-issues-receipt strong a').length,`${screen.id}: labels are not evidence links`)
    }
    if(all('.repo-issues-receipt').length&&/receipt-|issue$/.test(screen.id))check(!$('.repo-issues-evidence-facts')&&$('.repo-issues-main-evidence a[href*="/commit/"]'),`${screen.id}: inline remote-main receipt`)
   }
  }
 } finally { await w.happyDOM.close() }
}
console.log(JSON.stringify({checks,scanned,catalogs:seen,failures},null,2))
assert.equal(failures.length,0,'Screenshot regression failures')
