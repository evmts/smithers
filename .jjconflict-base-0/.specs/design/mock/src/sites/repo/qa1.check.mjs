/* Stage 1 X1–X4 and part A: built UI behavior, without Chromium or layout claims. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const mock = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const req = createRequire(resolve(mock, '../../../apps/app/package.json'))
const { Window } = await import(req.resolve('happy-dom'))
const member='as=in&role=member&net=ok&data=full&host=hosted&landing=open&model=connected'
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms??100))
const windows=[]
let checks=0
const check=(value,why)=>{assert.ok(value,why);checks++}
const equal=(actual,expected,why)=>{assert.equal(actual,expected,why);checks++}
const open=async(w,path)=>{const [pathname,raw]=path.split('?');const params=new URLSearchParams();for(const [k,v] of new URLSearchParams(raw))params.set(k,v);w.location.hash='#/'+pathname+'?'+params;await wait(140)}
const qs=(w,s)=>w.document.querySelector(s)
const all=(w,s)=>[...w.document.querySelectorAll(s)]
const click=async(w,s)=>{const node=typeof s==='string'?qs(w,s):s;check(node,'Clickable target');node.click();await wait()}
const screen=async(w,id)=>{const value=w.__SITE__.screens.find(x=>x.id===id);check(value,`Retained screen ${id}`);await open(w,value.route);return value}
try {
 for(const [site,slug] of [['default','maya/tinyhttp'],['smithers-site','smithers-canary/smithers'],['effeck-site','effeck/effeck'],['effect','Effect-TS/effect']]) {
  const w=new Window({url:`http://localhost/?still=1#/smithers.sh/${slug}?${member}`,width:1440,height:900});windows.push(w)
  w.document.body.innerHTML='<div id="root"></div>'
  w.sessionStorage.setItem('repo-ask-open','true')
  const html=readFileSync(`${mock}/dist-codex/${site}/index.html`,'utf8')
  w.document.head.innerHTML=[...html.split('</head>')[0].matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match=>match[0]).join('')
  w.eval('(function(){'+html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]+'})()');await wait(180)
  if(process.argv.includes('--snapshot'))writeFileSync(join(tmpdir(),`qa1-before-${site}.json`),JSON.stringify(w.__SITE__))
  for(const suffix of ['issues/new?template=bug&','bug?','settings/models?','flows/implement-issue?run=1&']) {
   w.sessionStorage.setItem('repo-ask-open','true')
   await open(w,`smithers.sh/${slug}/${suffix}${member}`)
   check(qs(w,'.repo-frame-ask'),`${site}/${suffix}: form docks Ask at 1440`)
   const chips=all(w,'.repo-frame-suggestion').map(x=>x.textContent)
   check(chips.length>0 && chips.every(text=>!['What needs attention here?','Which changes relate to this issue?'].includes(text)),`${site}: form-specific suggestions`)
   if(suffix.startsWith('bug'))check(chips.includes('What makes a good bug report?'),'Bug-specific help')
   await click(w,'[aria-label="Close Ask"]')
  }
  await open(w,`smithers.sh/${slug}?${member}&net=error`)
  check(qs(w,'.repo-frame-github')?.textContent.includes('Synced with GitHub')&&qs(w,'#repo-content [role="alert"]'),`${site}: page read failure preserves independent successful sync`)
  await open(w,`smithers.sh/docs/reference/http-api?${member}`)
  equal(w.__SITE__.resolve('smithers.sh/docs/reference/http-api'),'smithers.sh/docs/*',`${site}: nested public docs route`)
 }
 const w=windows[0]
 await screen(w,'code-home-ask-import-form')
 check(qs(w,'.repo-frame-composer-foot')?.textContent.includes('maya/not-imported'),'Unavailable composer names route repo')
 check(!qs(w,'.repo-frame-composer-foot')?.textContent.includes('main'),'Unavailable composer omits invented ref')
 equal(qs(w,'input[name="repository"]')?.value,'maya/not-imported','Import defaults to route repo')
 equal(qs(w,'.repo-frame-confirm .repo-ui-btn-primary')?.textContent,'Import','Concrete import action')
 for(const [id,label] of [['code-home-ask-command-form','Open sandbox'],['code-home-ask-question-form','Ask'],['code-home-ask-search-form','Search'],['code-home-ask-theme-form','Apply theme']]) {
  await screen(w,id)
  equal(qs(w,'.repo-frame-confirm .repo-ui-btn-primary')?.textContent,label,'Ask form has a concrete primary action')
 }
 await screen(w,'code-blob-tag')
 await open(w,w.location.hash.slice(2)+'&guest=ok')
 if(qs(w,'.repo-frame-ask-button[aria-expanded="false"]'))await click(w,'.repo-frame-ask-button')
 check(qs(w,'.repo-frame-composer-foot').textContent.includes('v0.4.2'),'Tag context follows visible ref')
 await screen(w,'code-blob-effect-omitted')
 check(qs(w,'.repo-code-source')?.textContent.includes('use flake'),'Whole envrc renders')
 check(!qs(w,'[aria-label="Copy path"]')?.closest('.repo-code-path-header'),'No duplicate copy in path row')
 check(qs(w,'[aria-label="Copy permalink"] svg path'),'Permalink has a link glyph')
 check(all(w,'.repo-code-file-overflow button').some(x=>x.textContent==='Copy path'),'Copy path is in overflow')
 for(const tab of ['commits','checks']) {
  await open(w,`smithers.sh/maya/tinyhttp/pull/30/${tab}?${member}&data=empty`)
  check(qs(w,'.repo-pulls-detail-header'),'Empty PR subview retains header')
  check(qs(w,'.repo-pulls-tab-content')?.textContent.includes(tab==='commits'?'No commits':'No checks on this pull request'),'Empty PR region tells the truth')
 }
 await screen(w,'pulls-conversation-changes-requested')
 check(qs(w,'.repo-pulls-sidebar-person .repo-ui-state-changes_requested'),'Sidebar review follows conversation')
 check(qs(w,'.repo-pulls-review-warning')?.textContent==='Changes requested','Review next step is visible')
 await screen(w,'issues-detail-held-implement')
 check(qs(w,'.repo-issues-confirm'),'Invoked confirmation exists')
 check(qs(w,'.repo-frame-ask'),'Invoked action keeps Ask docked at 1440')
 check(w.document.activeElement?.classList.contains('repo-issues-confirm'),'Invoked confirmation receives focus')
 for(const width of [1440,390]) {
  w.happyDOM.setViewport({width,height:width===390?844:900})
  await open(w,`smithers.sh/maya/tinyhttp/issues/new?template=bug&${member}`)
  check(qs(w,'.repo-issues-new-heading button[form]'),'Publish is in the title row')
  check(qs(w,'.repo-issues-report-context:not([open])'),'Report metadata starts collapsed')
  equal(w.getComputedStyle(qs(w,'.repo-issues-markdown-field textarea')).fontFamily,w.getComputedStyle(w.document.body).fontFamily,'Description uses body font')
  await open(w,`smithers.sh/maya/tinyhttp/docs/first-steps?${member}`)
  check(qs(w,'.repo-docs-pages > summary')?.textContent==='Pages','Phone pages disclosure exists before article')
  if(width===390)equal(w.getComputedStyle(qs(w,'.repo-docs-pages')).display,'block','Phone pages disclosure visible')
 }
 await screen(w,'wiki-history')
 check(qs(w,'.repo-wiki-history-heading button')?.textContent==='Close','History has a named Close target')
 equal(w.getComputedStyle(qs(w,'.repo-wiki-history')).position,'fixed','Phone history is a sheet')
 await screen(w,'wiki-proposal-confirm')
 check(qs(w,'.repo-wiki-confirm .repo-ui-btn-primary'),'Confirm accept is primary')
 check(!qs(w,'[title="/wiki.edit"]').classList.contains('repo-ui-btn-primary'),'Edit is secondary during confirmation')
 await open(w,`smithers.sh/maya/tinyhttp/agents?as=out&net=ok&data=full`)
 check(!qs(w,'.repo-flows-agent-facts select'),'Signed-out models are read-only')
 check(!all(w,'.repo-flows-agent-warning a').some(x=>x.textContent.startsWith('Connect')),'Signed-out has no model connection act')
 await open(w,`smithers.sh/maya/tinyhttp/settings/models?${member}`)
 check(qs(w,'.repo-settings-model h2')?.textContent==='Codex','Disconnected provider is first')
 await open(w,`smithers.sh/maya/tinyhttp/runs?flow=implement-issue&${member}`)
 check(qs(w,'.repo-runs-summary')?.textContent.includes('0 failed today'),'Run failure summary follows flow scope')
 for(const [path,selector] of [['runs?filter=succeeded','.repo-runs-filters'],['search?q=router&type=runs','.repo-search-facets']]){
  await open(w,`smithers.sh/maya/tinyhttp/${path}&${member}`)
  equal(w.getComputedStyle(qs(w,selector)).flexWrap,'nowrap','Phone filters stay on one row')
 }
 await open(w,`smithers.sh/maya/tinyhttp/branches?${member}`)
 check(all(w,'.repo-history-divergence-text').some(node=>/\d+ behind/.test(node.textContent)),'Compact branch row labels the behind counter')
 check(all(w,'.repo-history-divergence-text').some(node=>/\d+ ahead/.test(node.textContent)),'Compact branch row labels the ahead counter')
 check(/@container repo-branches \(width < 900px\)[\s\S]*?divergence-text \{ display: inline;/.test(readFileSync(resolve(mock,'src/sites/repo/views/history/history.css'),'utf8')),'Compact branch counters respond to content width')
 await open(w,`smithers.sh/maya/tinyhttp/stack?${member}`)
 for(const control of all(w,'.repo-pulls-move-controls button')) {
  equal(w.getComputedStyle(control).width,'40px','Reorder control width')
  equal(w.getComputedStyle(control).height,'40px','Reorder control height')
 }
 await open(w,`smithers.sh/maya/tinyhttp/flows/implement-issue?tab=runs&${member}`)
 check(qs(w,'.repo-flows-run-row small .repo-ui-time'),'Flow run time shares the metadata line')
 check(!qs(w,'.repo-flows-run-row > .repo-ui-time'),'Flow titles have no competing time column')
 await open(w,`smithers.sh/maya/tinyhttp/search?q=symbol%3ARouter&${member}`)
 check(qs(w,'.repo-search-match .repo-code-token-keyword, .repo-search-match .repo-code-token-type'),'Search source has syntax tokens')
 equal(w.getComputedStyle(qs(w,'.repo-search-match-link code')).whiteSpace,'pre','Search lines never wrap')
 await open(w,`smithers.sh/maya/tinyhttp/docs?${member}`)
 check(qs(w,'.repo-docs-code .repo-code-token-keyword'),'Docs use shared syntax')
 await open(w,`smithers.sh/effeck/effeck/issues?q=is%3Afixed-by-agents&${member}`)
 equal(all(w,'.repo-issues-list-row').length,1,'Fixed by agents excludes three unfinished fixes')
 console.log(`PASS ${checks} stage 1 QA bundle assertions; no browser layout claims`)
} finally {await Promise.all(windows.map(w=>w.happyDOM.close()))}
