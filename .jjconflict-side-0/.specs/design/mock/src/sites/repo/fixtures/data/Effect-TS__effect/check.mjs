#!/usr/bin/env node
/** Offline fixture integrity and source receipts. No browser, VCS, network or writes. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const readOne = name => JSON.parse(readFileSync(join(here, `${name}.json`), 'utf8'))
// The blobs ship as two halves under jj's 1 MiB new-file limit (index.ts joins them the same way).
const read = name => name === 'files' ? [...readOne('files-a'), ...readOne('files-b')] : readOne(name)
const fields = ['repo','people','tree','files','blame','commits','branches','tags','labels','issues','pulls','stack','runs','approvals','flows','agents','wiki','docs','releases','settings','ask']
const d = Object.fromEntries(fields.map(key => [key, read(key)]))
const extras = { relations: read('relations'), releasePlan: read('release-plan'), ciProjects: read('ci-projects'), packageReleases: read('package-releases') }
const manifest = read('manifest')
const packages = d.repo.config.packages
const now = Date.parse(manifest.MOCK_NOW)
let checks = 0
function ok(condition, message) { checks++; assert.ok(condition, message) }
function eq(actual, expected, message) { checks++; assert.deepEqual(actual, expected, message) }
function unique(list, key, name) { const ids = list.map(x => x[key]); eq(new Set(ids).size, ids.length, `duplicate ${name}`); return new Map(list.map(x => [x[key], x])) }
const people = unique(d.people, 'login', 'person')
const files = unique(d.files, 'path', 'blob')
const tree = unique(d.tree, 'path', 'tree path')
const commits = unique(d.commits, 'sha', 'commit')
const branches = unique(d.branches, 'name', 'branch')
const tags = unique(d.tags, 'name', 'tag')
const issues = unique(d.issues, 'n', 'issue')
const pulls = unique(d.pulls, 'n', 'pull')
const runs = unique(d.runs, 'id', 'run')
const approvals = unique(d.approvals, 'id', 'approval')
const flows = unique(d.flows, 'name', 'flow')
const agents = unique(d.agents, 'id', 'agent')
const labels = unique(d.labels, 'name', 'label')
const stack = unique(d.stack, 'id', 'stack entry')
const pkgs = unique(packages, 'name', 'package')
unique(packages, 'slug', 'package slug')
unique(d.docs, 'slug', 'document')
unique(d.wiki, 'slug', 'wiki page')
unique(extras.packageReleases.map(x => ({ id: `${x.package}@${x.version}` })), 'id', 'package release')

const has = (map, id, message) => ok(map.has(id), `${message}: ${id}`)
const person = (id, message = 'unknown person') => has(people, id, message)
const enums = (value, choices, message) => ok(choices.includes(value), `${message}: ${value}`)
const runStates = ['queued','running','waiting','failed','succeeded','cancelled']
function mark(value, author) {
  if (author === 'smithers-agent') ok(value, 'agent artifact missing its run mark')
  if (!value) return
  eq(author, 'smithers-agent', 'marked artifact must have agent author')
  has(runs, value.run, 'agent mark run'); has(flows, value.flow, 'agent mark flow'); person(value.for)
  ok(people.get(value.for)?.kind === 'human', 'agent acts for a person')
  eq(runs.get(value.run).flow, value.flow, 'agent mark flow agrees with run')
}
function comments(items) { for (const c of items) { person(c.author); mark(c.agent, c.author); ok(c.body.length > 0, 'empty comment') } }
function checkList(items) { for (const c of items) { enums(c.state, ['success','failure','pending','skipped'], 'check state'); if (c.run) has(runs, c.run, 'check run'); ok(c.detail, 'check reason missing') } }
function diffList(items) {
  ok(items.length > 0, 'commit/PR has no changed files')
  for (const f of items) {
    has(tree, f.path, 'changed path'); enums(f.status, ['added','modified','deleted','renamed'], 'diff status')
    ok(f.additions >= 0 && f.deletions >= 0, 'negative diff count')
    const additions = f.lines.filter(l => l.kind === 'add'), deletions = f.lines.filter(l => l.kind === 'del')
    eq(f.additions, additions.length, 'diff addition count'); eq(f.deletions, deletions.length, 'diff deletion count')
    for (const l of f.lines) {
      enums(l.kind, ['hunk','ctx','add','del'], 'diff line kind')
      if (l.kind === 'add' || l.kind === 'ctx') ok(Number.isInteger(l.new) && l.new > 0, 'new line number')
      if (l.kind === 'del' || l.kind === 'ctx') ok(Number.isInteger(l.old) && l.old > 0, 'old line number')
      if (files.has(f.path) && l.new) eq(l.text, files.get(f.path).content.split('\n')[l.new - 1], `real source hunk ${f.path}:${l.new}`)
    }
  }
}

// Contract counts and cast.
eq(manifest.MOCK_NOW, '2026-10-18T05:00:00Z', 'mock clock')
eq([d.repo.owner,d.repo.name,d.repo.slug,d.repo.defaultBranch,d.repo.visibility,d.repo.license], ['Effect-TS','effect','Effect-TS/effect','main','public','MIT'], 'repository identity')
eq(d.repo.github, 'https://github.com/Effect-TS/effect', 'GitHub sync source')
eq(d.repo.description, 'Build production-ready applications in TypeScript.', 'repository description')
eq([...people.keys()].sort(), ['cora','dev-ahn','maya','smithers-agent'], 'fictional cast only')
for (const [key,count] of Object.entries({ commits:50,issues:24,pulls:10,stack:6,runs:16,approvals:3,flows:6,agents:4,wiki:4,releases:4 })) eq(d[key].length, count, `${key} count`)
eq(packages.length, 38, 'package count'); eq(packages.filter(p => !p.private).length, 31, 'public packages'); eq(packages.filter(p => p.private).length, 7, 'private tools')
eq(d.commits.filter(c => c.author === 'smithers-agent').length, 8, 'eight agent-made commits')
eq(d.repo.counts, { commits:d.commits.length,branches:d.branches.length,tags:d.tags.length,issuesOpen:d.issues.filter(x => x.state === 'open').length,pullsOpen:d.pulls.filter(x => ['open','draft'].includes(x.state)).length,runsActive:d.runs.filter(x => ['running','queued','waiting'].includes(x.state)).length,contributors:d.people.length }, 'header counts')
eq(d.repo.config.docs, { root:'packages',title:'Docs' }, 'docs declaration')
eq(d.repo.config.home.find(block=>block.type==='links').links, [{label:'Packages',url:'packages'},{label:'Version packages',url:'releases/plan'},{label:'Docs',url:'docs'}], 'home links')

ok(!d.repo.config.monorepo.ownership, "no Ownership settings metadata")
ok(!files.has(".smithers/ownership.json"), "no invented Ownership source")
// Package manifests, paths, dependency kinds and owners.
for (const p of packages) {
  has(tree, p.path, 'package root'); has(files, `${p.path}/package.json`, 'package manifest')
  const m = JSON.parse(files.get(`${p.path}/package.json`).content)
  eq([p.name,p.version,p.private], [m.name,m.version,Boolean(m.private)], 'package manifest facts')
  ok(p.description && p.slug && p.docs, 'package discovery fields')
  eq(p.family, p.path.split('/').length === 2 ? '' : p.path.split('/')[1], 'directory family')
  eq(p.private ? p.version : '4.0.0-rc.118', p.version, 'public version')
  ok(p.owners.length, 'package owners'); p.owners.forEach(x => person(x))
  if (p.readme) has(files, p.readme, 'package README')
  if (p.changelog) has(tree, p.changelog, 'changelog path')
  for (const [section, kind] of [['dependencies','runtime'],['peerDependencies','peer'],['devDependencies','dev'],['optionalDependencies','optional']]) {
    eq(p.dependencies.filter(x => x.kind === kind).map(x => x.name).sort(), Object.keys(m[section] ?? {}).sort(), `${p.name} ${kind} dependency facts`)
  }
  for (const dep of p.dependencies) enums(dep.kind, ['runtime','peer','dev','optional'], 'dependency kind')
}
for (const flow of Object.values(d.repo.config.monorepo.flows)) has(flows, flow, 'monorepo flow binding')
for (const path of [d.repo.config.monorepo.workspace,d.repo.config.monorepo.changesets.config,...d.repo.config.monorepo.ci.workflows]) has(files, path, 'configuration source blob')

// Code and complete blame ranges.
for (const t of d.tree) {
  has(commits, t.sha, 'tree commit'); enums(t.kind, ['file','dir'], 'tree kind'); ok(!t.path.startsWith('/') && !t.path.includes('..'), 'relative tree path')
  const parent = dirname(t.path)
  if (parent !== '.') has(tree, parent, 'tree parent')
  if (t.kind === 'file') ok(Number.isInteger(t.size) && t.size >= 0, 'file byte size')
}
for (const f of d.files) {
  has(tree, f.path, 'blob tree entry'); enums(f.lang, ['ts','tsx','js','json','md','yaml','sh','txt','toml'], 'blob language')
  ok(f.content.length > 0, 'empty blob')
  if (f.lang === 'json') JSON.parse(f.content)
  for (const s of f.symbols ?? []) { ok(s.line > 0 && s.line <= f.content.split('\n').length, 'symbol line'); enums(s.kind,['function','class','method','type','const','interface'],'symbol kind') }
}
const blamePaths = [...new Set(d.blame.map(x => x.path))]
eq(blamePaths.length, 4, 'four blamed files')
for (const path of blamePaths) {
  has(files, path, 'blame file'); let next = 1
  for (const b of d.blame.filter(x => x.path === path).sort((a,b) => a.start-b.start)) {
    eq(b.start, next, 'contiguous blame'); ok(b.end >= b.start, 'positive blame interval'); has(commits, b.sha, 'blame commit'); ok(commits.get(b.sha).files.some(f=>f.path===path),'blame commit touches its file'); next = b.end + 1
  }
  eq(next - 1, files.get(path).content.split('\n').length, 'blame covers final line')
}
const schema = files.get('packages/effect/src/Schema.ts').content.split('\n')
eq(schema.length, 602, '600 source lines, trailing excerpt comment, final newline')
ok(schema[600].includes('first 600 lines') && schema[600].startsWith('//'), 'explicit Schema excerpt marker')
for (const required of ['README.md','packages/effect/src/workflow/Workflow.ts','packages/sql/pg/src/PgClient.ts','packages/sql/pg/src/PgConnection.ts','packages/sql/pg/src/PgTypes.ts','packages/platform/node/src/NodeHttpServer.ts','packages/atom/react/src/Hooks.ts','.github/workflows/check.yml','.github/workflows/release.yml']) has(files, required, 'required source')
for (const c of d.commits) {
  ok(/^[a-f0-9]{40}$/.test(c.sha), 'commit SHA shape'); person(c.author); mark(c.agent,c.author); diffList(c.files); checkList(c.checks)
  for (const parent of c.parents) { has(commits,parent,'commit parent'); ok(Date.parse(commits.get(parent).date) <= Date.parse(c.date), 'parent older than child') }
  if (c.pull) has(pulls,c.pull,'commit pull')
}
for (let i=1;i<d.commits.length;i++) ok(d.commits[i-1].date >= d.commits[i].date,'commits newest first')
ok(Date.parse(d.commits[0].date)-Date.parse(d.commits.at(-1).date) > 26*86400000, 'history spans four weeks')
for (const c of d.commits.slice(0,10)) ok(c.files.every(f => f.lines.length > 3 && f.lines.some(x => x.kind === 'ctx')), 'newest ten have source hunks')
for (const b of d.branches) { has(commits,b.head,'branch head'); person(b.author); if(b.run)has(runs,b.run,'branch run');if(b.pull)has(pulls,b.pull,'branch PR') }
eq(d.branches.filter(b=>b.isDefault).map(b=>b.name),['main'],'default branch')
for (const tag of d.tags) has(commits,tag.sha,'tag commit')

// Conversations, human reviews and durable work references.
for (const i of d.issues) {
  enums(i.state,['open','closed'],'issue state');person(i.author);i.assignees.forEach(x=>person(x));i.labels.forEach(x=>has(labels,x,'issue label'));comments(i.comments)
  if(i.todo)has(stack,i.todo,'issue TODO')
  for (const n of i.pulls) {has(pulls,n,'issue PR');ok(pulls.get(n).fixes.includes(i.n),'issue/PR reciprocal reference')}
  for (const e of i.events) {
    person(e.actor);enums(e.kind,['labeled','assigned','referenced','closed','reopened','todo','run'],'timeline kind')
    if(e.label)has(labels,e.label,'timeline label');if(e.assignee)person(e.assignee);if(e.sha)has(commits,e.sha,'timeline commit');if(e.pull)has(pulls,e.pull,'timeline pull');if(e.run)has(runs,e.run,'timeline run')
  }
  if(i.receipt){person(i.receipt.reported.by);if(i.receipt.accepted)person(i.receipt.accepted.by);if(i.receipt.working)has(runs,i.receipt.working.run,'receipt run');if(i.receipt.review)has(pulls,i.receipt.review.pull,'receipt review');if(i.receipt.landed)has(commits,i.receipt.landed.sha,'receipt landing')}
}
for (const p of d.pulls) {
  enums(p.state,['open','draft','merged','closed'],'PR state');person(p.author);mark(p.agent,p.author);p.reviewers.forEach(x=>person(x));checkList(p.checks);diffList(p.files);comments(p.comments)
  p.commits.forEach(x=>has(commits,x,'PR commit'));p.fixes.forEach(x=>has(issues,x,'PR fixed issue'));p.labels.forEach(x=>has(labels,x,'PR label'))
  for(const r of p.reviews){person(r.author);mark(r.agent,r.author);enums(r.state,['approved','changes_requested','commented'],'review state');ok(people.get(r.author).kind==='human','human review')}
  for(const c of p.reviewComments){person(c.author);mark(c.agent,c.author);has(tree,c.path,'review path')}
  if(p.state==='merged'){ok(p.merged,'merged receipt');person(p.merged.by);has(commits,p.merged.sha,'merged SHA');ok(people.get(p.merged.by).kind==='human','human merge')}
}
for(const s of d.stack){enums(s.state,['queued','working','needs-answer','ready','failed','merged'],'stack state');person(s.owner);if(s.issue)has(issues,s.issue,'stack issue');if(s.pull)has(pulls,s.pull,'stack pull');if(s.run)has(runs,s.run,'stack run');if(s.state==='failed')ok(s.failure,'stack failure reason');if(s.state==='needs-answer')ok(s.question?.options.length>1,'answer form')}
for(const r of d.runs){
  has(flows,r.flow,'run flow');enums(r.state,runStates,'run state');person(r.trigger.by);if(r.issue)has(issues,r.issue,'run issue');if(r.pull)has(pulls,r.pull,'run pull');if(r.branch)has(branches,r.branch,'run branch')
  unique(r.stages,'id','run stage');const stages=new Set(r.stages.map(x=>x.id))
  for(const s of r.stages){enums(s.state,[...runStates,'skipped'],'stage state');ok(s.summary&&s.log.length,'stage reason/log')}
  r.approvals.forEach(x=>{has(approvals,x,'run approval');eq(approvals.get(x).run,r.id,'approval run reciprocity')})
  for(const t of r.trace){ok(stages.has(t.stage),'trace stage');enums(t.kind,['tool','message','checkpoint','error','approval'],'trace kind')}
  if(r.state==='failed'){ok(r.failure?.reason,'failed run reason');ok(stages.has(r.failure.stage),'failure stage');eq(r.stages.find(s=>s.id===r.failure.stage).state,'failed','failed stage state')}
  if(r.state==='waiting')ok(r.approvals.some(id=>approvals.get(id).state==='waiting'),'waiting approval')
  if(r.finished)ok(Date.parse(r.finished)>=Date.parse(r.started),'run finish after start')
}
for(const a of d.approvals){has(runs,a.run,'approval run');person(a.askedOf);enums(a.state,['waiting','approved','denied'],'approval state');ok(a.options.length>1,'approval choices');if(a.decided){person(a.decided.by);ok(people.get(a.decided.by).kind==='human','person decides approval');ok(a.options.includes(a.decided.option),'selected approval option')}}
for(const f of d.flows){has(files,f.file,'flow source');f.runs.forEach(x=>{has(runs,x,'flow run');eq(runs.get(x).flow,f.name,'flow run reciprocity')});f.roles.forEach(x=>has(agents,x.agent,'flow agent'));const ids=new Set(f.graph.nodes.map(x=>x.id));for(const edge of f.graph.edges)ok(edge.every(x=>ids.has(x)),'flow edge endpoints')}
for(const a of d.agents)a.flows.forEach(x=>has(flows,x,'agent flow'))
for(const page of d.wiki){person(page.author);if(page.provenance.run)has(runs,page.provenance.run,'wiki provenance');for(const p of page.proposals??[])has(runs,p.run,'wiki proposal run')}
for(const release of d.releases){person(release.author);has(tags,release.tag,'release tag');release.pulls.forEach(n=>has(pulls,n,'release PR'));ok(release.prerelease,'rc prerelease')}
for(const member of d.settings.members)person(member.login)
for(const secret of d.settings.secrets){ok(!('value' in secret),'opaque secrets');secret.usedBy.forEach(name=>has(flows,name,'secret consumer'))}
for(const sample of d.ask)for(const c of sample.cards??[]){const map={file:files,issue:issues,pull:pulls,run:runs,commit:commits,flow:flows}[c.kind];has(map,['issue','pull'].includes(c.kind)?Number(c.ref):c.ref,'Ask card')}

// Stage-4 operational evidence; package scope never erases cross-package contents.
for(const relation of extras.relations){
  const map={issue:issues,pull:pulls,commit:commits,run:runs,stack}[relation.kind]
  has(map,['issue','pull'].includes(relation.kind)?Number(relation.ref):relation.ref,'related subject')
  relation.packages.forEach(x=>has(pkgs,x,'related package'));relation.paths.forEach(x=>has(tree,x,'relation changed path'));relation.owners.forEach(x=>person(x));enums(relation.basis,['declared','changed-path','dependency','shared-input'],'association basis')
  if(relation.kind==='pull')eq(relation.paths,pulls.get(Number(relation.ref)).files.map(x=>x.path),'PR association retains every changed path')
}
const plan=extras.releasePlan
has(runs,plan.preview.run,'release plan run');has(commits,plan.preview.baseSha,'release base');has(files,plan.source,'release config')
eq(plan.changesets.map(x=>x.id).sort(),['concrete-schema-brand-identifiers','workflow-reset-retry'],'real pending changesets')
for(const c of plan.changesets){has(files,c.path,'pending changeset blob');eq(c.packages,[{name:'effect',type:'patch'}],'direct patch request');ok(!c.path.startsWith('.changeset/pre/'),'pending not historical')}
eq([...plan.fixedGroup].sort(),packages.filter(p=>!p.private).map(p=>p.name).sort(),'31-member public fixed group')
eq(plan.packages.map(p=>p.name).sort(),[...plan.fixedGroup].sort(),'full release impact')
eq(plan.fixedGroupExpansion.length,30,'fixed expansion distinct from direct change')
eq(plan.directChanges.length,1,'one direct package')
eq(plan.privatePackagesExcluded.length,7,'private tools excluded')
eq(plan.tooling.version,'3.0.3','pinned Changesets')
eq(plan.nextVersion,null,'no guessed next version')
for(const p of plan.packages){has(pkgs,p.name,'planned package');ok(!pkgs.get(p.name).private,'public release only');eq(p.nextVersion,null,'exact versions await execution')}
for(const p of plan.dependencyPropagation){has(pkgs,p.package,'dependency propagation package');has(pkgs,p.dependency,'dependency propagation target');ok(['runtime','peer'].includes(p.kind),'dev dependency not publishing impact')}
for(const p of extras.packageReleases){has(pkgs,p.package,'release package');ok(!pkgs.get(p.package).private,'private package has no release');has(tags,p.tag,'package release tag');has(tree,p.source,'changelog source');eq(p.publication,'scenario','publication provenance');ok(p.body.length>0,'technical release notes')}
const ci=extras.ciProjects
has(files,ci.source,'CI source');has(files,ci.workflow,'workflow source');eq(ci.projects.length,38,'all workspaces in CI map')
eq(ci.jobs.length,8,'eight real workflow jobs, not per-package jobs')
for(const project of ci.projects){has(pkgs,project.package,'CI project package');eq(project.path,pkgs.get(project.package).path,'project path');for(const rt of project.runtimes){enums(rt,['Node','Deno','Bun'],'runtime');ok(project.commands[rt].includes('--run')||project.commands[rt].includes('vitest run'),'sandbox commands cannot watch')}}
for(const matrix of ci.matrices){
  has(runs,matrix.run,'matrix run');eq(matrix.state,runs.get(matrix.run).state,'matrix overall status');eq(matrix.results.length,38*3,'runtime cells')
  unique(matrix.results.map(x=>({id:`${x.package}:${x.runtime}`})),'id','runtime cell')
  for(const result of matrix.results){has(pkgs,result.package,'matrix package');eq(result.run,matrix.run,'cell run');ok(runs.get(matrix.run).stages.some(s=>s.id===result.stage),'cell stage');enums(result.state,['success','failure','excluded','skipped','missing','running','queued','cancelled'],'cell state');ok(result.reason,'truthful cell reason');if(result.path)has(files,result.path,'failure test source')}
}
const failedMatrix=ci.matrices.find(x=>x.run==='run-4802')
const bun=failedMatrix.results.find(x=>x.package==='@effect/sql-sqlite-bun'&&x.runtime==='Bun')
eq(bun.state,'failure','connected Bun failure');ok(bun.path&&bun.line&&bun.test,'actionable Bun failure')
for(const rt of ['Node','Deno'])eq(failedMatrix.results.find(x=>x.package==='@effect/sql-sqlite-bun'&&x.runtime===rt).state,'skipped','non-Bun SQLite is not green')
eq(failedMatrix.results.find(x=>x.package==='@effect/platform-node'&&x.runtime==='Deno').state,'excluded','Node project excluded on Deno')
const pushMatrix=ci.matrices.find(x=>x.event==='push')
ok(pushMatrix.sharedChecks.filter(x=>['build','bundle'].includes(x.stage)).every(x=>x.state==='skipped'),'PR-only jobs skipped on push')
const pgIssue=issues.get(42),pgPull=pulls.get(101)
eq(pgIssue.author,'dev-ahn','scenario reporter');ok(pgIssue.events.some(e=>e.kind==='todo'&&e.actor==='cora'),'cora makes TODO');eq(pgPull.author,'smithers-agent','agent change');ok(pgPull.files.some(f=>f.path.startsWith('packages/sql/pg/'))&&pgPull.files.some(f=>f.path==='packages/effect/src/sql/SqlClient.ts'),'cross-package source change');ok(pgPull.reviews.some(r=>r.author==='maya'&&r.state==='changes_requested'),'maya reviews');ok(!pgIssue.receipt.landed&&!pgPull.merged,'no fabricated successful landing')

// Timestamp sanity and identity scrub. Checkout access is optional, fixture references always checked.
function visit(value,key='') {
  if(Array.isArray(value)){for(const item of value)visit(item,key);return}
  if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value))visit(v,k);return}
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)){ok(Number.isFinite(Date.parse(value)),`valid timestamp ${key}`);ok(Date.parse(value)<=now,`timestamp after MOCK_NOW ${key}`)}
}
visit(d);visit(extras)
const allJson=readdirSync(here).filter(x=>x.endsWith('.json')).map(x=>({name:x,text:readFileSync(join(here,x),'utf8')}))
for(const f of allJson){ok(!/Thanks\s+@/.test(f.text),`contributor thanks in ${f.name}`);ok(!/\b(?:undefined|NaN)\b/.test(f.text)||f.name.startsWith('files-')||f.name==='docs.json'||f.name==='commits.json'||f.name==='pulls.json'||f.name==='releases.json'||f.name==='package-releases.json',`invalid serialized value ${f.name}`)}
// The source checkout is machine-local: audit it only when EFFECT_SOURCE names it.
const checkout=process.env.EFFECT_SOURCE??''
for(const receipt of manifest.sourceFiles){
  has(files,receipt.path,'source receipt blob');eq(createHash('sha256').update(files.get(receipt.path).content).digest('hex'),receipt.fixtureSha256,'fixture content hash')
  if(receipt.source==='checkout'&&checkout&&existsSync(join(checkout,receipt.path)))eq(createHash('sha256').update(readFileSync(join(checkout,receipt.path))).digest('hex'),receipt.sha256,'checkout content hash')
}
if(checkout&&existsSync(checkout)){
  for(const receipt of manifest.releaseSources)eq(createHash('sha256').update(readFileSync(join(checkout,receipt.path))).digest('hex'),receipt.sha256,'release source hash')
  let handles=new Set()
  for(const p of packages){const path=join(checkout,p.path,'CHANGELOG.md');if(existsSync(path)){for(const match of readFileSync(path,'utf8').matchAll(/Thanks\s+@([\w-]+)/g))handles.add(match[1])}}
  const pattern=new RegExp('(?<![\\w-])@?(?:'+[...handles].sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![\\w-])')
  for(const f of allJson)ok(!pattern.test(f.text),`upstream contributor identity in ${f.name}`)
  const excluded=new Set(['node_modules','.git','.jj','dist','coverage','.tsbuildinfo','.DS_Store','CLAUDE.md'])
  function listed(root,recurse){for(const ent of readdirSync(root,{withFileTypes:true})){if(excluded.has(ent.name)||ent.isSymbolicLink())continue;const path=join(root,ent.name);has(tree,relative(checkout,path),'complete source listing');if(recurse&&ent.isDirectory())listed(path,true)}}
  listed(checkout,false)
  for(const p of packages){listed(join(checkout,p.path),false);const src=join(checkout,p.path,'src');if(existsSync(src))listed(src,false)}
  listed(join(checkout,'packages/effect/src'),true);listed(join(checkout,'packages/sql/pg'),true)
}
const diskBytes=readdirSync(here).reduce((n,name)=>{const s=statSync(join(here,name));ok(s.isFile(),`unexpected directory ${basename(name)}`);return n+s.size},0)
ok(diskBytes<2_500_000,'fixture folder exceeds 2.5 MB')
const missingReleaseSections=[]
for(const p of packages.filter(p=>!p.private))for(const version of d.releases.map(r=>r.tag))if(!extras.packageReleases.some(x=>x.package===p.name&&x.version===version))missingReleaseSections.push(`${p.name}@${version}`)
console.log(JSON.stringify({result:'passed',checks,bytes:diskBytes,packages:packages.length,public:31,private:7,tree:d.tree.length,files:d.files.length,commits:d.commits.length,issues:d.issues.length,pulls:d.pulls.length,stack:d.stack.length,runs:d.runs.length,approvals:d.approvals.length,flows:d.flows.length,agents:d.agents.length,wiki:d.wiki.length,docs:d.docs.length,releases:d.releases.length,packageReleases:extras.packageReleases.length,matrixCells:ci.matrices.reduce((n,m)=>n+m.results.length,0),missingReleaseSections},null,2))
