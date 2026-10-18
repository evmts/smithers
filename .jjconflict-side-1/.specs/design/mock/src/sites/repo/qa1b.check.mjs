/* Stage 1 part B: actual built UI data, actions, ordering and anchor behavior; no layout claims. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..')
const req=createRequire(resolve(root,'../../../apps/app/package.json'))
const {Window}=await import(req.resolve('happy-dom'))
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms??160))
const w=new Window({url:'http://localhost/?still=1',width:1440,height:900})
const flags='as=in&role=member&net=ok&data=full&host=install&landing=open&model=connected'
const $=s=>w.document.querySelector(s), $$=s=>[...w.document.querySelectorAll(s)]
let checks=0
const check=(v,s)=>{assert.ok(v,s);checks++}
const eq=(a,b,s)=>{assert.equal(a,b,s);checks++}
const scrolls=[]
w.HTMLElement.prototype.scrollIntoView=function(options){scrolls.push({id:this.id,options})}
const open=async(path)=>{scrolls.length=0;w.location.hash='#/smithers.sh/maya/tinyhttp/'+path;await wait()}
const screen=async id=>{const item=w.__SITE__.screens.find(x=>x.id===id);check(item,'Retained '+id);scrolls.length=0;w.location.hash='#/'+item.route;await wait()}
const click=async s=>{check($(s),'Click '+s);$(s).click();await wait()}
const before=(a,b)=>Boolean($(a)?.compareDocumentPosition($(b)) & w.Node.DOCUMENT_POSITION_FOLLOWING)
try {
 w.document.body.innerHTML='<div id="root"></div>'
 const html=readFileSync(`${root}/dist-codex/default/index.html`,'utf8')
 w.document.head.innerHTML=[...html.split('</head>')[0].matchAll(/<style>([\s\S]*?)<\/style>/g)].map(x=>x[0]).join('')
 w.eval('(function(){'+html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]+'})()');await wait()
 for(const width of [1440,390]) {
  w.happyDOM.setViewport({width,height:width===390?844:900})
  w.document.head.innerHTML=w.document.head.innerHTML
  await screen('history-commit-line')
  const anchor=$('[data-selected] a[id$="R19"]')
  check(anchor,'Requested diff line is selected')
  check(scrolls.some(x=>x.id===anchor.id&&x.options.block==='start'),'Diff scroll reveals target under header')
  check(parseInt(w.getComputedStyle(anchor).scrollMarginTop)>=(width===390?66:72),'Selected diff clears sticky header')
  await screen('history-commit-empty')
  check($('.repo-history-missing-sha')?.textContent.includes('a41c9e0'),'Missing commit names requested SHA')
  check($('.repo-frame-state a.repo-ui-btn-primary')?.textContent==='Open commits','Missing commit has primary recovery')
  await screen('docs-anchor')
  check(scrolls.some(x=>x.id==='repo-docs-node'&&x.options.block==='start'),'Docs anchor scrolls to heading')
  eq(w.document.activeElement?.id,'repo-docs-node','Docs anchor receives focus without another scroll')
  check(parseInt(w.getComputedStyle($('#repo-docs-node')).scrollMarginTop)>=(width===390?66:72),'Docs anchor clears header')
  await screen('issues-detail-implement-confirm')
  check(w.document.activeElement?.classList.contains('repo-issues-confirm'),'Implement confirmation gets visible focus')
  check(Boolean($('.repo-frame-ask'))===(width>=1440),'Ask docks beside invoked confirmation at 1440 and closes below it')
 }
 await screen('code-home-not-imported-signed-out')
 check(!$('.repo-frame-ask'),'Unavailable signed-out repo has no code composer')
 await screen('code-home-ask-command-confirm')
 eq($('.repo-frame-confirm .repo-ui-btn-primary')?.textContent,'Open sandbox','Sandbox confirmation has concrete primary')
 await screen('code-home-signed-out')
 const homeCount=$('.repo-code-home-commit-count').textContent.match(/\d+/)[0]
 await screen('history-commits-signed-out')
 eq($('.repo-history-count').textContent,`${homeCount} commits`,'Home and main history use same reachable count')
 await screen('history-branches-empty')
 check($('#repo-content').textContent.includes('1 branch')&&!$('#repo-content').textContent.includes('1 branches'),'Singular branch metadata')
 await screen('pulls-conversation-conflicts')
 check($('.repo-pulls-title-status.repo-pulls-danger')?.textContent.includes('Conflicts with main'),'Conflict shown near title')
 check($('.repo-pulls-title-status a')?.textContent==='Resolve on GitHub','Conflict has recovery action')
 await screen('pulls-conversation-landing')
 check($('.repo-pulls-title-status')?.textContent.includes("Awaiting maya's merge"),'Pending merge belongs to person')
 for(const id of ['pulls-checks-failing','pulls-files-reader','pulls-conversation-failing','pulls-conversation-landing','pulls-conversation-conflicts']) {
  await screen(id)
  if(!$('.repo-frame-ask'))await click('.repo-frame-ask-button')
  const n=w.location.hash.match(/\/pull\/(\d+)/)[1]
  check($$('.repo-frame-suggestion').some(x=>x.textContent.includes(`#${n}: `)),'Ask names current PR')
  check(!$('.repo-frame-suggestions').textContent.includes('empty values and bare keys'),'No unrelated PR question')
 }
 await screen('pulls-list-empty')
 check($('.repo-frame-state a.repo-ui-btn-primary')?.textContent==='Open branches','Empty pull list has primary branches link')
 await screen('pulls-list-open')
 const draft=$$('.repo-pulls-list-row').find(row=>row.textContent.includes('Draft'))
 check(draft?.querySelector('.repo-pulls-list-health .repo-ui-state-draft'),'Draft health is neutral draft glyph')
 check(!draft?.querySelector('.repo-pulls-list-health .repo-ui-state-success'),'Draft is not labelled with passed-check glyph')
 for(const id of ['settings-general-empty','settings-reporting-empty','settings-triggers-empty']) {
  await screen(id)
  if(id.includes('general'))check($('#repo-settings-general input[required]')?.value,'General absence initializes editable defaults')
  if(id.includes('reporting')) {
   check($('input[value="off"]')?.checked,'Absent reporting policy defaults to off')
   check(!$('.repo-settings-heading button')?.disabled,'New off policy can be saved')
   check($('#repo-content').textContent.includes('Reporting from the app is off.'),'Effective policy is explicit')
   await click('.repo-settings-heading button')
   check($('.repo-settings-heading button')?.disabled,'Policy save settles')
  }
  if(id.includes('triggers')) {
   check($('.repo-frame-state a.repo-ui-btn-primary')?.textContent==='Open flows','Empty triggers offer authoring route')
   check(!$('.repo-settings-heading button'),'No dead Save on absent triggers')
  }
 }
 await screen('settings-reporting-member')
 check($('#repo-content').textContent.includes('Reports and attachments are public. Keep secrets out.'),'Reporting privacy is truthful')
 check(!$('#repo-content').textContent.includes('Secret values stay private'),'No pasted-secret protection claim')
 await screen('settings-triggers-member')
 check(parseInt(w.getComputedStyle($('.repo-settings-table thead th:last-child')).minWidth)>=80,'Enabled column cannot break header')
 eq(w.getComputedStyle($('.repo-settings-table thead th:last-child')).whiteSpace,'nowrap','Enabled label stays one line')
 check(parseInt(w.getComputedStyle($('.repo-settings-toggle')).minHeight)>=40,'Checkbox label touch target')
 await screen('flows-agents')
 check(before('.repo-flows-agent-warning','.repo-flows-agents'),'Connection notice precedes agent cards')
 check($('.repo-flows-agent-warning .repo-ui-btn-primary')?.textContent==='Connect Codex','Connection recovery is primary')
 for(const id of ['flows-agents-reader','flows-agents-signed-out']) {
  await screen(id)
  check(!$('.repo-flows-agents select'),'Nonmembers see static model values')
  check(!$('.repo-flows-agent-warning a'),'No member connection action for nonmembers')
 }
 await screen('issues-new-signed-out')
 eq($$('#repo-content a[title="/signin"]').length,1,'Signed-out issue form has one sign-in')
 check($('.repo-issues-draft-wall .repo-ui-btn-primary'),'Issue gate has primary sign-in')
 await screen('code-home-ask-sample')
 const cards=$$('.repo-frame-ask-card .repo-ui-code')
 check(cards.length>=2,'Ask answer embeds evidence')
 const fixtures=JSON.parse(readFileSync(`${root}/src/sites/repo/fixtures/data/maya__tinyhttp/files.json`,'utf8'))
 for(const [i,path,line] of [[0,'src/router.ts',114],[1,'src/query.ts',7]]) {
  const expected=fixtures.find(x=>x.path===path).content.split('\n').slice(line-3,line+2).join('\n')
  eq([...cards[i].querySelectorAll('code')].map(x=>x.textContent===' '?'':x.textContent).join('\n'),expected,'Evidence excerpt is centered on citation')
  eq(cards[i].querySelector('[data-selected] a').textContent,String(line),'Cited line highlighted')
 }
 await screen('runs-signed-out')
 check(!$('#repo-content').textContent.includes('waiting on you')&&!$('#repo-content').textContent.includes('needs you'),'Public history has no personal claims')
 await screen('runs-run-trace')
 check(before('.repo-ui-tabs','.repo-runs-trace'),'Trace tabs immediately lead selected view')
 check(before('.repo-runs-trace','.repo-runs-waiting-cards'),'Trace precedes approvals')
 check(!$('.repo-runs-details')?.open,'Metadata starts collapsed')
 for(const id of ['runs-run-retry-confirm','runs-run-held-retry']) {
  await screen(id)
  check(!$('.repo-runs-failure-log')?.open,'Failure log is collapsed')
  if(id==='runs-run-retry-confirm')check(before('.repo-runs-confirm','.repo-runs-failure-log'),'Retry confirmation precedes log')
 }
 for(const id of ['runs-run-waiting-cora','runs-run-succeeded','runs-run-retry-confirm','runs-run-trace','runs-run-held-retry']) {
  await screen(id)
  check(!$('#repo-content').textContent.includes('Harness')&&!$('#repo-content').textContent.includes('triggered by'),'Run metadata uses product language')
  check($$('.repo-runs-facts dt').some(x=>x.textContent==='Agent and model'),'Agent label is explicit')
  check($('.repo-runs-trigger').textContent.includes('Started '),'Trigger describes how run started')
 }
 console.log(`PASS qa1b: ${checks} built UI assertions across desktop/phone settings`)
} finally {await w.happyDOM.abort();w.close()}
