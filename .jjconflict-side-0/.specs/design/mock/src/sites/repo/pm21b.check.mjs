/* Product review rows 11/13/14/16/17/18/28/30; real bundles, no browser launch. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const mock = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const req = createRequire(resolve(mock, '../../../apps/app/package.json'))
const { Window } = await import(req.resolve('happy-dom'))
const wait = (ms=90) => new Promise(resolve => setTimeout(resolve,ms))
const member = 'as=in&role=member&net=ok&data=full&landing=open&hosted=up&model=connected'
const windows=[]
let checks=0
const check=(value,why)=>{assert.ok(value,why);checks++}
const open=async(w,path)=>{w.location.hash='#/'+path;await wait()}
const button=(w,title,root=w.document)=>[...root.querySelectorAll('button[title]')].find(node=>node.title===title)
const click=async node=>{check(node,'Control exists');node.click();await wait()}
const input=async(w,value)=>{
  const field=w.document.querySelector('#repo-ask-input')
  check(field,'Ask input exists')
  Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(field,value)
  field.dispatchEvent(new w.Event('input',{bubbles:true}))
  await wait()
}
const send=async(w,value)=>{await input(w,value);w.document.querySelector('.repo-frame-composer').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(230)}
try {
  for(const [site,slug] of [['default','maya/tinyhttp'],['smithers-site','smithers-canary/smithers'],['effeck-site','effeck/effeck'],['effect','Effect-TS/effect']]) {
    const base='smithers.sh/'+slug
    const w=new Window({url:`http://localhost/?still=1#/${base}?${member}`,width:1440,height:900})
    windows.push(w)
    w.sessionStorage.setItem('site-mock-flags',JSON.stringify({as:'in',role:'member',net:'ok',data:'full',landing:'open',hosted:'up',model:'connected'}))
    w.document.body.innerHTML='<div id="root"></div>'
    const html=readFileSync(`${mock}/dist-codex/${site}/index.html`,'utf8')
    w.eval('(function(){'+html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]+'})()')
    await wait(160)
    // One ready subject for every repository route (including loading/error pages' shared frame).
    const routeScreens=w.__SITE__.routes.filter(pattern=>pattern.startsWith('smithers.sh/:owner/:repo') || pattern.startsWith(base)).map(pattern=>w.__SITE__.screens.find(s=>w.__SITE__.resolve(s.route)===pattern)).filter(Boolean)
    const names=['branches','commits','issues','pulls','runs','flows','wiki','releases','tags','approvals','stack','agents','docs','settings',...(site==='smithers-site'||site==='effeck-site'?['evals']:[])]
    for(const screen of routeScreens){
      const [path,raw]=screen.route.split('?');const q=new URLSearchParams(raw)
      for(const [key,value] of new URLSearchParams(member))q.set(key,value)
      q.set('ask','/')
      await open(w,`${path}?${q}`)
      const commands=[...w.document.querySelectorAll('.repo-frame-command code')].map(n=>n.textContent)
      for(const name of names)check(commands.includes('/'+name),`${site} ${path}: /${name}`)
      for(const name of ['repo.clone','repo.import','copy','ask','cancel','ask.close','account.menu','theme','signout','search','signin','notice.dismiss'])check(commands.includes('/'+name),`${site} ${path}: shared /${name}`)
    }
    await open(w,`${base}?${member}&ask=%2F&package=sql-pg&probe=kept`)
    await send(w,'/files')
    check(new URLSearchParams(w.location.hash.split('?')[1]).get('probe')==='kept','/files preserves home flags '+site)
    if(site!=='default') {
      const main=w.document.querySelector('.repo-code-home-main')
      const nodes=[...main.children]
      const index=selector=>nodes.findIndex(node=>node.matches(selector)||node.querySelector(selector))
      const order=['.repo-code-home-intro','form.repo-code-home-block','.repo-code-home-links','.repo-code-home-evidence','.repo-code-home-files','.repo-code-home-readme'].map(index)
      check(order.every(i=>i>=0)&&order.every((n,i)=>!i||n>order[i-1]),'Home block order '+site+' '+order)
      if(site==='smithers-site'){
        check(main.querySelectorAll('.repo-code-home-app').length===4,'Four Smithers App blocks')
        check(index('.repo-code-home-apps')>index('.repo-code-home-evidence')&&index('.repo-code-home-apps')<index('.repo-code-home-files'),'Apps follow evidence')
      }
      await open(w,`${base}?${member.replace('as=in','as=out')}`)
      check(!w.document.querySelector('.repo-code-home-app'),'Apps hidden signed out '+site)
    }
    console.log(`PASS ${site}: ${w.__SITE__.screens.length} screens / ${w.__SITE__.routes.length} routes; ${routeScreens.length} navigation subjects`)
  }
  const w=windows[0],base='smithers.sh/maya/tinyhttp'
  for(const path of ['tree/main/src','blob/main/src/router.ts']){
    await open(w,`${base}/${path}?${member}&ask=%2F&probe=keep`)
    check(button(w,'/file.find'),'Tree/blob Go to file button')
    await send(w,'/file.find')
    check(w.document.querySelector('dialog input#repo-code-find'),'Slash opens same finder dialog')
    const link=[...w.document.querySelectorAll('.repo-code-finder-results a')].find(n=>n.textContent==='src/router.ts')
    check(link?.getAttribute('href').includes('probe=keep'),'Finder preserves flags and revision')
    await click(w.document.querySelector('dialog button[title="/cancel"]'))
    check(!w.document.querySelector('dialog'),'Finder closes')
  }
  await open(w,`${base}?${member}&ask=%2F`)
  await send(w,'/ask')
  check(w.document.querySelector('.repo-frame-confirm label')?.textContent==='Question','/ask uses the registered question form')
  await send(w,'/cancel')
  check(!w.document.querySelector('.repo-frame-confirm'),'/cancel closes the pending Ask form')
  await send(w,'Answer the approval for run-511')
  const panel=w.document.querySelector('#repo-ask-panel')
  check(panel.querySelector('.repo-runs-approval'),'Agent opens the actual ApprovalCard')
  check(!w.sessionStorage.getItem('repo-runs:maya/tinyhttp'),'Agent has not answered the decision')
  await click(button(w,'/approval.answer approval-cors Throw a configuration error',panel))
  check(panel.textContent.includes('Record this decision?'),'Person sees same approval confirmation')
  await click(button(w,'/approval.answer.confirm approval-cors Throw a configuration error',panel))
  check(JSON.parse(w.sessionStorage.getItem('repo-runs:maya/tinyhttp')).approvals['approval-cors'].decided.by==='maya','Person records decision')
  await open(w,`${base}?${member}&ask=%2F`)
  await send(w,'Make a TODO for issue #29')
  check(w.document.querySelector('.repo-frame-confirm')?.textContent.includes('Make TODO'),'Agent uses registered TODO confirmation')
  check(!w.sessionStorage.getItem('repo-pulls-v1:maya/tinyhttp:stack')?.includes('todo-29'),'TODO waits for confirmation')
  await click(button(w,'/issue.todo',w.document.querySelector('#repo-ask-panel')))
  await open(w,`${base}/stack?${member}`)
  check(w.document.querySelector('#repo-content').textContent.includes('Describe trailing slash behavior with a route example'),'TODO appears on Stack')
  await open(w,`${base}?${member}&ask=%2F`)
  await send(w,'Show me the runs that need me')
  check(w.document.querySelector('#repo-ask-panel .repo-runs-embedded'),'Agent embeds shared Runs view')
  check(w.location.hash.split('?')[0]===`#/${base}`,'Agent view keeps current page')
  w.sessionStorage.removeItem('repo-runs:maya/tinyhttp');w.sessionStorage.removeItem('repo-pulls-v1:maya/tinyhttp:stack')
  await open(w,`${base}/approvals?${member}`)
  const stack=w.document.querySelector('.repo-runs-approval')
  check(stack?.textContent.includes('Throw a configuration error')&&stack?.textContent.includes('Require explicit CORS origins with credentials'),'Linked Stack decision appears once under Run approvals')
  await click(button(w,'/approval.answer approval-cors Throw a configuration error',stack))
  check(stack.textContent.includes('Record this decision?'),'Stack answer confirms inline')
  await click(button(w,'/approval.answer.confirm approval-cors Throw a configuration error',stack))
  check(!w.document.querySelector('.repo-runs-stack-question'),'Answered Stack question leaves inbox')
  const saved=JSON.parse(w.sessionStorage.getItem('repo-pulls-v1:maya/tinyhttp:stack'))
  check(saved.find(i=>i.id==='todo-33').state==='working','Stack answer persists')
  const headCount=w.document.querySelector('.repo-frame-inbox .repo-ui-counter').textContent
  check(w.document.querySelector('h1 .repo-ui-counter').textContent===headCount,'Inbox count updates with inline answer')
  w.sessionStorage.removeItem('repo-runs:maya/tinyhttp');w.sessionStorage.removeItem('repo-pulls-v1:maya/tinyhttp:stack')
  await open(w,`${base}/approvals?${member.replace("role=member","role=reader")}`)
  check(w.document.querySelector('.repo-runs-approval'),'Reader sees pending decision')
  check(![...w.document.querySelectorAll('.repo-runs-approval button')].some(n=>!n.disabled),'Reader cannot answer Stack')
  for(const [flag,selector,why] of [
    ['net=slow','.repo-frame-loading','Embedded Runs loading'],
    ['net=error','button[title="/retry"]','Embedded Runs error with Retry'],
    ['data=empty','.repo-frame-state','Embedded Runs empty']
  ]) {
    const [key,value]=flag.split('=');const query=new URLSearchParams(member);query.set(key,value);query.set('ask','view')
    await open(w,`${base}?${query}`)
    check(w.document.querySelector('#repo-ask-panel')?.querySelector(selector),why)
  }
  // Phone sheet CSS and keyboard/handle behavior. DOM cannot measure browser overflow.
  w.happyDOM.setViewport({width:390,height:900})
  const style=w.document.createElement('style');style.textContent=readFileSync(`${mock}/src/sites/repo/frame/frame.css`,'utf8');w.document.head.append(style)
  await open(w,`${base}?${member}&ask=%2F`)
  let ask=w.document.querySelector('#repo-ask-panel')
  check(w.getComputedStyle(ask).top==='auto','Phone sheet leaves page above')
  check(/height: 72dvh; max-height: 80dvh/.test(style.textContent),'Phone CSS declares partial height; Happy DOM cannot resolve bare dvh')
  await click(w.document.querySelector('.repo-frame-sheet-handle'))
  check(!w.document.querySelector('#repo-ask-panel'),'Sheet handle closes')
  await click(button(w,'/ask · ⌘K'))
  w.document.querySelector('#repo-ask-input').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait()
  check(!w.document.querySelector('#repo-ask-panel'),'Escape closes sheet')
  w.happyDOM.setViewport({width:1280,height:900});w.sessionStorage.removeItem('repo-ask-open')
  // Static breakpoint contract complements the frame's viewport tests.
  check(style.textContent.includes('@media (min-width: 1440px)'),'Dock breakpoint is 1440')
  for(const file of ['effect/docs/Docs.tsx','effect/releases/Releases.tsx'])check(!existsSync(`${mock}/src/sites/${file}`),'Fork removed '+file)
  console.log(`PASS ${checks} pm21b assertions`)
}finally{for(const w of windows)await w.happyDOM.abort()}
