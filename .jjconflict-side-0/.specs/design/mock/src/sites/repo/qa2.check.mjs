/* Stage 2 regressions against the actual built React sites; no Chromium/layout claims. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const mock=resolve(dirname(fileURLToPath(import.meta.url)),'../../..')
const buildDir=process.argv.find(a=>a.startsWith('--build-root='))?.slice(13)??resolve(mock,'dist-codex')
const req=createRequire(resolve(mock,'../../../apps/app/package.json'))
const {Window}=await import(req.resolve('happy-dom'))
const wait=(ms=100)=>new Promise(resolve=>setTimeout(resolve,ms))
const member='as=in&role=member&net=ok&data=full&landing=open&host=hosted&guest=off'
const visitor='as=out&role=reader&net=ok&data=full&guest=off'
let checks=0
const check=(value,why)=>{assert.ok(value,why);checks++}
const windows=[]
const qs=(w,s)=>w.document.querySelector(s)
const all=(w,s)=>[...w.document.querySelectorAll(s)]
const text=w=>qs(w,'#repo-content')?.textContent??''
const open=async(w,path)=>{const [base,raw]=path.split('?');const query=new URLSearchParams();for(const [key,value] of new URLSearchParams(raw))query.set(key,value);w.location.hash='#/'+base+'?'+query;await wait(160)}
const click=async(w,node)=>{check(node,'Click target exists');node.click();await wait(140)}
const before=(a,b)=>Boolean(a.compareDocumentPosition(b)&4)
try {
 for(const [site,slug] of [['default','maya/tinyhttp'],['smithers-site','smithers-canary/smithers'],['effeck-site','effeck/effeck'],['effect','Effect-TS/effect']]) {
  const base=`smithers.sh/${slug}`
  const w=new Window({url:`http://localhost/#/${base}?${visitor}`,width:1440,height:900});windows.push(w)
  w.sessionStorage.setItem('repo-ask-open','true')
  w.document.body.innerHTML='<div id="root"></div>'
  const html=readFileSync(resolve(buildDir,site,'index.html'),'utf8')
  w.eval('(function(){'+html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]+'})()');await wait(200)
  for(const state of ['', '&net=slow','&net=error','&data=empty']) {
   await open(w,`${base}?${visitor}${state}`)
   check(!qs(w,'.repo-frame-composer, .repo-frame-ask'),`${site}: no guest composer, including read states`)
   check(!qs(w,'.repo-code-home-block input'),`${site}: no live guest prompt`)
   check(!qs(w,'.repo-code-home-app'),`${site}: no member tiles`)
  }
  await open(w,`${base}?${visitor}`)
  const prompt=all(w,'.repo-code-home-block button').find(b=>b.textContent.startsWith('Sign in to ask about'))
  if(site!=='default') {
   check(prompt&&!prompt.classList.contains('repo-ui-btn-primary'),`${site}: one outline sign-in prompt`)
   await click(w,prompt)
   check(w.location.hash.includes('/signin?return='),`${site}: prompt opens sign-in`)
   await open(w,`${base}?${visitor}`)
  }
  await click(w,qs(w,'.repo-frame-ask-button'))
  check(w.location.hash.includes('/signin?return='),`${site}: header Ask opens sign-in`)
  const back=new URLSearchParams(w.location.hash.split('?')[1]).get('return')
  check(back?.startsWith(base)&&!new URLSearchParams(back.split('?')[1]).has('as'),`${site}: return retains repo without pinning signed-out state`)
  await open(w,`${base}?${member}&ask=1`)
  check(qs(w,'.repo-frame-ask-button').getAttribute('aria-pressed')==='true',`${site}: header is pressed while Ask is open`)
  check(all(w,'.repo-code-home-block input, #repo-ask-input').length===1,`${site}: one Ask input per view`)
  check(!qs(w,'.repo-code-home-block input')&&!text(w).includes('Ask in the panel'),`${site}: docked Ask removes the page prompt entirely`)
 }
 const w=windows[1], base='smithers.sh/smithers-canary/smithers'
 await open(w,`${base}?${visitor}`)
 check(text(w).includes('Ask about Smithers')&&!text(w).includes('What should we work on?'),'Visitor heading uses public wording')
 assert.deepEqual(all(w,'.repo-code-home-links a').map(a=>a.textContent.trim()),['Install Smithers','Docs','Report a bug','Fixed by agents']);checks++
 await open(w,`${base}/pull/3723?${member}`)
 check(text(w).includes('Check evidence unavailable')&&!text(w).includes('All checks passed'),'Zero checks cannot pass')
 check(!all(w,'#repo-content a').some(a=>a.textContent.trim()==='Review changes'),'Missing change evidence cannot offer review')
 for(const n of [4218,4217,4214,4209]) {
  await open(w,`${base}/issues/${n}?${member}`)
  check(all(w,'.repo-issues-receipt > li').length===4,`#${n}: four recorded queue milestones`)
  check(!text(w).includes('In review')&&!text(w).includes('Evidence unavailable'),`#${n}: absent queue evidence is omitted`)
  check(!text(w).includes('No linked changes')&&qs(w,'.repo-issues-main-evidence a[href*="/commit/"]'),`#${n}: actual main commit is linked`)
 }
 for(const id of ['review-seeded-bugs','authoring','recommend','swebench','agent']) {
  await open(w,`${base}/evals/${id}?${member}`)
  check(text(w).includes('Recorded snapshot')&&!qs(w,'.repo-evals-history svg'),`${id}: no invented time series or dates`)
  check(id==='swebench'
   ? text(w).includes('Imported snapshot · not in this repository') && !qs(w,'.repo-evals-history a[href*="/blob/"]')
   : qs(w,'.repo-evals-history a[href*="/blob/"]'),`${id}: repository sources link files; imported snapshots disclose their origin`)
  if(id==='authoring') {
   check(text(w).includes('Unexecuted')&&!/10\/10 pass|Last run|Oct 17|100%/.test(text(w)),'Authoring has no passed count, score or execution date')
   check(!qs(w,'.repo-evals-case-pass'),'Unexecuted cases cannot pass')
  }
 }
 for(const [flags,expected] of [[visitor,'Sign in to run'],[member.replace("role=member","role=reader"),'Members can run evals.']]) {
  await open(w,`${base}/evals/agent?${flags}`)
  check(text(w).includes(expected)&&!all(w,'button').some(b=>b.textContent==='Run this eval'),'Read-only eval action is truthful')
 }
 for(const suffix of [`${member}`,`${member}&landing=install`,member.replace("role=member","role=reader"),visitor]) {
  await open(w,`${base}/evals/agent?${suffix}&act=run`)
  check(before(qs(w,'.repo-evals-confirm'),qs(w,'.repo-evals-facts')),'Recovery/action precedes metrics')
 }
 await open(w,`${base}/evals?${member}&data=empty`)
 check(all(w,'a').some(a=>a.textContent==='Read eval setup'&&a.href.includes('/blob/')),'Empty evals have an actionable format reference')
 await open(w,`${base}/docs?${member}`)
 check(qs(w,'.repo-docs-scope')?.textContent.includes('CLI-generated coding flows'),'Docs scope the recovery claim')
 check(!qs(w,'.repo-docs-article')?.textContent.includes('sidebar:'),'Docs front matter remains hidden')
 await open(w,`${base}/docs/installation?${member}`)
 check(!qs(w,'.repo-docs-code-toolbar .repo-ui-btn-primary'),'Copy code stays secondary')
 check(qs(w,'.repo-docs-page-header .repo-ui-btn-primary'),'Declared Docs action stays Ask')
 await open(w,`${base}/blob/main/.dockerignore?${member}`)
 check(!text(w).includes("aren't part of the mock")&&text(w).includes('node_modules'),'Complete .dockerignore source is present')
 const history=w.__SITE__.screens.find(s=>s.id==='smithers-site-file-history')
 await open(w,history.route+'?'+member)
 check(all(w,'.repo-history-commit-row').length>0&&!text(w).includes("Couldn't load commits"),'Full-data file history shows exported changes')
 const commit=w.__SITE__.screens.find(s=>s.id==='smithers-site-commit')
 await open(w,commit.route+'?'+member)
 check(!text(w).includes('Awaiting review')&&!text(w).includes('Not merged')&&!text(w).includes('Evidence unavailable'),'Queue receipt omits absent PR evidence')
 const commits=JSON.parse(readFileSync(resolve(mock,'src/sites/repo/fixtures/data/smithers-canary__smithers/commits.json'),'utf8'))
 for(const item of commits.filter(c=>c.agent&&!c.pull&&c.branches.includes('main'))) {
  await open(w,`${base}/commit/${item.sha}?${member}`)
  const receipt=qs(w,'.repo-history-receipt')
  check(receipt,`${item.sha}: agent receipt renders`)
  assert.deepEqual([...receipt.querySelectorAll('dt')].map(n=>n.textContent),['Run','On main']);checks++
  check(receipt.textContent.includes(item.sha.slice(0,7))&&!receipt.textContent.includes('Evidence unavailable'),`${item.sha}: evidenced main SHA, no absent rows`)
  const credit=qs(w,'.repo-history-agent-credit').textContent
  check(item.agent.for===item.author?!credit.includes(' for '):credit.includes(' for '+item.agent.for),`${item.sha}: requester shown only when different`)
 }
 for(const path of ['issues','issues?q=is:fixed-by-agents','issues/4218','issues/new','settings/sync']) {
  await open(w,`${base}/${path}${path.includes('?')?'&':'?'}${member}&net=error`)
  const chip=qs(w,'.repo-frame-github'),body=qs(w,'#repo-content [role="alert"]')
  check(chip?.classList.contains('repo-frame-sync-error')&&body?.textContent.includes('GitHub sync failed'),`${path}: shared failed sync state`)
  check(body.textContent.includes(chip.textContent.split('·')[1].trim()),`${path}: header and body share failure reason`)
  check(!chip.textContent.includes('Synced with GitHub'),`${path}: no contradictory success chip`)
  await click(w,qs(w,'#repo-content [title="/retry"]'))
  check(qs(w,'.repo-frame-github')?.textContent.includes('Synced with GitHub')&&!qs(w,'#repo-content [role="alert"]'),`${path}: Retry recovers header and body together`)
 }
 // Guest Ask through sign-in: the return reopens Ask (ask=1) but never carries the typed draft, which would ride
 // through the OAuth redirect and server logs (Design lead d-n8376m, 2026-10-18; landed frame .17 matches).
 await open(w,`${base}/blob/main/.dockerignore?${visitor}&L=1-2`)
 await click(w,qs(w,'.repo-code-selection button[title="/lines.ask"]'))
 check(w.location.hash.includes('/signin?return='),'Selected-line Ask opens sign-in when guest chat is off')
 const back=new URLSearchParams(w.location.hash.split('?')[1]).get('return')
 const backQuery=new URLSearchParams(back.split('?')[1])
 check(backQuery.get('ask')==='1','Sign-in return reopens Ask (ask=1)')
 check(!backQuery.has('askDraft'),'Sign-in return never carries the typed draft')
 await click(w,qs(w,".front-signin-actions .front-btn-primary"))
 check(Boolean(qs(w,'#repo-ask-input')),'Ask is open again after actual sign-in authorization')
 const css=readFileSync(resolve(mock,'src/sites/repo/views/code-home/code-home.css'),'utf8')
 check(/evidence-title > span[^}]*white-space: nowrap[^}]*min-width: 6ch/.test(css),'Issue refs reserve the longest fixture number without wrapping')
 check(/links > a[^}]*color: var\(--text-muted\)[^}]*font-size: 14px/.test(css),'Home link row is quiet and wraps')
 check(readFileSync(resolve(mock,'src/sites/repo/frame/frame.css'),'utf8').includes('.repo-frame-ask-button[aria-pressed="true"]'), 'Pressed Ask has a visible state')
 console.log(`PASS qa2: ${checks} built-UI/content assertions across all four sites`)
} finally {for(const w of windows)await w.happyDOM.close()}
