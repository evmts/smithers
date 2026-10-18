import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
// Run from any checkout: node .specs/design/mock/src/sites/repo/frame/check.mjs
// Uses the workspace's existing happy-dom and esbuild; launches no browser.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../..')
const artifacts = mkdtempSync(join(tmpdir(), 'repo-frame-check-'))
const compiled = join(artifacts, 'check.cjs')
const req = createRequire(`${root}/apps/app/package.json`)
const { Window } = await import(pathToFileURL(req.resolve('happy-dom')))
const window = new Window({ url: 'http://localhost/' })
for (const key of ['window', 'document', 'sessionStorage', 'localStorage', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Node', 'Element', 'Event', 'CustomEvent', 'KeyboardEvent', 'PointerEvent', 'MouseEvent', 'FormData']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true })
}
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
globalThis.matchMedia = window.matchMedia.bind(window)
// Schedule React's browser tasks without persistent Node MessagePorts.
globalThis.MessageChannel = class {
  port1 = {onmessage:null}
  port2 = {postMessage:data=>setImmediate(()=>this.port1.onmessage?.({data}))}
}
const code = `
import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {MockProvider, DEFAULTS} from './.specs/design/mock/src/sites/core/mock'
import {selectRepo, repo, askFor, people, issues, pulls} from './.specs/design/mock/src/sites/repo/fixtures'
import {RepoFrame} from './.specs/design/mock/src/sites/repo/frame'
import {CodeHome} from './.specs/design/mock/src/sites/repo/views/code-home/CodeHome'
import {routes} from './.specs/design/mock/src/sites/repo/views/code-home/routes'
import {Conversation} from './.specs/design/mock/src/sites/repo/views/pulls/Conversation'
export {React, act, createRoot, MockProvider, DEFAULTS, selectRepo, repo, askFor, people, issues, RepoFrame, CodeHome, routes, Conversation, pulls}
`
const bundle = await req('esbuild').build({stdin:{contents:code,resolveDir:root,sourcefile:'frame-check.tsx',loader:'tsx'},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',nodePaths:[`${root}/apps/app/node_modules`,`${root}/node_modules`]})
writeFileSync(compiled, bundle.outputFiles[0].text)
const m = createRequire(import.meta.url)(compiled)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const wait = ms => new Promise(resolve=>setTimeout(resolve, ms))
let app
let assertions=0
const assert = (value, message) => {if(!value) throw new Error(message); assertions++}
const click = async element => {assert(element,'Click target exists'); await m.act(async()=>element.click())}
const mount = async (slug='maya/tinyhttp', flags={}, query='', width=1440) => {
  if(app) await m.act(async()=>app.unmount())
  window.happyDOM.setViewport({width,height:900})
  sessionStorage.clear()
  sessionStorage.setItem('site-mock-flags',JSON.stringify({...m.DEFAULTS,as:'in',role:'member',...flags}))
  window.location.hash = '#/smithers.sh/'+slug+(query?'?'+query:'')
  await wait(1)
  m.selectRepo(slug)
  document.body.innerHTML='<div id="root"></div>'
  app=m.createRoot(document.getElementById('root'))
  const [owner,name]=slug.split('/')
  await m.act(async()=>{app.render(m.React.createElement(m.MockProvider,null,m.React.createElement(m.CodeHome,{owner,name}))); await wait(5)})
}
const qs = s=>document.querySelector(s)
const tokenColor = (token, property='color') => {
  const probe=document.createElement('span')
  probe.style[property==='backgroundColor'?'background':property]='var('+token+')'
  document.body.append(probe)
  const value=window.getComputedStyle(probe)[property]
  probe.remove()
  return value
}

const all = s=>[...document.querySelectorAll(s)]
const text = ()=>document.body.textContent
const style = document.createElement('style')
style.textContent=[
'apps/app/src/mainview/styles/tokens.css',
'.specs/design/mock/src/sites/repo/frame/frame.css',
'.specs/design/mock/src/sites/repo/repo.css',
'.specs/design/mock/src/sites/repo/ui/ui.css',
'.specs/design/mock/src/sites/repo/views/code-home/code-home.css'
].map(p=>readFileSync(root+'/'+p,'utf8')).join('\n')
document.head.append(style)
// happy-dom cannot evaluate color-mix(); use a sentinel to verify the warning token wiring.
document.documentElement.style.setProperty('--warning-soft', '#fbeed4')

try {
await mount()
assert(qs('.repo-frame-mark pre[aria-label="Smithers"]')?.textContent.split('\n').length===6, 'Shared six-line Smithers wordmark')
assert(window.getComputedStyle(qs('.repo-frame-mark pre')).fontSize==='2.75px', 'Wordmark uses app size')
assert(window.getComputedStyle(qs('.repo-frame-mark pre')).lineHeight==='1', 'Wordmark uses app line height')
assert(all('.repo-frame-message').length===0,'Ask opens without an invented exchange')
assert(all('.repo-frame-suggestion').length===3,'Ask shows three suggestions')
assert(qs('.repo-frame-suggestion').textContent.trim()===m.askFor('').question,'First suggestion uses current sample')
assert(window.getComputedStyle(qs('.repo-frame-search-toggle')).display==='none','Desktop hides separate search button')
assert(qs('.repo-frame-search kbd').textContent==='/','Search hints slash')
await m.act(async()=>document.body.dispatchEvent(new window.KeyboardEvent('keydown',{key:'/',bubbles:true,cancelable:true})))
assert(document.activeElement===qs('#repo-search'),'Slash focuses repository search')
const chip=qs('.repo-frame-suggestion')
await click(chip)
assert(qs('.repo-frame-message-you').textContent.includes(m.askFor('').question),'Chip appends person bubble')
assert(Boolean(qs('.repo-frame-typing')),'Sending displays typing indicator')
await m.act(async()=>wait(720))
assert(all('.repo-frame-message').length===2,'Exchange appears after typing')
assert(all('.repo-frame-ask-card').length===m.askFor('').cards.length,'Sample reply includes evidence cards')

await mount('maya/tinyhttp',{},'ask=sample&still=1',1280)
assert(all('.repo-frame-message').length===2,'ask=sample opens with played exchange at 1280')
assert(!qs('.repo-frame-typing'),'Sample screenshot has no typing delay')
for(const selector of ['.repo-code-home-toolbar .repo-ui-dropdown > summary','.repo-code-home-toolbar button.repo-ui-btn','.repo-code-home-code-menu > summary','.repo-frame-ask-button']){
  const control=qs(selector)
  assert(window.getComputedStyle(control).height==='36px','Uniform control height '+selector)
  assert(window.getComputedStyle(control).fontSize==='14px','Uniform control font '+selector)
}

await mount('maya/tinyhttp',{as:'out',guest:'off'},'ask=open&still=1',390)
assert(window.getComputedStyle(qs('.repo-frame-search-toggle')).display==='inline-flex','Phone shows search button')
assert(!qs('.repo-frame-ask') && !qs('#repo-ask-input'),'Guest-off visitor has no live Ask panel')
await click(qs('.repo-frame-ask-button'))
assert(window.location.hash.includes('/signin?return='),'Guest-off header Ask opens sign-in')
await mount('maya/tinyhttp',{as:'out',guest:'off'},'still=1',390)
await click(qs('.repo-frame-search-toggle'))
assert(document.activeElement===qs('#repo-search'),'Phone search button focuses the field')

await mount('maya/tinyhttp',{},'',390)
assert(qs('.repo-frame-mark pre') && window.getComputedStyle(qs('.repo-frame-mark pre')).display!=='none', 'Phone retains the complete wordmark')
assert(qs('.repo-frame-avatar-button .repo-ui-avatar').textContent==='M', 'Maya has one initial')
assert(qs('.repo-frame-avatar-button .repo-ui-avatar').dataset.lane==='maya', 'Maya uses the same lane everywhere')
assert(window.getComputedStyle(qs('.repo-frame-avatar-button .repo-ui-avatar')).backgroundColor===tokenColor('--sediment-400','backgroundColor'), 'Maya uses sediment lane color')
assert(window.getComputedStyle(qs('.repo-frame-inbox .repo-ui-counter')).backgroundColor===tokenColor('--warning-soft','backgroundColor'), 'Waiting count uses warning background: '+window.getComputedStyle(qs('.repo-frame-inbox .repo-ui-counter')).backgroundColor+' vs '+tokenColor('--warning-soft','backgroundColor'))
assert(window.getComputedStyle(qs('.repo-frame-inbox .repo-ui-counter')).color===tokenColor('--warning'), 'Waiting count uses warning text')
assert(qs('.repo-frame-inbox').getAttribute('aria-label')==='4 waiting on you','Phone waiting accessible name')
assert(window.getComputedStyle(qs('.repo-frame-inbox > svg')).display!=='none','Phone waiting icon is visible')

await mount('maya/tinyhttp',{net:'error'},'ask=open&still=1')
assert(!qs('.repo-frame-ask-error'),'No answer error is invented before a send')
await click(qs('.repo-frame-suggestion'))
assert(qs('.repo-frame-ask-error'),'Failed answer explains the network error')
await click(qs('.repo-frame-ask-error button'))
assert(qs('.repo-frame-typing'),'Retry shows answering state')
await m.act(async()=>wait(750))
assert(qs('.repo-frame-ask-card'),'Retry renders the answer with evidence')

for (const slug of ['smithers-canary/smithers','effeck/effeck','Effect-TS/effect','maya/tinyhttp']) {
  await mount(slug,{},'still=1',1280)
  const defaults = new Set(['code','issues','pulls','runs','flows','wiki','settings'])
  const declared = all('nav[aria-label="Repository"] > a').filter(link => link.getAttribute('href').split('?')[0] !== '#/smithers.sh/'+slug && !defaults.has(link.getAttribute('href').split('?')[0].split('/').at(-1)))
  assert(declared.length <= 3, 'At most three rendered declared tabs: '+slug+' ('+declared.length+')')
  const names = declared.map(link => link.firstChild.textContent.trim())
  const expected = slug==='smithers-canary/smithers' ? ['Docs','Evals'] : slug==='effeck/effeck' ? ['Docs','Golden set'] : slug==='Effect-TS/effect' ? ['Docs','Packages'] : ['Docs']
  assert(JSON.stringify(names)===JSON.stringify(expected), 'Declared app tabs and injected tabs: '+slug)
  assert(all('nav[aria-label="Repository"] > a').findIndex(link=>link.textContent==='Wiki') < all('nav[aria-label="Repository"] > a').indexOf(declared[0]), 'Declared apps follow Wiki: '+slug)
  console.log(slug+': '+declared.length+' declared tabs ('+names.join(', ')+')')
  const nav = all('nav[aria-label="Repository"] > a')
  assert(nav.map(link => link.textContent.replace(/\d+$/, '').trim()).join('|') === ['Code','Issues','Pull requests','Runs','Flows','Wiki',...expected,'Settings'].join('|'), 'Full repository tab order: '+slug)
  assert(declared.every(link => !link.querySelector('.repo-ui-counter')), 'Declared tabs carry no count: '+slug)
  assert(all('.repo-ui-sidebar-section h2').map(node=>node.textContent).join('|') === 'Releases', 'Only Releases in home sidebar: '+slug)
  const config=m.repo.config.home??[]
  const apps=config.filter(b=>b.type==='app')
  assert(all('.repo-code-home-app').length===apps.length,'Config app cards: '+slug)
  assert(all('.repo-ui-btn-primary').length===1,'One primary action: '+slug)
  const configured=config.find(b=>b.type==='fixed-by-agents')
  const fixed=configured ? {...configured, issues:configured.issues.filter(n=>{const item=m.issues.find(i=>i.n===n); return item?.state==='closed' && item.receipt?.landed})} : undefined
  assert(all('.repo-code-home-evidence').length===(fixed?.issues.length??0),'Config issue evidence rows: '+slug)
  if(fixed?.compact){
    assert(all('.repo-code-home-fix-links a').length===fixed.issues.length*2,'Compact fixes link issue and main SHA: '+slug)
    assert(all('.repo-code-home-fix > time').length===fixed.issues.length,'Compact fixes show their recorded landing date: '+slug)
  } else if(fixed){
    const stageCount=fixed.issues.reduce((sum,n)=>{const issue=m.issues.find(i=>i.n===n);return sum+(slug==='smithers-canary/smithers'?Object.values(issue.receipt??{}).length:5)},0)
    assert(all('.repo-code-home-evidence .repo-issues-receipt > li').length===stageCount,'Each evidence row shows its recorded queue stages or all five PR stages: '+slug)
    const dates=fixed.issues.reduce((sum,n)=>sum+Object.values(m.issues.find(i=>i.n===n).receipt??{}).length,0)
    assert(all('.repo-code-home-evidence .repo-issues-receipt time').length===dates,'Only recorded stages get dates: '+slug)
  }
  if(slug==='effeck/effeck') {
    assert(all('.repo-code-home-readme').length===1,'Configured README renders once after Files')
    assert(all('.repo-code-home-links a').some(a=>a.getAttribute('href')==='#/smithers.sh/effeck/effeck/issues'),'Pinned home issue-report link stays in the mock')
  }
  if(apps.length){
    await click(qs('.repo-code-home-app'))
    assert(qs('.repo-frame-confirm label').textContent==='Issue number','App opens missing input form')
    assert(qs('.repo-code-home-app').title==='/issue.implement','App carries its slash command')
  }
}
for (const width of [390, 1280, 1440]) {
  await mount('maya/tinyhttp', {}, 'ask=sample&still=1', width)
  for (const theme of ['light','dark']) {
    document.documentElement.dataset.theme=theme
    assert(window.getComputedStyle(qs('.repo-frame-search-toggle')).display===(width<768?'inline-flex':'none'), 'Search visibility '+theme+' '+width)
    assert(window.getComputedStyle(qs('.repo-frame-ask-button')).fontSize==='14px', 'Ask size '+theme+' '+width)
    assert(qs('.repo-frame-ask-card'), 'Sample cards render '+theme+' '+width)
  }
}
document.documentElement.dataset.theme='light'

await mount('maya/tinyhttp', {net:'slow'}, 'ask=open&still=1')
assert(qs('.repo-frame-loading'), 'Slow Code home shows loading state')
await click(qs('.repo-frame-suggestion'))
assert(qs('.repo-frame-typing'), 'Slow Ask shows typing state')
await m.act(async()=>wait(1550))
assert(qs('.repo-frame-ask-card'), 'Slow Ask resolves to sample evidence')

await mount('maya/tinyhttp', {data:'empty'}, 'still=1')
assert(text().includes('tinyhttp is empty.'), 'Empty Code home shows setup')
assert(!qs('.repo-code-home-file-table'), 'Empty Code home does not show fixture files')

await mount('maya/tinyhttp', {role:'reader'}, 'dialog=sandbox&still=1')
assert(text().includes('Only members of maya/tinyhttp can run a sandbox.'), 'Reader sees sandbox denial')

const ids=m.routes.flatMap(r=>r.screens).map(s=>s.id)
for(const id of ['code-home-ask-sample','code-home-smithers','code-home-effeck','code-home-effect']) assert(ids.includes(id),'Review screen registered: '+id)
// PM v2.1 requires the handoff on every passed agent PR card; pending and failed checks cannot claim it.
await mount('maya/tinyhttp', {}, 'still=1')
const initial=m.pulls.find(item=>item.agent)
for (const [state, checkState, shouldHandoff] of [['open','success',true], ['open','pending',false], ['open','failure',false], ['merged','success',false]]) {
  const item={...initial, state, checks:initial.checks.map(check=>({...check,state:checkState})), merged:state==='merged'?{by:'maya',date:initial.updated,sha:initial.commits[0]}:undefined}
  await m.act(async()=>app.render(m.React.createElement(m.MockProvider,null,m.React.createElement(m.RepoFrame,{tab:'pulls'},m.React.createElement(m.Conversation,{item,update:()=>{}})))))
  assert(Boolean(qs('.repo-pulls-conversation > [role="status"]'))===shouldHandoff, 'Review handoff is truthful: '+state+'/'+checkState)
  if(shouldHandoff) assert(qs('.repo-pulls-conversation > [role="status"]').textContent==='Checks passed. Your review is next.', 'Agent checks end with the required handoff')
}
console.log('PASS '+assertions+' frame and Code home checks')
} finally {
  if (app) await m.act(async()=>app.unmount())
  await window.happyDOM.close()
  rmSync(artifacts, {recursive:true, force:true})
}
