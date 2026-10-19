// Fixture-window, sync, cast and uptime regressions against all four built React mocks.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..')
const req=createRequire(resolve(root,'../../../apps/app/package.json'))
const {Window}=await import(req.resolve('happy-dom'))
const buildRoot=process.argv.find(a=>a.startsWith('--build-root='))?.slice(13)??resolve(root,'dist-codex')
const flags='as=in&role=member&net=ok&data=full&host=install&landing=open&model=connected'
const fixture=(slug,name)=>JSON.parse(readFileSync(resolve(root,'src/sites/repo/fixtures/data',slug.replace('/','__'),name+'.json'),'utf8'))
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const counts={},identities=[],failures=[];let checks=0
const check=(ok,why)=>{checks++;if(!ok)failures.push(why)}
const open=async(w,route)=>{const [path,raw]=route.split('?'),q=new URLSearchParams();for(const [k,v] of new URLSearchParams(raw))q.set(k,v);w.location.hash='#/'+path+'?'+q;await wait(140)}
const $=(w,s)=>w.document.querySelector(s),all=(w,s)=>[...w.document.querySelectorAll(s)]
const text=w=>$(w,'#repo-content')?.textContent??''
for(const [site,slug,historyId] of [['default','maya/tinyhttp','history-commits-path'],['smithers-site','smithers-canary/smithers','smithers-site-file-history'],['effeck-site','effeck/effeck','effeck-site-file-history'],['effect','Effect-TS/effect','effect-repo-commits-ref-path']]){
 const base='smithers.sh/'+slug,w=new Window({url:`http://localhost/?still=1#/${base}?${flags}`,width:390,height:844})
 try{
  w.document.body.innerHTML='<div id="root"></div>'
  const html=readFileSync(resolve(buildRoot,site,'index.html'),'utf8')
  w.eval('(function(){'+html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]+'})()');await wait(220)
  counts[site]={screens:w.__SITE__.screens.length,routes:w.__SITE__.routes.length}
  identities.push({site,...counts[site],routes:w.__SITE__.routes,screens:w.__SITE__.screens.map(({id,route})=>({id,route}))})
  for(const path of ['', '/releases','/commits/main','/issues']){
   for(const state of ['','&net=error']){
    await open(w,`${base}${path}?${flags}${state}`)
    const syncError=path==='/issues'&&state==='&net=error'
    check($(w,'.repo-frame-github')?.textContent.includes(syncError?'GitHub sync failed:':'Synced with GitHub'),`${site}/${path}${state}: sync failures agree; other page reads are independent`)
   }
  }
  await open(w,`${base}?${flags}&sync=stale`)
  check($(w,'.repo-frame-github')?.textContent.includes('Synced 3 h ago'),`${site}: isolated stale state`)
  await open(w,`${base}?${flags}&sync=error`)
  const chip=$(w,'.repo-frame-github'),icon=chip?.querySelector('svg')
  check(icon?.getAttribute('aria-hidden')==='true',`${site}: status glyph is hidden from accessibility tree`)
  const nodes=[...chip.childNodes],iconAt=nodes.indexOf(icon),reasonAt=nodes.findIndex(n=>n.textContent.includes('GitHub sync failed:'))
  check(iconAt>=0&&iconAt<reasonAt,`${site}: failure glyph precedes reason`)
  check(chip.textContent.includes('·Last success')&&!chip.textContent.includes('32 d'),`${site}: last success follows a separator`)
  await open(w,`${base}?${flags}`)
  check(!$(w,'.repo-frame-sync-error'),`${site}: failure does not leak`)
  const selected=w.__SITE__.screens.find(s=>s.id===historyId)
  check(selected,`${site}: history screen retained`)
  if(selected){await open(w,selected.route);check(all(w,'.repo-history-commit-row').length>0,`${site}: full-data history shows real rows`)
   const path=selected.route.split('?')[0].split('/commits/main/')[1],commits=fixture(slug,'commits')
   for(const row of all(w,'.repo-history-commit-row'))check(commits.some(c=>row.textContent.includes(c.sha.slice(0,7))&&c.files.some(f=>f.path===path||f.from===path||f.path.startsWith(path+'/'))),`${site}: row is backed by a changed path`)
  }
  const untouched=site==='default'?'outside-export.ts':site==='smithers-site'?'packages/smithers/src/IssueTodoDraft.ts':fixture(slug,'files').find(f=>!fixture(slug,'commits').some(c=>c.files.some(changed=>changed.path===f.path||changed.from===f.path)))?.path
  check(untouched,`${site}: untouched path exists for window regression`)
  if(untouched){
   await open(w,`${base}/commits/main/${untouched}?${flags}`)
   check(text(w).includes(`No changes to this file in the last ${fixture(slug,'commits').length} commits`),`${site}: window-specific absence`)
   check(!(/\b0 commits\b/).test(text(w))&&!text(w).includes('No commits found'),`${site}: no claim of empty lifetime history`)
   const full=all(w,'#repo-content a').find(a=>a.textContent==='Full history on GitHub ↗')
   check(full?.href===`${fixture(slug,'repo').github??'https://github.com/'+slug}/commits/main/${untouched}`,`${site}: full-history URL names the same file and reference`)
   await open(w,`${base}/commits/main/${untouched}?${flags}&net=error`)
   check($(w,'#repo-content [title="/retry"]')&&!text(w).includes('No changes to this file'),`${site}: history error is distinct and retryable`)
   $(w,'#repo-content [title="/retry"]')?.click();await wait(140)
   check(text(w).includes('No changes to this file in the last'),`${site}: Retry restores the truthful window state`)
  }
  await open(w,`${base}/releases?${flags}`)
  const cast=fixture(slug,'people').map(p=>p.login)
  for(const release of fixture(slug,'releases'))check(cast.includes(release.author),`${site}: release publisher in cast`)
  check(!text(w).includes('Published by roninjin10'),`${site}: no raw publisher login`)
  if(site==='default'){
   const terminal=w.__SITE__.screens.find(s=>s.id==='history-terminal-watched');await open(w,terminal.route)
   check($(w,'.repo-history-terminal-status')?.textContent.includes('up <1 min'), 'Newly running watched terminal shows sub-minute uptime')
   check(!text(w).includes('up 0m'),'No zero-minute uptime')
  }
  console.log('PASS',site,counts[site])
 }finally{await w.happyDOM.close()}
}
writeFileSync(join(tmpdir(),'qa-eval3-counts.json'),JSON.stringify(counts,null,2));writeFileSync(join(tmpdir(),'qa-eval3-catalogs.json'),JSON.stringify(identities,null,2))
console.log(`${failures.length?'FAIL':'PASS'} qa-eval3: ${checks} assertions; ${failures.length} failures`)
assert.deepEqual(failures,[])
