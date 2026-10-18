/* Converged v2.1 regressions on the delivered four catalogs; no browser launch. */
import { statesFor, requiredStatesFor } from '../../../evals/mock-fidelity/scoring.ts'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..')
const require=createRequire(resolve(root,'../../../apps/app/package.json'))
const {Window}=await import(require.resolve('happy-dom'))
const builds=process.argv.find(a=>a.startsWith('--build-root='))?.slice(13)??resolve(root,'dist-codex')
const wait=(ms=120)=>new Promise(r=>setTimeout(r,ms))
const flags='as=in&role=member&net=ok&data=full&host=install&landing=open&model=connected'
const failures=[],windows=[],counts={},catalogs={};let checks=0
const check=(v,m)=>{checks++;if(!v)failures.push(m)}
const $=(w,s)=>w.document.querySelector(s),all=(w,s)=>[...w.document.querySelectorAll(s)]
const fixture=(slug,name)=>JSON.parse(readFileSync(resolve(root,'src/sites/repo/fixtures/data',slug.replace('/','__'),name+'.json'),'utf8'))
const open=async(w,route)=>{const [path,raw]=route.split('?');const q=new URLSearchParams();for(const [k,v] of new URLSearchParams(raw))q.set(k,v);w.location.hash='#/'+path+'?'+q;await wait()}
const boot=async(site,slug)=>{
 const w=new Window({url:`http://localhost/?still=1#/smithers.sh/${slug}?${flags}`,width:390,height:844});windows.push(w)
 const html=readFileSync(resolve(builds,site,'index.html'),'utf8');w.document.body.innerHTML='<div id="root"></div>'
 w.eval('(function(){'+html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]+'})()');await wait(220);return w
}
const screen=async(w,id)=>{const s=w.__SITE__.screens.find(s=>s.id===id);check(s,'Catalog retains '+id);if(s)await open(w,s.route);return s}
const text=w=>$(w,'#repo-content')?.textContent??''
try{
 for(const [site,slug] of [['default','maya/tinyhttp'],['smithers-site','smithers-canary/smithers'],['effeck-site','effeck/effeck'],['effect','Effect-TS/effect']]){
  const w=await boot(site,slug),base=`smithers.sh/${slug}`
  catalogs[site]={routes:w.__SITE__.routes,screens:w.__SITE__.screens.map(({id,route})=>({id,route}))}
  counts[site]={screens:w.__SITE__.screens.length,routes:w.__SITE__.routes.length}
  if(['smithers-site','effeck-site'].includes(site)){
   const views=JSON.parse(readFileSync(resolve(root,'evals/mock-fidelity/views.json'),'utf8'))
   const payload={...w.__SITE__,site}
   for(const id of ['fixed-by-agents',...(site==='smithers-site'?['docs']:[])]){
    const view=views.find(v=>v.id===id),states=statesFor(view,payload)
    for(const state of requiredStatesFor(view,payload))check(states[state]?.length,`${site}/${id}: scorer recognizes ${state}`)
   }
  }
  for(const access of ['','&role=reader','&as=out']){
   await open(w,`${base}?${flags}${access}`)
   check(all(w,'#repo-content .repo-ui-sidebar-section > h2').map(n=>n.textContent).join('|')==='Releases',`${site}: Releases-only sidebar ${access}`)
   const chip=$(w,'.repo-frame-github');check(chip&&chip.textContent!=='Synced',`${site}: descriptive sync chip ${access}`)
   check(access?chip?.tagName==='SPAN':chip?.tagName==='A'&&chip.getAttribute('href').includes('/settings/sync'),`${site}: sync access ${access}`)
  }
  for(const flow of fixture(slug,'flows')){
   await open(w,`${base}/runs?${flags}&flow=${flow.name}`)
   const waiting=/· (\d+) waiting on you/.exec(text(w))?.[1],primary=$(w,'.repo-runs-page-heading .repo-ui-btn-primary')
   check(waiting==='0'?!primary:Boolean(primary),`${site}/${flow.name}: only a waiting run is primary`)
   if(primary){const id=primary.getAttribute('href').split('/').at(-1).split('?')[0];check(fixture(slug,'runs').some(r=>r.id===id&&r.flow===flow.name&&r.state==='waiting'),`${site}/${flow.name}: primary belongs to selected flow`)}
  }
  await open(w,`${base}/docs?${flags}`)
  const links=all(w,'.repo-docs-pages a');check(links.length>0,`${site}: mobile docs links exist`)
  for(const a of links)check(a.getAttribute('aria-label')?.trim(),`${site}: named mobile docs link ${a.getAttribute('href')}`)
  // Effect's Docs index is a package list, while page subjects use the shared Docs primary.
  if(site!=='effect')check($(w,'.repo-docs-page-header .repo-ui-btn-primary')?.textContent.includes('Ask about this page'),`${site}: Docs keeps Ask primary`)
  if(['smithers-site','effeck-site'].includes(site)){
   for(const family of ['fixed-by-agents','docs',...(site==='smithers-site'?['docs-page']:[])]){
    for(const state of ['loading','error','empty','signed-out','reader']){
     await screen(w,`${site}-${family}-${state === 'reader' ? 'reader-denied' : state}`)
     if(state==='loading')check($(w,'[aria-label="Loading"]'),`${site}/${family}: loading renders`)
     if(state==='error')check($(w,'[role="alert"] [title="/retry"]')&&$(w,'[role="alert"] p')?.textContent.trim(),`${site}/${family}: error reason and Retry`)
     if(state==='empty')check($(w,'.repo-frame-state'),`${site}/${family}: empty renders`)
     if(state==='signed-out')check(!$(w,'#repo-content [title="/issue.new"].repo-ui-btn-primary'),`${site}/${family}: signed-out read`)
    }
   }
   const s=await screen(w,`${site}-file-history`)
   check(!text(w).includes("Couldn't load commits"),`${site}: full-data history isn't an error`)
   const path=s.route.split('?')[0].split('/commits/main/')[1]
   const expected=fixture(slug,'commits').filter(c=>c.files.some(f=>f.path===path||f.path.startsWith(path+'/')||f.from===path))
   check(all(w,'.repo-history-commit-row').length===expected.length,`${site}: history derives from touched paths`)
   await open(w,s.route+'&net=error')
   check(text(w).includes("Couldn't load commits")&&$(w,'[title="/retry"]')&&$(w,'[role="alert"] p')?.textContent,`${site}: error has reason and Retry`)
   $(w,'[title="/retry"]')?.click();await wait();check(!text(w).includes("Couldn't load commits"),`${site}: Retry restores history`)
   const touched=fixture(slug,'commits').flatMap(c=>c.files).find(f=>fixture(slug,'tree').some(t=>t.path===f.path))?.path
   if(touched){await open(w,`${base}/commits/main/${touched}?${flags}`);const expected=fixture(slug,'commits').filter(c=>c.files.some(f=>f.path===touched||f.from===touched));check(all(w,'.repo-history-commit-row').length===expected.length,`${site}: populated file history matches fixture changes`)}
  }
  if(site==='smithers-site'){
   await screen(w,'smithers-site-pull-files');check(!$(w,'[title^="/pull.review"]'),'No review action for zero changed files')
   await screen(w,'smithers-site-queue-reader');check(!text(w).includes('Changes you approved'),'Queue does not invent approval evidence')
   await screen(w,'smithers-site-releases');const rc=all(w,'.repo-releases-entry').find(n=>n.textContent.includes('v1.0.0-rc.12'));check(rc?.querySelector('.repo-releases-prerelease')?.textContent==='Pre-release','RC list label')
   await screen(w,'smithers-site-release');check($(w,'.repo-releases-prerelease')?.textContent==='Pre-release','RC detail label')
   await screen(w,'smithers-site-redirect-latest');check(w.location.hash.includes('/releases/tag/v0.35.0')&&$(w,'.repo-releases-latest')&&!$(w,'.repo-releases-prerelease'),'Latest is stable and visibly distinct')
  }
  if(site==='default'){
   for(const [id,expected] of [['code-home-sync-stale','Synced 3 h ago'],['code-home-sync-failed','GitHub sync failed: GitHub returned 401']]){await screen(w,id);check($(w,'.repo-frame-github')?.textContent.includes(expected),`${id}: sync fact in header`);check(!text(w).includes('Synced with GitHub'),`${id}: no sidebar duplicate`)}
   await screen(w,'history-terminal-watched');check($(w,'.repo-history-terminal-watcher')?.textContent.includes('Watched by the agent')&&$(w,'.repo-history-terminal-watcher a')?.getAttribute('href').includes('/runs/'),'Terminal watcher names agent and links run')
   check($(w,'[data-primary="type"] input'),'Terminal primary is input');const input=$(w,'#repo-history-shell-input');check($(w,'[aria-label="Run command"]')?.disabled,'Empty input cannot run')
   if(input){Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,'pwd');input.dispatchEvent(new w.Event('input',{bubbles:true}));await wait();check(!$(w,'[aria-label="Run command"]')?.disabled,'Text enables Run command');$(w,'[aria-label="Run command"]')?.click();await wait();check(input.value===''&&all(w,'.repo-history-shell-entry').at(-1)?.textContent.includes('pwd'),'Typed command executes and clears')}
  }
  if(site==='effect'){
   for(const id of ['effect-repo-wiki','effect-repo-wiki-page']){await screen(w,id);check($(w,'[title="/wiki.edit"].repo-ui-btn-primary')?.textContent.includes('Edit or ask'),`${id}: Wiki primary Edit or ask`);check(!$(w,'.repo-wiki-proposal [title^="/wiki.accept"].repo-ui-btn-primary'),`${id}: Accept outline`)}
   for(const state of ['all-pass','running','scoped','cancelled','excluded','missing']){await screen(w,`effect-ci-matrix-${state}`);check(!$(w,'.effect-ci-actions .repo-ui-btn-primary'),`${state}: no failure, no primary`)}
   await screen(w,'effect-ci-matrix-failed');check($(w,'.effect-ci-actions .repo-ui-btn-primary')?.textContent.includes('Bun · @effect/sql-sqlite-bun failure'),'Failing CI primary names failing job')
   await screen(w,'effect-packages-open-form');check(!$(w,'.effect-packages-heading .repo-ui-btn-primary')&&$(w,'.repo-frame-confirm .repo-ui-btn-primary'),'Package confirmation owns solid action')
  }
  console.log(`${site}: ${counts[site].screens} screens / ${counts[site].routes} routes`)
 }
}finally{for(const w of windows)await w.happyDOM.close()}
writeFileSync(join(tmpdir(),'qa-eval2-catalogs.json'),JSON.stringify(catalogs,null,2));writeFileSync(join(tmpdir(),'qa-eval2-counts.json'),JSON.stringify(counts,null,2))
if(failures.length){console.error(failures.join('\n'));process.exitCode=1}
console.log(`${failures.length?'FAIL':'PASS'} qa-eval2: ${checks} assertions; ${failures.length} failures`)
