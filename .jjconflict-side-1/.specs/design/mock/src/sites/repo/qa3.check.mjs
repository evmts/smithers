/* Stage 3 regressions on the shipped React bundle; layout awaits Chromium. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const mock=resolve(dirname(fileURLToPath(import.meta.url)),'../../..')
const req=createRequire(resolve(mock,'../../../apps/app/package.json'))
const {Window}=await import(req.resolve('happy-dom'))
const w=new Window({url:'http://localhost/?still=1',width:1440,height:900})
const wait=ms=>new Promise(r=>setTimeout(r,ms))
let checks=0
const check=(v,m)=>{assert.ok(v,m);checks++}
const qs=s=>w.document.querySelector(s), all=s=>[...w.document.querySelectorAll(s)]
const text=()=>qs('#repo-content')?.textContent??''
const base='smithers.sh/effeck/effeck'
const fixture=name=>JSON.parse(readFileSync(`${mock}/src/sites/repo/fixtures/data/effeck__effeck/${name}.json`,'utf8'))
const now=Date.parse(fixture('MOCK_NOW'))
for(const issue of fixture('issues'))for(const [stage,entry] of Object.entries(issue.receipt??{}))check(Date.parse(entry.date)<=now,`#${issue.n} ${stage}: receipt precedes fixture clock`)
const gate=fixture('evals')[0]
check(gate.history.length===0&&gate.unexecuted&&gate.runnable===false&&gate.latest.state==='inconclusive','Invalid holdout is fail-closed in data')
check(gate.cases.every(c=>c.actual===null&&!c.passed&&c.diagnostics===null),'Unavailable actuals never inherit expected outputs or pass verdicts')
const member='as=in&role=member&net=ok&data=full&host=hosted&hosted=up&landing=install&guest=off'
const visitor=member.replace('as=in','as=out').replace('role=member','role=reader')
const open=async(path,flags=member)=>{const [p,q]=path.split('?');const query=new URLSearchParams();for(const [k,v] of new URLSearchParams(flags))query.set(k,v);for(const [k,v] of new URLSearchParams(q))query.set(k,v);w.location.hash=`#/${base}${p?'/'+p:''}?${query}`;await wait(140)}
const before=(a,b)=>Boolean(a?.compareDocumentPosition(b)&4)
try {
 w.document.body.innerHTML='<div id="root"></div>'
 const html=readFileSync(`${mock}/dist-codex/effeck-site/index.html`,'utf8')
 w.eval('(function(){'+html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]+'})()');await wait(200)
 await open('evals/convert-golden')
 check(text().includes('Holdout invalid · gate not run'),'Contaminated source validation cannot be the model gate')
 check(text().includes('16/20 actual outputs')&&text().includes('including the hero'),'Threshold is held-out actual model outputs plus hero')
 check(text().includes('Illustrative expected-source validation · 14/20 · excluded from gate'),'14/20 validation is explicitly excluded')
 check(!qs('.repo-evals-history svg')&&!qs('.repo-evals-case-pass'),'No fabricated gate history or passed model outputs')
 for(const name of ['model','prompt','compiler','dependencies']) check(all('.repo-evals-gate dt').some(e=>e.textContent===name+' digest'),`${name} identity cannot be silently omitted`)
 const cases=w.__SITE__.screens.filter(s=>s.id.startsWith('effeck-site-golden-case-'))
 check(cases.length===20,'All 20 selected-case screen IDs retained')
 for(const c of cases){
  await open(c.route.split(base+'/')[1])
  const entry=qs('.repo-evals-selected')
  check(entry?.textContent.includes(new URLSearchParams(c.route.split('?')[1]).get('case')),`${c.id}: selected case visible`)
  check(before(entry,qs('.repo-evals-facts')),`${c.id}: case before suite metrics/history`)
  check(w.document.activeElement===entry,`${c.id}: focus brings case evidence into view`)
  check(entry.querySelectorAll('pre').length===2&&entry.textContent.includes('Model conversion not run.')&&entry.textContent.includes('No actual model output to compile.'),`${c.id}: distinct input/reference/missing model and diagnostics`)
 }
 for(const [flags,label] of [[visitor,'Sign in to run'],[member.replace('role=member','role=reader'),'Members can run evals.']]){
  await open('evals/convert-golden',flags)
  check(text().includes(label)&&!all('#repo-content button').some(b=>b.textContent==='Run this eval'),'Reader has no runnable control')
 }
 for(const state of ['','&net=slow','&net=error','&data=empty']){
  await open('evals',member+state)
  check(!qs('.repo-evals-list'),'Golden tab and legacy index both open the declared subject')
  if(state.includes('slow'))check(text().includes('Loading converter golden set'),'Suite-specific loading')
  if(state.includes('error'))check(text().includes('Retry'),'Error has Retry')
  if(state.includes('empty'))check(text().includes('Open golden cases')&&text().includes('.smithers/flows/convert/golden/'),'Suite empty links actual cases')
 }
 await open('issues?q=is:fixed-by-agents')
 const rows=all('.repo-issues-list-row')
 check(rows.length===1&&rows[0].textContent.includes('#31')&&!rows[0].textContent.includes('#32'),'Only closed landed accepted Effeck issue is fixed')
 check(qs('.repo-issues-fix-sha')?.textContent==='8fadacb5'.slice(0,7),'Tracker links seven-character main SHA')
 for(const flags of [member,visitor]){
  await open('',flags)
  check(qs('.repo-code-home-fix')?.textContent.includes('8fadacb')&&!qs('.repo-code-home-evidence-strip'),'Home shows compact dated main evidence')
  check(all('.repo-code-home-fix').length===1,'Open/unlanded issues excluded from home')
  check(before(qs('.repo-code-home-intro'),qs('.repo-code-home-links')),'Configured intro precedes links')
  check(all('.repo-ui-sidebar h2, .repo-ui-sidebar h3').every(e=>e.textContent === 'Releases'),'No extra home sidebar sections')
 }
 await open('',visitor)
 check(!qs('.repo-frame-ask')&&!qs('.repo-code-home-block input'),'Guest-off has no live Ask inputs')
 const signin=all('.repo-code-home-block button').find(e=>e.textContent.startsWith('Sign in to ask about'))
 check(signin&&!signin.classList.contains('repo-ui-btn-primary'),'Guest-off has one outline sign-in prompt')
 await open('pull/103')
 check(text().includes('Uncommitted proposal')&&!text().includes('All checks passed'),'Uncommitted PR does not fabricate commits/checks')
 await open('pull/103/commits')
 check(text().includes('Commit history is unavailable.'),'Unavailable proposal commits are explained')
 await open('flows/convert-golden')
 for(const label of ['Held-out inputs','Model conversions','Compile actual outputs','Record gate + digests'])check(text().includes(label),`Graph stage: ${label}`)
 await open('stack')
 check(qs('.repo-pulls-stack-state-ready')?.textContent==='Checks incomplete','Pending check fixture cannot become a passed-check verdict')
 check(!qs('.repo-pulls-stack-state-ready [aria-label="approved"]')&&text().includes('You merge on GitHub.'),'No agent approval icon; person merges')
 await open('settings/models')
 check(all('#repo-content a').some(a=>a.textContent==='Open install instructions'&&a.getAttribute('href').includes('docs/installation')),'Hosted model hold offers installation above provider list')
 const docs=['001-onboarding','getting-started/002-why-effect','getting-started/004-installation','error-management/015-unexpected-errors','setup/effeck-cli']
 for(const slug of docs){
  await open('docs/user/src/'+slug)
  check(qs('.repo-docs-warning')?.textContent.includes('not suitable for production'),'Product qualification remains outside verbatim source')
  if(slug==='001-onboarding')check(text().includes('production-ready systems'),'Onboarding preserves the source quotation (PM d-7oejn2)')
  check(qs('.repo-docs-code [class^="repo-code-token-"]'),'Syntax highlighting retained')
  if(slug.endsWith('installation'))check(all('.repo-docs-code pre').some(p=>p.textContent.startsWith('Set up VibeLang in this project:')&&!p.textContent.includes('```')),'Nested agent fence becomes clean copyable code')
  if(slug.endsWith('unexpected-errors'))check(all('.repo-docs-code-toolbar > span').some(s=>s.textContent==='VibeLang'),'Vibe fence displays the upstream language name')
  await open('docs/user/src/'+slug+'?ask=1')
  if(!slug.endsWith('001-onboarding'))check(!qs('.repo-frame-ask')?.textContent.includes('What does string!!Users mean?'),'Ask suggestions follow current article')
 }
 await open('issues/50?act=implement')
 check(text().includes('Install')||text().includes('locally'),'Held implementation has a local next step')
 check(qs('.repo-frame-ask'),'Held confirmation keeps Ask docked at 1440')
 console.log(`PASS ${checks} stage 3 assertions; 20 selected cases; existing screen IDs retained`)
} finally {await w.happyDOM.close()}
