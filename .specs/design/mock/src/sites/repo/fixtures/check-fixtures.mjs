#!/usr/bin/env node
/** Validate the fixture world without a browser, dependencies, or wall-clock time. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
/* node check-fixtures.mjs [dataset folder under data/, default maya__tinyhttp] */
const DATASET = process.argv[2] ?? 'maya__tinyhttp'
const read = name => JSON.parse(readFileSync(new URL(`./data/${DATASET}/${name}.json`, import.meta.url), 'utf8'))
const names = ['repo','people','tree','files','blame','commits','branches','tags','labels','issues','pulls','stack','runs','approvals','flows','agents','wiki','docs','releases','settings','ask']
const data = Object.fromEntries(names.map(name => [name, read(name)]))
let checks = 0
function check(ok, reason) { checks++; assert.ok(ok, reason) }
function unique(items, key, name) { check(new Set(items.map(v => v[key])).size === items.length, `Duplicate ${name}`) }
const {repo,people,tree,files,blame,commits,branches,tags,labels,issues,pulls,stack,runs,approvals,flows,agents,wiki,docs,releases,settings,ask} = data
for(const [items,key,name] of [[people,'login','person'],[tree,'path','tree path'],[files,'path','file'],[commits,'sha','commit'],[branches,'name','branch'],[tags,'name','tag'],[labels,'name','label'],[issues,'n','issue'],[pulls,'n','pull'],[stack,'id','stack item'],[runs,'id','run'],[approvals,'id','approval'],[flows,'name','flow'],[agents,'id','agent'],[wiki,'slug','wiki page'],[docs,'slug','doc'],[releases,'tag','release'],[ask,'view','Ask view']]) unique(items,key,name)
const exists = (items,key,value,where) => check(items.some(item=>item[key]===value), `${where}: unresolved ${key} ${value}`)
const hasSha = (value,where) => { check(/^[a-f0-9]{40}$/.test(value), `${where}: invalid sha ${value}`); exists(commits,'sha',value,where) }
const hasRun = (value,where) => exists(runs,'id',value,where)
const hasIssue = (value,where) => exists(issues,'n',value,where)
const hasPull = (value,where) => exists(pulls,'n',value,where)
const hasPerson = (value,where) => exists(people,'login',value,where)
function agentMark(item, where) {
 if(item.author==='smithers-agent') check(Boolean(item.agent), `${where}: agent author is missing its run mark`)
 if(item.agent){hasRun(item.agent.run,where);exists(flows,'name',item.agent.flow,where);hasPerson(item.agent.for,where);const source=runs.find(r=>r.id===item.agent.run);check(item.agent.harness===source.harness,`${where}: harness differs from run`);check(item.agent.flow===source.flow,`${where}: flow differs from run`);if(item.date||item.opened)check(Date.parse(item.date??item.opened)>=Date.parse(source.started),`${where}: artifact predates its run`)}
}
const expected={commits:commits.length,branches:branches.length,tags:tags.length,issuesOpen:issues.filter(i=>i.state==='open').length,pullsOpen:pulls.filter(p=>['open','draft'].includes(p.state)).length,runsActive:runs.filter(r=>['running','waiting','queued'].includes(r.state)).length,contributors:new Set(commits.filter(c=>c.author!=='smithers-agent').map(c=>c.author)).size}
for(const [key,value] of Object.entries(expected))check(repo.counts[key]===value,`repo.counts.${key}: expected ${value}, got ${repo.counts[key]}`)
check(issues.length===28&&expected.issuesOpen===19,'Issue mix must be 19 open, 9 closed')
check(pulls.length===13&&pulls.filter(p=>p.state==='merged').length===7&&pulls.filter(p=>p.state==='closed').length===1,'Pull mix: original 4 open, 7 merged, 1 closed plus review example')
check(pulls.filter(p=>p.state==='draft').length===1,'One open pull must be a draft')
check(pulls.filter(p=>p.kind==='landing').length===2,'Two pulls must be landings')
check(commits.filter(c=>c.branches.includes('main')).length>=60&&commits.filter(c=>c.branches.includes('main')).length<=80,'60–80 commits on main')
check(commits.filter(c=>c.agent).length>=8,'At least eight agent commits')
check(pulls.filter(p=>p.agent).length>=5,'At least five agent pulls')
check(repo.config.home===undefined,'Default repo must not declare home blocks')
check(repo.config.docs?.root==='docs'&&repo.config.docs?.title==='Docs','Docs config')
for(const c of commits){
 hasSha(c.sha,c.title);hasPerson(c.author,c.title);agentMark(c,c.title)
 for(const parent of c.parents){hasSha(parent,c.title);check(Date.parse(commits.find(v=>v.sha===parent).date)<=Date.parse(c.date),`${c.title}: parent is newer than child`)}
 for(const name of c.branches)exists(branches,'name',name,c.title)
 if(c.pull)hasPull(c.pull,c.title)
 check(c.files.length>0&&c.checks.length>0,`${c.title}: missing diff or checks`)
}
for(const item of [...commits,...pulls]){
 for(const checkRun of item.checks)if(checkRun.run)hasRun(checkRun.run,item.title)
 for(const f of item.files){
  check(f.lines.some(l=>l.kind==='hunk'),`${item.title}/${f.path}: missing hunk`)
  check(f.additions===f.lines.filter(l=>l.kind==='add').length,`${item.title}/${f.path}: addition count`)
  check(f.deletions===f.lines.filter(l=>l.kind==='del').length,`${item.title}/${f.path}: deletion count`)
  check(f.additions+f.deletions>0,`${item.title}/${f.path}: empty diff`)
 }
}
for(const entry of tree){hasSha(entry.sha,entry.path);if(entry.kind==='file')exists(files,'path',entry.path,entry.path);if(entry.path.includes('/'))check(tree.some(p=>p.kind==='dir'&&p.path===entry.path.slice(0,entry.path.lastIndexOf('/'))),`${entry.path}: missing parent directory`)}
for(const f of files){
 exists(tree,'path',f.path,'file blob');check(f.content.length>0,`${f.path}: empty content`)
 check(tree.find(e=>e.path===f.path).size===Buffer.byteLength(f.content),`${f.path}: byte size`)
 const lines=f.content.split('\n').length
 for(const symbol of f.symbols??[]){check(symbol.line>=1&&symbol.line<=lines,`${f.path}: symbol line`);if(symbol.definition){exists(files,'path',symbol.definition.path,`${f.path}: definition`);check(symbol.definition.line>=1&&symbol.definition.line<=files.find(v=>v.path===symbol.definition.path).content.split('\n').length,`${f.path}: definition line`)}}
 for(const diagnostic of f.diagnostics??[])check(diagnostic.line>=1&&diagnostic.line<=lines,`${f.path}: diagnostic line`)
 if(f.path.startsWith('src/')||f.path==='README.md'){
  const ranges=blame.filter(b=>b.path===f.path).sort((a,b)=>a.start-b.start)
  let next=1
  for(const range of ranges){check(range.start===next&&range.end>=range.start,`${f.path}: blame gap or overlap at ${next}`);hasSha(range.sha,`${f.path}: blame`);check(commits.find(c=>c.sha===range.sha).files.some(d=>d.path===f.path),`${f.path}: blame commit did not touch file`);next=range.end+1}
  check(next===lines+1,`${f.path}: blame must cover all ${lines} lines exactly once`)
 }
}
check(blame.some(b=>b.path==='src/router.ts'&&commits.find(c=>c.sha===b.sha).agent),'Router blame includes an agent commit')
for(const b of branches){hasSha(b.head,b.name);hasPerson(b.author,b.name);if(b.pull)hasPull(b.pull,b.name);if(b.run)hasRun(b.run,b.name)}
check(branches.length===10&&branches.find(b=>b.name==='main').protected,'Nine original branches plus review example with protected main')
check(branches.some(b=>b.sandbox?.state==='running')&&branches.some(b=>b.sandbox?.state==='suspended'),'Both sandbox states')
check(branches.some(b=>b.behind===40),'Stale branch is 40 behind')
for(const t of tags){hasSha(t.sha,t.name);if(t.release)exists(releases,'tag',t.name,t.name)}
for(const i of issues){
 hasPerson(i.author,`issue #${i.n}`);for(const login of i.assignees)hasPerson(login,i.title)
 for(const name of i.labels)exists(labels,'name',name,i.title)
 for(const p of i.pulls)hasPull(p,i.title)
 if(i.todo){exists(stack,'id',i.todo,i.title);check(stack.find(s=>s.id===i.todo).issue===i.n,`${i.title}: reciprocal TODO`)}
 for(const comment of i.comments){hasPerson(comment.author,i.title);agentMark(comment,i.title)}
 for(const event of i.events){hasPerson(event.actor,i.title);if(event.sha)hasSha(event.sha,i.title);if(event.pull)hasPull(event.pull,i.title);if(event.run)hasRun(event.run,i.title);if(event.label)exists(labels,'name',event.label,i.title)}
 const r=i.receipt
 if(r){hasPerson(r.reported.by,i.title);if(r.accepted)hasPerson(r.accepted.by,i.title);if(r.working)hasRun(r.working.run,i.title);if(r.review)hasPull(r.review.pull,i.title);if(r.landed){hasSha(r.landed.sha,i.title);check(commits.find(c=>c.sha===r.landed.sha).branches.includes('main'),`${i.title}: landed receipt not on main`)}}
}
check(issues.filter(i=>i.receipt).length>=4,'Four factory receipts')
check(issues.find(i=>i.n===31).receipt?.landed,'Issue #31 has full landed evidence')
for(const p of pulls){
 hasPerson(p.author,p.title);agentMark(p,p.title)
 for(const s of p.commits)hasSha(s,p.title)
 for(const i of p.fixes){hasIssue(i,p.title);check(issues.find(x=>x.n===i).pulls.includes(p.n),`${p.title}: reciprocal issue link`)}
 for(const name of p.labels)exists(labels,'name',name,p.title)
 for(const person of p.reviewers)hasPerson(person,p.title)
 for(const item of [...p.comments,...p.reviews,...p.reviewComments]){hasPerson(item.author,p.title);agentMark(item,p.title)}
 if(p.merged){hasPerson(p.merged.by,p.title);check(p.merged.by!=='smithers-agent',`${p.title}: person must merge`);hasSha(p.merged.sha,p.title);check(commits.find(c=>c.sha===p.merged.sha).branches.includes('main'),`${p.title}: merged commit missing from main`)}
 for(const rc of p.reviewComments){exists(files,'path',rc.path,p.title);check(rc.line>0&&rc.line<=files.find(f=>f.path===rc.path).content.split('\n').length+20,`${p.title}: review line`)}
}
for(const s of stack){hasPerson(s.owner,s.id);if(s.issue)hasIssue(s.issue,s.id);if(s.pull)hasPull(s.pull,s.id);if(s.run)hasRun(s.run,s.id);if(s.state==='failed')check(Boolean(s.failure),`${s.id}: failure reason`);if(s.state==='needs-answer')check(s.question?.options.length>=2,`${s.id}: question and options`)}
for(const state of ['queued','working','needs-answer','ready','failed','merged'])check(stack.some(s=>s.state===state),`Stack missing ${state}`)
for(const r of runs){
 exists(flows,'name',r.flow,r.id);hasPerson(r.trigger.by,r.id);if(r.issue)hasIssue(r.issue,r.id);if(r.pull)hasPull(r.pull,r.id);if(r.branch)exists(branches,'name',r.branch,r.id)
 check(r.stages.length>=3&&r.stages.length<=6,`${r.id}: 3–6 stages`)
 check(r.cost.usd>=0&&r.cost.tokens>0,`${r.id}: real cost and tokens`)
 if(r.state==='failed'){check(Boolean(r.failure?.reason),`${r.id}: missing actionable failure`);exists(r.stages,'id',r.failure.stage,r.id)}
 if(r.state==='waiting')check(r.approvals.some(id=>approvals.find(a=>a.id===id)?.state==='waiting'),`${r.id}: waiting without pending approval`)
 for(const id of r.approvals){exists(approvals,'id',id,r.id);check(approvals.find(a=>a.id===id).run===r.id,`${r.id}: reciprocal approval`)}
 for(const event of r.trace)exists(r.stages,'id',event.stage,r.id)
 check(r.trace.length>0,`${r.id}: missing trace`)
 check(Date.parse(r.started)<=Date.parse('2026-10-17T21:00:00Z'),`${r.id}: future run`)
}
check(runs.length===19&&runs.some(r=>r.resumed)&&runs.some(r=>r.state==='cancelled'),'18 original runs plus review example, recovery, cancellation')
const live=runs.find(r=>r.state==='running');check(live.stages.length===5&&live.stages[2].state==='running','Live run at stage 3 of 5')
for(const a of approvals){hasRun(a.run,a.id);hasPerson(a.askedOf,a.id);if(a.decided){hasPerson(a.decided.by,a.id);check(a.options.includes(a.decided.option),`${a.id}: decision option`);check(a.decided.by!=='smithers-agent',`${a.id}: person decides`)}}
check(approvals.length===4&&approvals.filter(a=>a.state==='waiting').length===2,'Four approvals, two waiting')
for(const f of flows){exists(files,'path',f.file,f.name);for(const id of f.runs){hasRun(id,f.name);check(runs.find(r=>r.id===id).flow===f.name,`${f.name}: reciprocal run`)}for(const role of f.roles)exists(agents,'id',role.agent,f.name);for(const [from,to] of f.graph.edges){exists(f.graph.nodes,'id',from,f.name);exists(f.graph.nodes,'id',to,f.name)}check(f.graph.nodes.length>=4&&f.graph.nodes.length<=8,`${f.name}: graph size`)}
for(const a of agents)for(const name of a.flows)exists(flows,'name',name,a.id)
for(const page of wiki){hasPerson(page.author,page.slug);if(page.provenance.run)hasRun(page.provenance.run,page.slug);for(const proposal of page.proposals??[])hasRun(proposal.run,page.slug);for(const revision of page.revisions??[]){hasPerson(revision.author,page.slug);agentMark(revision,page.slug)}}
check(wiki.length===6&&wiki.flatMap(p=>p.proposals??[]).length===2,'Six wiki pages, two proposals')
for(const d of docs)check(d.body===files.find(f=>f.path===`docs/${d.slug}.md`)?.content,`${d.slug}: doc differs from file`)
check(docs.length===6&&releases.length===4,'Six docs, four releases')
for(const r of releases){exists(tags,'name',r.tag,r.tag);hasPerson(r.author,r.tag);for(const n of r.pulls){hasPull(n,r.tag);check(pulls.find(p=>p.n===n).state==='merged',`${r.tag}: notes cite unmerged pull`);check(Date.parse(pulls.find(p=>p.n===n).merged.date)<=Date.parse(r.date),`${r.tag}: release predates its pull`)}}
for(const m of [...settings.members,...settings.invites])hasPerson(m.login,'settings')
for(const s of settings.secrets){check(!('value' in s),'Secret value leaked');for(const f of s.usedBy)exists(flows,'name',f,s.name)}
for(const sample of ask){for(const card of sample.cards??[]){if(card.kind==='file')exists(files,'path',card.ref,sample.view);if(card.kind==='run')hasRun(card.ref,sample.view);if(card.kind==='issue')hasIssue(Number(card.ref),sample.view);if(card.kind==='pull')hasPull(Number(card.ref),sample.view);if(card.kind==='commit')hasSha(card.ref,sample.view);if(card.kind==='flow')exists(flows,'name',card.ref,sample.view)}for(const link of sample.answer.matchAll(/\/blob\/main\/([^?\)]+)\?L=(\d+)/g)){exists(files,'path',link[1],sample.view);check(Number(link[2])<=files.find(f=>f.path===link[1]).content.split('\n').length,`${sample.view}: citation line`)}}
console.log(`PASS ${checks} checks · ${names.length} JSON subjects`)
console.log(`${files.length} files · ${commits.length} commits (72 main) · ${branches.length} branches · ${tags.length} tags`)
console.log(`${issues.length} issues (19 open, 9 closed) · ${pulls.length} pulls (5 open including 1 draft, 7 merged, 1 closed) · ${stack.length} stack items`)
console.log(`${runs.length} runs · ${approvals.length} approvals · ${flows.length} flows · ${wiki.length} wiki pages · ${docs.length} docs · ${releases.length} releases · ${ask.length} Ask samples`)
console.log('All SHA/run/issue/pull references resolve; source and README blame cover every line once; failures and agent marks are complete.')
