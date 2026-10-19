"""Rebuild checkout-derived content and explicit scenarios; writes only this folder."""
from pathlib import Path
import json, os, re, hashlib, difflib
from datetime import datetime, timedelta, timezone

OUT = Path(__file__).resolve().parent
# The source checkout is machine-local: EFFECT_SOURCE names a read-only checkout of Effect-TS/effect-smol.
if not os.environ.get('EFFECT_SOURCE'):
    raise SystemExit('Set EFFECT_SOURCE to a read-only checkout of Effect-TS/effect-smol.')
ROOT = Path(os.environ['EFFECT_SOURCE'])
FACTS = OUT.parents[3] / 'effect/facts'
NOW = '2026-10-18T05:00:00Z'
BASE = 'smithers.sh/Effect-TS/effect'
sha = lambda i: hashlib.sha1(f'effect-ui-scenario-{i}'.encode()).hexdigest()
stamp = lambda days=0, hours=0: (datetime(2026,10,18,4,20,tzinfo=timezone.utc)-timedelta(days=days,hours=hours)).isoformat().replace('+00:00','Z')
_write = lambda name, data: (OUT/f'{name}.json').write_text(json.dumps(data, ensure_ascii=False, indent=None if name in ('tree','ci-projects','relations','commits','package-releases') else 2)+'\n')
def write(name, data):
    # jj refuses to snapshot a new file over 1 MiB, so the blobs ship as files-a.json and files-b.json split at half their bytes.
    if name != 'files': return _write(name, data)
    sizes=[len(json.dumps(x, ensure_ascii=False).encode()) for x in data]; acc=0; cut=len(data)
    for i,s in enumerate(sizes):
        if acc+s>sum(sizes)/2: cut=i if acc>0 else i+1; break
        acc+=s
    _write('files-a', data[:cut]); _write('files-b', data[cut:])
load = lambda path: json.loads(path.read_text())
packages_facts = load(FACTS/'packages.json')['packages']
upstream_handles = set()
for package in packages_facts:
    p=ROOT/package['path']/'CHANGELOG.md'
    if p.exists():upstream_handles.update(re.findall(r'Thanks\s+@([\w-]+)', p.read_text()))
identity_pattern = re.compile(r'(?<![\w-])@?(?:'+ '|'.join(re.escape(x) for x in sorted(upstream_handles,key=len,reverse=True)) + r')(?![\w-])')

def clean(text):
    text = re.sub(r'Thanks\s+@[^\s!]+!\s*-?\s*', '', text)
    text = identity_pattern.sub('dev-ahn',text)
    return text

# Every extraction receipt belongs in metadata, never ordinary page chrome.
source_receipts = []
def source(path, limit=None):
    raw = (ROOT/path).read_text()
    content = clean(raw)
    if limit:
        content = '\n'.join(content.splitlines()[:limit])+'\n// Mock source excerpt: first 600 lines of Schema.ts; remaining lines omitted.\n'
    source_receipts.append({'path': path, 'source': 'checkout', 'sha256': hashlib.sha256(raw.encode()).hexdigest(), 'fixtureSha256': hashlib.sha256(content.encode()).hexdigest(), 'treatment': 'first 600 lines' if limit else ('contributor identities removed' if content != raw else 'complete')})
    return content

packages = []
for p in packages_facts:
    manifest = load(ROOT/p['path']/'package.json')
    owners = ['maya'] if p['group'] in ('','tools','atom') or p['name']=='effect' else ['cora']
    dependencies = []
    for key,kind in [('dependencies','runtime'),('peerDependencies','peer'),('devDependencies','dev'),('optionalDependencies','optional')]:
        dependencies += [{'name': n, 'kind': kind} for n in manifest.get(key,{})]
    info = {'name':p['name'], 'path':p['path'], 'description':p['description'] or 'Compare consumer-visible TypeScript declarations across repository revisions.', 'version':p['version'], 'owners':owners, 'docs':'docs/'+('effect' if p['name']=='effect' else p['name'].replace('@effect/','')), 'slug':'effect' if p['name']=='effect' else p['name'].replace('@effect/',''), 'family':'' if p['path'].count('/')==1 else p['path'].split('/')[1], 'private':p['private'], 'dependencies':dependencies}
    for key,filename in [('readme','README.md'),('changelog','CHANGELOG.md')]:
        if (ROOT/p['path']/filename).exists(): info[key]=p['path']+'/'+filename
    packages.append(info)
public = [p for p in packages if not p['private']]
byname = {p['name']:p for p in packages}
by_path = lambda path: next((p for p in sorted(packages,key=lambda x:-len(x['path'])) if path==p['path'] or path.startswith(p['path']+'/')),None)

# Advertised code sources. One explicitly permitted excerpt; every other blob is complete.
paths = {'.envrc','README.md','AGENTS.md','LICENSE','package.json','pnpm-workspace.yaml','pnpm-lock.yaml','vitest.config.ts','vitest.docs.ts','deno.json','.changeset/config.json','.changeset/pre.json','.changeset/concrete-schema-brand-identifiers.md','.changeset/workflow-reset-retry.md','.github/workflows/check.yml','.github/workflows/release.yml','.github/actions/setup/action.yaml','ai-docs/README.md','ai-docs/src/01_effect/02_schema/index.md','ai-docs/src/01_effect/02_schema/10_schema-basics.ts','packages/effect/src/Effect.ts','packages/effect/src/Schema.ts','packages/effect/src/workflow/Workflow.ts','packages/effect/src/sql/SqlClient.ts','packages/sql/pg/src/PgClient.ts','packages/sql/pg/src/PgConnection.ts','packages/sql/pg/src/PgTypes.ts','packages/sql/pg/test/Client.integration.test.ts','packages/sql/sqlite-bun/test/Client.test.ts','packages/sql/sqlite-bun/src/SqliteClient.ts','packages/platform/node/src/NodeHttpServer.ts','packages/atom/react/src/Hooks.ts','packages/tools/docgen/src/CLI.ts','packages/ai/openai/src/OpenAiLanguageModel.ts'}
for p in packages:
    paths.add(p['path']+'/package.json')
    if p.get('readme'): paths.add(p['readme'])
files = []
for path in sorted(paths):
    ext=Path(path).suffix[1:]
    lang={'mjs':'js','yml':'yaml','yaml':'yaml','md':'md','ts':'ts','json':'json'}.get(ext,'txt')
    content=source(path,600 if path.endswith('/Schema.ts') else None)
    symbols=[]
    if lang=='ts':
        for n,line in enumerate(content.splitlines(),1):
            m=re.match(r'export (?:declare )?(const|class|interface|type|function) (\w+)',line)
            if m: symbols.append({'line':n,'name':m[2],'kind':m[1],'hover':line[:240]})
    files.append({'path':path,'lang':lang,'content':content,**({'symbols':symbols[:30]} if symbols else {})})
file_by_path={f['path']:f for f in files}

def diff(path, needle=None):
    content=(ROOT/path).read_text().splitlines()
    if needle:
        index=next((i for i,l in enumerate(content) if needle in l),0)
    else:
        index=next((i for i,l in enumerate(content) if l.startswith('export const ')),min(10,len(content)-1))
    if path=='packages/effect/src/Schema.ts' and index>595:
        index=next(i for i,l in enumerate(content[:595]) if l.startswith('export type '))
    # A compact scenario patch whose new side consists entirely of real source lines.
    start=max(0,index-3);end=min(len(content),index+4)
    lines=[{'kind':'hunk','text':f'@@ -{start+1},{end-start-1} +{start+1},{end-start} @@'}]
    for line_index in range(start,end):
        if line_index==index:lines.append({'kind':'add','text':clean(content[line_index]),'new':line_index+1})
        else:lines.append({'kind':'ctx','text':clean(content[line_index]),'old':line_index+1-(line_index>index),'new':line_index+1})
    return {'path':path,'status':'modified','additions':1,'deletions':0,'lines':lines}

people=[{'login':'maya','name':'maya','kind':'human','role':'owner','initials':'M'},{'login':'cora','name':'cora','kind':'human','role':'member','initials':'C'},{'login':'dev-ahn','name':'dev-ahn','kind':'human','role':'contributor','initials':'DA'},{'login':'smithers-agent','name':'smithers-agent','kind':'agent','role':'agent','initials':'S'}]
agent_indices=[0,3,7,11,17,24,33,42]
agent_runs=['run-4801','run-4809','run-4810','run-4811','run-4812','run-4813','run-4814','run-4815']
agent_map=dict(zip(agent_indices,agent_runs))
mark=lambda run,flow='implement-issue',person='cora':{'run':run,'flow':flow,'harness':'Codex · gpt-6.1-sol','for':person}
changelog_facts=load(FACTS/'changelog.json')
effect_entries=next(x['entries'] for x in changelog_facts if x['package']=='effect' and x['version']=='4.0.0-rc.118')
preferred=dict(enumerate([57,0,1,95,4,5,7,19,26,12]))
preferred.update({11:37,17:67,24:79,33:34,42:42})
remaining=iter(i for i in range(len(effect_entries)) if i not in preferred.values())
selected=[preferred[i] if i in preferred else next(remaining) for i in range(50)]
first_paths=[('packages/sql/pg/src/PgClient.ts','      commit,'),('packages/effect/src/Arbitrary.ts','export const configureGlobal'),('packages/effect/src/reactivity/AtomRegistry.ts',None),('packages/effect/src/sql/SqlClient.ts','    onCommitFailure:'),('packages/effect/src/Effect.ts','export const awaitAllChildren'),('packages/effect/src/Cache.ts',None),('packages/effect/src/Cause.ts',None),('packages/effect/package.json','"./sql/*"'),('packages/effect/src/reactivity/AtomRegistry.ts',None),('packages/effect/src/Scope.ts',None)]
# Later titles still use real module paths, resolved from the title's first module name.
def title_path(text):
    for word in re.findall(r'\b[A-Z][A-Za-z0-9]+',text):
        matches=list((ROOT/'packages/effect/src').rglob(word+'.ts'))
        if matches:return matches[0].relative_to(ROOT).as_posix()
    return 'packages/effect/src/Effect.ts'
pr_indices=[0,2,3,4,7,11,17,24,33,42]
pr_numbers=dict(zip(pr_indices,range(101,111)))
pr_states=['open','open','open','merged','draft','draft','merged','draft','merged','closed']
branch_names=['fix/pg-aborted-commit','fix/atom-stale-dependencies','fix/sqlite-failed-commit','fix/await-children','refactor/module-paths','fix/scope-close','fix/queue-wakeup','docs/schema-brand','fix/layer-memo','fix/mcp-tool-errors']
pr_branches=dict(zip(pr_indices,branch_names))
feature_indices={i for i,state in zip(pr_indices,pr_states) if state in ('open','draft','closed')}
main_indices=[i for i in range(50) if i not in feature_indices]
commits=[]
for i,entry_index in enumerate(selected):
    entry=effect_entries[entry_index]
    if i==38:entry=next(x['entries'][0] for x in changelog_facts if x['package']=='@effect/platform-node' and x['version']=='4.0.0-rc.116')
    title=clean(entry['text'].split('\n')[0]).lstrip('- ').split('. ')[0].rstrip('.')
    body=clean(entry['text'])
    path,needle=first_paths[i] if i<10 else (title_path(body),None)
    if i==38:path,needle='packages/platform/node/src/NodeHttpServer.ts',None
    patches=[diff(path,needle)]
    if i==0:patches += [diff('packages/effect/src/sql/SqlClient.ts','  const commit = options.commit'),diff('packages/sql/pg/test/Client.integration.test.ts','  it.effect("fails a transaction')]
    parent=next((j for j in main_indices if j>i),None)
    checks=[{'name':'Check','state':'failure' if i==0 else 'success','detail':'Bun: failed deferred commit leaves SQLite transaction open.' if i==0 else 'Required checks passed.',**({'run':'run-4802'} if i==0 else {})}]
    commit={'sha':sha(i),'title':title,'body':body,'author':'smithers-agent' if i in agent_map else ['maya','cora','dev-ahn'][i%3],'date':stamp(hours=max(3,i*13+1)-.06) if i in agent_map else stamp(hours=i*13),'parents':[sha(parent)] if parent is not None else [],'branches':[pr_branches[i]] if i in feature_indices else ['main'],'checks':checks,'verified':True,'files':patches}
    if i in pr_numbers:commit['pull']=pr_numbers[i]
    if i in agent_map:commit['agent']=mark(agent_map[i],person='maya' if i in (17,24,33) else 'cora')
    commits.append(commit)

# qa4: record PostgreSQL module hunks in the main snapshot used by tree and blame.
seed = commits[-1]
seed['title'] = 'Record Metric and PostgreSQL modules'
seed['body'] = 'Core and PostgreSQL module snapshot.'
for source in files:
    if source['path'].startswith('packages/sql/pg/src/'):
        lines = source['content'].splitlines()
        pos = next((i for i,line in enumerate(lines) if line.startswith('export ')), min(7,len(lines)-1))
        seed['files'].append({'path':source['path'],'status':'modified','additions':1,'deletions':0,'lines':[{'kind':'add' if i==pos else 'ctx','text':lines[i],**({'new':i+1} if i==pos else {'new':i+1,'old':i+1})} for i in range(max(0,pos-3),min(len(lines),pos+4))]})

labels=[{'name':'bug','tone':'danger','description':'A behavior differs from its contract.'},{'name':'enhancement','tone':'brand','description':'A small API improvement.'},{'name':'documentation','tone':'info','description':'Guides, API examples, or generated docs.'},{'name':'sql','tone':'neutral','description':'SQL clients and shared transaction behavior.'},{'name':'runtime','tone':'warning','description':'Node, Deno, or Bun behavior.'},{'name':'release','tone':'success','description':'Changesets and prereleases.'},{'name':'schema','tone':'neutral','description':'Schema parsing and branding.'}]
issue_specs=[
('PostgreSQL transaction succeeds after a caught statement error',['bug','sql'],['@effect/sql-pg','effect'],'A PostgreSQL statement error can be caught inside `withTransaction`. PostgreSQL then responds to `COMMIT` with `ROLLBACK`, but the effect reports success.\n\n```ts\nyield* sql.withTransaction(\n  sql`SELECT missing_column FROM example`.pipe(Effect.catch(() => Effect.void))\n)\n```\n\nExpected: the transaction fails and the next query can borrow a clean connection.'),
('AtomRegistry drops updates from a stale dependency',['bug'],['effect'],'A derived atom can keep an old value after its dependency rebuilds. Reproduce with one mounted reader, invalidate the source, then rebuild it before the reader flushes.'),
('Bun SQLite connection remains in a transaction after failed COMMIT',['bug','sql','runtime'],['@effect/sql-sqlite-bun','effect'],'A deferred foreign-key violation fails COMMIT. The next transaction on the same in-memory connection fails with `cannot start a transaction within a transaction`. Roll back without reopening the database.'),
('awaitAllChildren cannot be interrupted while a child waits',['bug'],['effect'],'Interrupt a parent while `Effect.awaitAllChildren` waits for a never-ending child. The parent must release its scope and complete interruption.'),
('Move SQL imports to the current module exports',['enhancement','sql'],['effect','@effect/sql-pg'],'Update imports to the current `effect/sql` export paths and check the public package entrypoints together.'),
('Scope close skips later finalizers after a synchronous throw',['bug'],['effect'],'Register three finalizers; make the middle callback throw synchronously. The remaining finalizer must still run.'),
('Queue taker can miss an offer during registration',['bug'],['effect'],'Stress a queue with a yielding producer and one waiting taker. Retain the operation ordering when the producer is interrupted.'),
('Document Unicode string constraints',['documentation','schema'],['effect'],'Document code-point length constraints and the matching JSON Schema export for astral characters.'),
('Layer memo waiters hang after the initial build is interrupted',['bug'],['effect'],'Interrupt the first layer build while a second consumer waits. Both consumers must observe the interrupted exit and release resources.'),
('MCP tool parameter failures omit later invalid fields',['bug'],['effect'],'Validate an object with two invalid fields and one unknown key. Return every declared parameter failure in one response.'),
('Preview the pending rc changesets',['release','schema'],['effect'],'Preview the two root changesets: concrete Schema brand identifiers and workflow reset retries. Keep the full public fixed group in the plan.'),
('Generate sql-pg API docs from the current source',['documentation','sql'],['@effect/sql-pg'],'Refresh the PostgreSQL client API preview and retain links to the exact source revision.'),
('Node static file responses ignore explicit content type',['bug'],['@effect/platform-node'],'Serve a file with a custom content type through the Node HTTP platform. Explicit response headers must win.'),
('OpenAI web search call can omit its action',['bug'],['@effect/ai-openai'],'Preserve an incomplete web-search call as a failed tool result when the provider omits the action.'),
('Deno SQL project exclusions need a visible reason',['documentation','runtime'],['@effect/platform-deno','@effect/sql-d1'],'Show why the D1 project is excluded on Deno and keep the Miniflare file exclusion separate from a failed test.'),
('Atom React suspense reader retains a replaced build',['bug'],['@effect/atom-react','effect'],'Switch the atom while its first build is suspended. The reader must release the superseded build.'),
('Workspace lockfile changes should expand affected checks',['enhancement'],[],'A root lockfile change can affect every package. Expand validation to all mapped projects and shared checks.'),
('Private tools should stay out of the publish plan',['bug','release'],['@effect/ai-docgen','@effect/api-diff'],'Keep private workspaces in affected validation while excluding them from published release entries.'),
('OpenTelemetry exporter leaves retry response bodies unread',['bug'],['@effect/opentelemetry','effect'],'Drain the response body before retrying an OTLP export so connections can be reused.'),
('PGlite nested transactions retain completed savepoints',['bug','sql'],['@effect/sql-pglite','effect'],'Release a savepoint after nested success or successful rollback; preserve the outer transaction.'),
('MySQL integration projects compete for containers',['bug','runtime'],['@effect/sql-mysql2'],'Run the container-heavy MySQL project after other integration projects and disable file parallelism for it.'),
('Document platform-node-shared peer dependencies',['documentation'],['@effect/platform-node-shared','@effect/platform-bun'],'Explain the shared Node/Bun layers without implying that development dependencies are published dependencies.'),
('Schema JSON exports count UTF-16 units as code points',['bug','schema'],['effect'],'A string containing one astral character must satisfy a one-code-point constraint after JSON Schema export.'),
('Workflow reset retry acknowledges before the run resumes',['bug'],['effect'],'Retry failed workflow resets. A deferred completion acknowledgment must wait until the reset run resumes.')]
issues=[]
for i,(title,labs,scope,body) in enumerate(issue_specs):
    n=42+i;closed=i in (3,6,8,18,19,22)
    issue={'n':n,'title':title,'state':'closed' if closed else 'open','author':'dev-ahn' if i%3==0 else 'cora','assignees':['maya' if scope==['effect'] else 'cora'] if i<12 else [],'labels':labs,'opened':stamp(hours=pr_indices[i]*13+72) if i<10 else stamp(days=3+i//2),'updated':stamp(hours=i+1),'body':body,'comments':[],'events':[{'kind':'labeled','actor':'cora','date':stamp(hours=pr_indices[i]*13+60) if i<10 else stamp(days=2+i//2),'label':labs[0]}],'pulls':[101+i] if i<10 else []}
    if i<6:issue['todo']=f'todo-{n}'
    if closed:issue['events'].append({'kind':'closed','actor':'maya','date':stamp(hours=i+1),'reason':'completed',**({'pull':101+i} if i<10 else {})})
    issues.append(issue)
issues[0]['author']='dev-ahn';issues[0]['assignees']=['cora']
issues[0]['comments']=[{'author':'cora','date':stamp(days=2,hours=6),'body':'Confirmed with a caught PostgreSQL statement error. I made a TODO for the driver and shared transaction contract.'},{'author':'smithers-agent','date':stamp(hours=2),'body':'The PR checks the PostgreSQL command tag and adds a driver commit hook. The shared SQL change also reaches the Bun SQLite tests.','agent':mark('run-4801')},{'author':'maya','date':stamp(hours=1),'body':'The PostgreSQL regression is covered. Fix the Bun rollback failure before I can merge.'}]
issues[0]['events'] += [{'kind':'assigned','actor':'cora','date':stamp(days=2,hours=6),'assignee':'cora'},{'kind':'todo','actor':'cora','date':stamp(days=2,hours=6),'run':'run-4801'},{'kind':'run','actor':'smithers-agent','date':stamp(hours=3),'run':'run-4801','state':'succeeded'},{'kind':'referenced','actor':'cora','date':stamp(hours=2),'pull':101,'sha':sha(0)},{'kind':'run','actor':'cora','date':stamp(hours=2),'run':'run-4802','state':'failed'}]
issues[0]['receipt']={'reported':{'by':'dev-ahn','date':issues[0]['opened']},'accepted':{'by':'cora','date':stamp(days=2,hours=6)},'working':{'run':'run-4801','date':stamp(hours=3)},'review':{'pull':101,'date':stamp(hours=2)}}
issues[10]['comments']=[{'author':'cora','date':stamp(hours=2),'body':'Only the two root changesets are pending. The `.changeset/pre/` directory contains prerelease history.'}]

pulls=[]
for k,(i,state) in enumerate(zip(pr_indices,pr_states)):
    n=101+k;c=commits[i];fixes=[42+k]
    pull={'n':n,'title':issues[k]['title'].replace('PostgreSQL transaction succeeds after a caught statement error','Fail aborted PostgreSQL commits'),'state':state,'kind':'pull','author':c['author'],'base':'main','head':pr_branches[i],'opened':stamp(hours=i*13+1),'updated':stamp(hours=i*13),'body':f"Fixes #{fixes[0]}.\n\n{c['body']}\n\nIncludes a focused regression and package checks.",'reviewers':['maya' if k%2==0 else 'cora'],'reviews':[],'reviewComments':[],'comments':[],'checks':c['checks'],'commits':[c['sha']],'files':c['files'],'fixes':fixes,'labels':issues[k]['labels']}
    if c.get('agent'):pull['agent']=c['agent']
    if state=='merged':
        pull['merged']={'by':'maya','date':c['date'],'sha':c['sha']};pull['reviews']=[{'author':'maya','date':stamp(hours=i*13+.1),'state':'approved','body':'Regression and package checks passed. Reviewed.'}]
    pulls.append(pull)
pulls[0]['opened']='2026-10-18T01:26:00Z'
pulls[0]['updated']='2026-10-18T03:20:00Z'
pulls[0]['checks']=[{'name':name,'state':state,'detail':detail,'run':'run-4802'} for name,state,detail in [('Static','success','Lint and circular dependency checks passed.'),('Types','success','TypeScript and Deno type checks passed.'),('Build','success','Distribution types passed.'),('Bundle','success','Bundle comparison completed.'),('Test (Node)','success','Mapped projects passed.'),('Test (Deno)','success','Eligible projects passed; runtime exclusions recorded.'),('Test (Bun)','failure','@effect/sql-sqlite-bun: cannot start a transaction within a transaction.'),('Test (Documentation)','success','Source examples passed.')]]
pulls[0]['reviews']=[{'author':'maya','date':stamp(hours=1),'state':'changes_requested','body':'Keep the PostgreSQL command-tag check. Roll back the failed SQLite COMMIT before the connection is reused; the Bun matrix result links the regression.'}]
pulls[0]['reviewComments']=[{'path':'packages/effect/src/sql/SqlClient.ts','line':214,'author':'maya','date':stamp(hours=1),'body':'The custom commit effect must preserve cleanup when a driver leaves the transaction open. Please cover the Bun deferred-constraint case.','resolved':False}]
pulls[0]['comments']=[{'author':'smithers-agent','date':stamp(hours=1.5),'body':'Bun failed in `packages/sql/sqlite-bun/test/Client.test.ts`. Node and Deno passed their eligible projects; they do not exercise Bun SQLite.','agent':mark('run-4801')}]
branches=[{'name':'main','head':sha(1),'author':'maya','updated':commits[1]['date'],'ahead':0,'behind':0,'isDefault':True,'protected':True}]
for i,state in zip(pr_indices,pr_states):
    if pr_branches[i] not in commits[i]['branches']:commits[i]['branches'].append(pr_branches[i])
    branches.append({'name':pr_branches[i],'head':sha(i),'author':commits[i]['author'],'updated':commits[i]['date'],'ahead':0 if state=='merged' else 1,'behind':sum(j<i for j in main_indices),'pull':pr_numbers[i],**({'run':agent_map[i]} if i in agent_map else {}),**({'sandbox':{'state':'running','id':'box-pg-42','since':stamp(hours=4),'ports':[5432]}} if i==0 else {})})
for name,i in [('v4/next-minor',35),('v4/next-major',48)]:branches.append({'name':name,'head':sha(i),'author':'maya','updated':commits[i]['date'],'ahead':0,'behind':sum(j<i for j in main_indices)})
tags=[{'name':f'4.0.0-rc.{v}','sha':sha(i),'date':stamp(days=d),'release':True} for v,i,d in [(118,1,1),(117,15,7),(116,29,14),(115,45,21)]]

# Real filesystem listings, excluding generated installations and hidden VCS state.
tree_map={}
skip={'node_modules','.git','.jj','dist','coverage','.tsbuildinfo','.DS_Store','CLAUDE.md'}
def add_entry(path):
    if any(x in skip for x in path.parts):return
    rel=path.relative_to(ROOT).as_posix()
    if path.is_symlink() and path.is_dir():return
    if path.is_dir():entry={'path':rel,'kind':'dir','sha':sha(1)}
    else:entry={'path':rel,'kind':'file','size':path.stat().st_size,'sha':sha(1)}
    tree_map[rel]=entry

def ancestors(path):
    parent=Path(path).parent
    while parent.as_posix()!='.':add_entry(ROOT/parent);parent=parent.parent

for p in ROOT.iterdir():add_entry(p)
for p in packages:
    root=ROOT/p['path'];ancestors(p['path'])
    add_entry(root)
    for f in root.iterdir():add_entry(f)
    src=root/'src'
    if src.is_dir():
        for f in src.iterdir():add_entry(f)
# Fully enumerate the core source and PostgreSQL source/test trees, not just two levels.
for path in ['packages/effect/src','packages/sql/pg']:
    for f in (ROOT/path).rglob('*'):add_entry(f)
for f in files:
    add_entry(ROOT/f['path']);ancestors(f['path'])
for c in commits:
    for f in c['files']:
        add_entry(ROOT/f['path']);ancestors(f['path'])
for f in tree_map.values():
    matches=[c for c in commits if 'main' in c['branches'] and any(x['path']==f['path'] or x['path'].startswith(f['path']+'/') for x in c['files'])]
    if matches:f['sha']=matches[0]['sha']
tree=sorted((entry for entry in tree_map.values() if entry['kind'] != 'dir' or any(child['kind'] == 'file' and child['path'].startswith(entry['path'] + '/') for child in tree_map.values())),key=lambda x:x['path'])
blame=[]
for path in ['packages/sql/pg/src/PgClient.ts','packages/effect/src/sql/SqlClient.ts','packages/effect/src/Schema.ts','packages/platform/node/src/NodeHttpServer.ts']:
    count=len(file_by_path[path]['content'].split('\n'))
    touched=[c for c in reversed(commits) if (not path.startswith('packages/sql/pg/src/') or 'main' in c['branches']) and any(f['path']==path for f in c['files'])]
    assert touched, path
    bounds=[(1,min(80,count)),(81,min(240,count)),(241,count)]
    for j,(start,end) in enumerate(bounds):
        if start<=end:blame.append({'path':path,'start':start,'end':end,'sha':touched[min(j,len(touched)-1)]['sha']})

# Durable run records. Scenario outcomes are never inferred from workflow definitions.
def stage(id,label,state='succeeded',summary='Passed.',log=None):return {'id':id,'label':label,'state':state,'started':stamp(hours=2),'duration':'24s','summary':summary,'log':log or [summary]}
def make_run(id,flow,title,state='succeeded',issue=None,pull=None,by='cora',hours=2):
    r={'id':id,'flow':flow,'title':title,'state':state,'trigger':{'kind':'pull' if pull else 'issue' if issue else 'manual','by':by,**({'ref':str(pull or issue)} if pull or issue else {})},'harness':'Codex · gpt-6.1-sol','started':stamp(hours=hours),'duration':'6m','cost':{'usd':0.34,'tokens':24210},'stages':[],'approvals':[],'trace':[]}
    if issue:r['issue']=issue
    if pull:r['pull']=pull
    if state in ('succeeded','failed','cancelled'):r['finished']=stamp(hours=max(0,hours-.1))
    return r
runs=[]
for i,id in zip(agent_indices,agent_runs):
    k=pr_indices.index(i);state='failed' if id=='run-4811' else 'succeeded'
    r=make_run(id,'implement-issue',issues[k]['title'],state,42+k,101+k,by=commits[i]['agent']['for'],hours=max(3,i*13+1))
    r['branch']=pr_branches[i]
    r['stages']=[stage('reproduce','Reproduce',summary='Regression reproduced against the recorded base.'),stage('change','Implement',summary='Source change and focused regression written.'),stage('verify','Verify',summary='Focused checks completed; required CI is a separate run.'),stage('pull','Open pull request',state,'Sandbox write approval denied.' if state=='failed' else f'Pull request #{101+k} updated. A person reviews and merges.')]
    r['trace']=[{'at':r['started'],'stage':'reproduce','kind':'checkpoint','text':'Saved base revision and reproduction.'},{'at':r['started'],'stage':'change','kind':'tool','text':c['files'][0]['path'] if (c:=commits[i]) else ''},{'at':r['finished'],'stage':'pull','kind':'error' if state=='failed' else 'checkpoint','text':'Human approval denied; retained the draft change.' if state=='failed' else f'Pull request #{101+k} ready for human review.'}]
    if state=='failed':r['failure']={'stage':'pull','reason':'maya denied the requested sandbox write scope.'};r['approvals']=['approval-scope']
    runs.append(r)
run_specs=[('run-4802','check','Check PostgreSQL commit handling','failed',101,2),('run-4803','release-plan','Preview two pending changesets','waiting',None,1),('run-4804','docs-generate','Generate @effect/sql-pg documentation','succeeded',None,5),('run-4805','check','Check workspace changes','running',102,.25),('run-4806','check','Check awaitAllChildren interruption','succeeded',104,53),('run-4807','check','Check previous PostgreSQL revision','cancelled',101,6),('run-4808','affected','Run affected packages for the lockfile','queued',None,.1),('run-4816','triage','Associate PostgreSQL report with packages','succeeded',None,50)]
for id,flow,title,state,pull,hours in run_specs:
    r=make_run(id,flow,title,state,issue=42 if id=='run-4816' else None,pull=pull,hours=hours)
    if flow=='check':
        r['harness']='GitHub Actions · Check'
        r['cost']={'usd':0,'tokens':0}
        r['branch']=next(p['head'] for p in pulls if p['n']==pull)
        terminal='succeeded' if state in ('failed','succeeded') else state
        r['stages']=[stage('static-checks','Static',terminal,'Lint, circular dependencies, generated AI docs.'),stage('types','Types',terminal,'TypeScript, Deno and public type assertions.'),stage('build','Build',terminal),stage('bundle','Bundle',terminal),stage('test-node','Test (Node)',terminal),stage('test-deno','Test (Deno)',terminal),stage('test-bun','Test (Bun)','failed' if state=='failed' else terminal),stage('doctest','Test (Documentation)',terminal)]
        if id=='run-4802':
            failure='@effect/sql-sqlite-bun: failed deferred COMMIT leaves the connection in a transaction; the next BEGIN fails.'
            r['stages'][6]=stage('test-bun','Test (Bun)','failed',failure,['bun run --bun vitest run --max-concurrency=10','@effect/sql-sqlite-bun > Client > recovers a failed deferred commit without losing an in-memory database','packages/sql/sqlite-bun/test/Client.test.ts:83','SqlError: cannot start a transaction within a transaction','Expected the connection to roll back the failed COMMIT before reuse.','1 failed project; see the retained failing test and trace.'])
            r['failure']={'stage':'test-bun','reason':failure}
        if id=='run-4806':
            r['trigger']={'kind':'push','by':'maya','ref':'main'}
            r['branch']='main'
            for s in r['stages']:
                if s['id'] in ('build','bundle'):s.update(state='skipped',summary='Runs only for pull_request events.',log=['Skipped: github.event_name is push.'])
        r['trace']=[{'at':r['started'],'stage':'static-checks','kind':'checkpoint','text':'Resolved workflow .github/workflows/check.yml and exact runtime projects.'},{'at':r.get('finished',r['started']),'stage':'test-bun','kind':'error' if state=='failed' else 'message','text':r['failure']['reason'] if state=='failed' else 'Runtime eligibility retained with each project result.'}]
    elif flow=='release-plan':
        r['approvals']=['approval-release'];r['stages']=[stage('inputs','Read changesets',summary='Two pending root changesets; 31 public fixed-group members.'),stage('preview','Preview versions','waiting','Waiting for maya to allow the isolated Changesets preview.'),stage('prepare','Prepare version PR','queued','A person reviews and merges the resulting PR.')]
        r['trace']=[{'at':r['started'],'stage':'inputs','kind':'checkpoint','text':'Read concrete-schema-brand-identifiers.md and workflow-reset-retry.md.'},{'at':r['started'],'stage':'preview','kind':'approval','text':'Exact next versions require the pinned Changesets CLI. No version has been guessed.'}]
    elif flow=='docs-generate':
        r['approvals']=['approval-docs'];r['stages']=[stage('source','Read source'),stage('generate','Generate API preview',summary='Generated preview for PgClient, PgConnection and PgTypes.'),stage('accept','Accept preview',summary='cora accepted the documentation preview.')]
        r['trace']=[{'at':r['started'],'stage':'source','kind':'checkpoint','text':'Pinned source revision '+sha(1)},{'at':r['finished'],'stage':'accept','kind':'checkpoint','text':'cora accepted the preview; website deployment remains separate.'}]
        r['resumed']={'at':stamp(hours=4.9),'checkpoint':'docs-source-pinned'}
    elif flow=='affected':r['stages']=[stage('resolve','Resolve changed paths','queued','Queued: shared lockfile expands validation to all mapped projects.')]
    else:r['stages']=[stage('associate','Associate packages',summary='Declared @effect/sql-pg and effect; requested cora and maya.')]
    runs.append(r)
for run in runs:
    for s in run['stages']:s['started']=run['started']
runs.sort(key=lambda x:x['started'],reverse=True)
approvals=[{'id':'approval-release','run':'run-4803','title':'Preview the next rc version plan','question':'Allow the pinned Changesets CLI to compute exact versions in an isolated sandbox?','askedOf':'maya','asked':stamp(hours=1),'options':['Preview','Cancel'],'state':'waiting'},{'id':'approval-docs','run':'run-4804','title':'Accept sql-pg docs preview','question':'Accept the source-linked package API preview?','askedOf':'cora','asked':stamp(hours=5),'options':['Accept','Keep draft'],'state':'approved','decided':{'by':'cora','date':stamp(hours=4.8),'option':'Accept'}},{'id':'approval-scope','run':'run-4811','title':'Expand sandbox writes','question':'Allow edits outside the queued change scope?','askedOf':'maya','asked':stamp(hours=144),'options':['Allow','Deny'],'state':'denied','decided':{'by':'maya','date':stamp(hours=143.95),'option':'Deny'}}]
stack=[]
for order,k in enumerate([0,1,2,3,4,5],1):
    states=['failed','working','ready','merged','needs-answer','failed']
    run_ids=['run-4801','run-4805','run-4809','run-4806','run-4810','run-4811']
    state=states[k]
    item={'id':f'todo-{42+k}','order':order,'title':issues[k]['title'],'state':state,'owner':'cora' if k%2==0 else 'maya','issue':42+k,'pull':101+k,'run':run_ids[k],'updated':stamp(hours=k+1)}
    if state=='failed':item['failure']='Required Bun checks failed; maya requested rollback cleanup.' if k==0 else 'maya denied the expanded sandbox write scope.'
    if state=='needs-answer':item['question']={'text':'Include all public module export paths in this change?','options':['Include exports','Keep SQL only']}
    stack.append(item)

# Workflow source and small authored scenario flow definitions.
flow_specs=[('check','Check source, types, builds and runtime projects.','.github/workflows/check.yml',[('static','Static','check'),('types','Types','check'),('test','Node · Deno · Bun','check')]),('affected','Resolve changed paths and run affected projects.','.smithers/flows/affected/flow.ts',[('resolve','Resolve packages','step'),('check','Run affected','check')]),('implement-issue','Reproduce an issue and open a change for human review.','.smithers/flows/implement-issue/flow.ts',[('reproduce','Reproduce','agent'),('implement','Implement','agent'),('verify','Verify','check'),('review','Human review','approval')]),('docs-generate','Generate source-linked API docs and AI guides.','.smithers/flows/docs-generate/flow.ts',[('source','Pin sources','step'),('generate','Generate preview','agent'),('accept','Accept preview','approval')]),('release-plan','Preview Changesets impact and prepare a version PR.','.smithers/flows/release-plan/flow.ts',[('inputs','Read pending changesets','step'),('preview','Compute versions','step'),('approve','Human approval','approval'),('prepare','Prepare version PR','step')]),('triage','Associate reports with packages and owners.','.smithers/flows/triage/flow.ts',[('read','Read report','agent'),('associate','Associate packages','step')])]
agents=[{'id':id,'name':name,'harness':harness,'model':model,'connection':connection,'instructions':instructions,'flows':flows} for id,name,harness,model,connection,instructions,flows in [('implementer','Implementer','codex','gpt-6.1-sol','codex','Reproduce the reported behavior. Preserve cross-package contracts; open a PR for a person to review.',['implement-issue','affected']),('docs','Docs','codex','gpt-6.1-sol','codex','Generate examples from pinned source and show a reviewable preview.',['docs-generate']),('triage','Triage','claude-code','claude-opus-5-5','claude','Associate packages from declared evidence and request their owners.',['triage']),('release','Release planner','codex','gpt-6.1-sol','codex','Keep pending changesets distinct from prerelease history. Use the pinned Changesets CLI; never merge.',['release-plan'])]]
flows=[]
for name,description,path,nodes in flow_specs:
    inputs=[{'name':'ref','type':'string','required':True,'description':'Revision to inspect.'}]
    if name=='implement-issue':inputs.append({'name':'issue','type':'number','required':True,'description':'Issue number.'})
    if name in ('affected','check','docs-generate'):inputs.append({'name':'package','type':'string','required':False,'description':'Package scope; shared checks remain visible.'})
    triggers=[{'kind':'manual','spec':'/'+name,'enabled':True}]
    if name=='check':triggers += [{'kind':'push','spec':'main, v4/next-minor, v4/next-major','enabled':True},{'kind':'pull','spec':'main, v4/next-minor, v4/next-major','enabled':True}]
    if name=='triage':triggers.append({'kind':'issue-label','spec':'bug','enabled':True})
    flows.append({'name':name,'file':path,'description':description,'inputs':inputs,'triggers':triggers,'roles':[{'role':'author','agent':'docs' if name=='docs-generate' else 'release' if name=='release-plan' else 'triage' if name=='triage' else 'implementer'}],'graph':{'nodes':[{'id':id,'label':label,'kind':kind} for id,label,kind in nodes],'edges':[[nodes[i][0],nodes[i+1][0]] for i in range(len(nodes)-1)]},'runs':[r['id'] for r in runs if r['flow']==name]})
    if path.startswith('.smithers/'):
        content=f'''import {{ Flow }} from "@smthrs/flow"\nimport {{ Schema }} from "effect"\n\n// Fixture-only repository flow; no .smithers configuration exists upstream.\nexport default Flow.make("{name}", {{\n  description: {json.dumps(description)},\n  capabilities: [],\n  effects: [],\n  payload: Schema.Struct({{ ref: Schema.String }}),\n  success: Schema.Struct({{ ref: Schema.String }}),\n  body: (input) => input\n}})\n'''
        files.append({'path':path,'lang':'ts','content':content})
        parts=Path(path).parents
        for parent in parts:
            if parent.as_posix()=='.':continue
            tree_map[parent.as_posix()]={'path':parent.as_posix(),'kind':'dir','sha':sha(1)}
        tree_map[path]={'path':path,'kind':'file','size':len(content.encode()),'sha':sha(1)}
        source_receipts.append({'path':path,'source':'scenario','fixtureSha256':hashlib.sha256(content.encode()).hexdigest(),'treatment':'proposed repository flow; not executable checkout evidence'})
tree=sorted((entry for entry in tree_map.values() if entry['kind'] != 'dir' or any(child['kind'] == 'file' and child['path'].startswith(entry['path'] + '/') for child in tree_map.values())),key=lambda x:x['path'])

# Keep complete technical notes for the four requested rc sections, without contributor identities.
def release_notes(path,version):
    text=(ROOT/path).read_text();m=re.search(r'^## '+re.escape(version)+r'\s*\n(.*?)(?=^## |\Z)',text,re.M|re.S)
    if not m:return None
    body=clean(m[1].strip())
    body=re.sub(r'\[#\d+\]\([^\n)]*\)\s*', '', body)
    body=re.sub(r'\[`[^`]+`\]\([^\n)]*\)\s*', '', body)
    body=re.sub(r'- Updated dependencies \[[^\n]*\]:\s*\n', '- Updated workspace dependencies:\n', body)
    body=re.sub(r'\[\s*,(?:\s*,)*\s*\]', '',body)
    body=re.sub(r'^-\s*-\s*','- ',body,flags=re.M)
    return body.strip()
package_releases=[]
for version in [f'4.0.0-rc.{i}' for i in [118,117,116,115]]:
    for p in public:
        notes=release_notes(p['changelog'],version)
        if notes is not None:package_releases.append({'package':p['name'],'slug':p['slug'],'version':version,'tag':version,'body':notes,'source':p['changelog'],'date':next(t['date'] for t in tags if t['name']==version),'publication':'scenario'})
releases=[]
for i,version in enumerate([f'4.0.0-rc.{n}' for n in [118,117,116,115]]):
    core=next(x for x in package_releases if x['package']=='effect' and x['version']==version)
    excerpts=[]
    for name in ['@effect/sql-pg','@effect/platform-node','@effect/ai-openai']:
        p=next(x for x in package_releases if x['package']==name and x['version']==version)
        excerpts.append(f"### {name}\n\n{p['body']}")
    releases.append({'tag':version,'name':version,'date':core['date'],'author':'maya','prerelease':True,'latest':i==0,'body':core['body']+'\n\n'+'\n\n'.join(excerpts),'pulls':[104,107,109] if i==0 else []})

pending=[]
for id in ['concrete-schema-brand-identifiers','workflow-reset-retry']:
    text=file_by_path[f'.changeset/{id}.md']['content'];pending.append({'id':id,'path':f'.changeset/{id}.md','summary':text.split('---')[2].strip(),'packages':[{'name':'effect','type':'patch'}]})
config=load(ROOT/'.changeset/config.json')
release_plan={'status':'needs-preview','source':'.changeset/config.json','origin':'derived','currentVersion':'4.0.0-rc.118','nextVersion':None,'mode':'pre','tag':'rc','changesets':pending,'fixedGroup':config['fixed'][0],'directChanges':[{'package':'effect','type':'patch','changesets':[p['id'] for p in pending]}],'fixedGroupExpansion':[p['name'] for p in public if p['name']!='effect'],'dependencyPropagation':[{'package':p['name'],'dependency':d['name'],'kind':d['kind']} for p in public for d in p['dependencies'] if d['name'] in byname and d['kind'] in ('runtime','peer')],'packages':[{'name':p['name'],'path':p['path'],'currentVersion':p['version'],'nextVersion':None,'type':'patch','reason':'direct' if p['name']=='effect' else 'fixed','changesets':[c['id'] for c in pending],'publish':True} for p in public],'privatePackagesExcluded':[p['name'] for p in packages if p['private']],'tooling':{'package':'@changesets/cli','version':'3.0.3','command':'pnpm changeset-version','publishCommand':'pnpm changeset-publish','source':'package.json'},'preview':{'run':'run-4803','baseSha':sha(1),'inputsHash':hashlib.sha256(json.dumps(pending,sort_keys=True).encode()).hexdigest(),'state':'waiting','reason':'Exact next versions require the pinned Changesets CLI; the preview has not run.'},'existingPull':None,'historyDirectory':'.changeset/pre','releaseWorkflow':'.github/workflows/release.yml','website':{'state':'not-dispatched','detail':'Release dispatches API publication only after packages publish; dispatch does not prove deployment.'}}

# Every runtime/project cell is distinct from the eight real GitHub jobs.
node_only={'@effect/platform-node','@effect/platform-node-shared','@effect/sql-sqlite-node','@effect/ai-codegen','@effect/utils'}
projects=[]
for p in packages:
    name=p['name'];runtime=['Node','Deno','Bun']
    if name in node_only:runtime=['Node']
    if name=='@effect/platform-bun':runtime=['Bun']
    if name=='@effect/platform-deno':runtime=['Deno']
    if name=='@effect/sql-d1':runtime=['Node','Bun']
    if name=='@effect/ai-docgen':runtime=[]
    exclusions={}
    if name=='effect':exclusions['Bun']=['test/reactivity/Atom.test.ts','test/schema/Schema.test.ts','test/schema/SchemaGetter.test.ts','test/schema/toCodec.test.ts','test/schema/toDifferJsonPatch.test.ts','test/http/HttpEffect.test.ts','test/http/HttpServerRequest.test.ts']
    if name=='@effect/sql-sqlite-do':exclusions['Deno']=['test/Miniflare.test.ts']
    projects.append({'name':name,'package':name,'path':p['path'],'runtimes':runtime,'configured':name!='@effect/ai-docgen','exclusions':exclusions,'integration':name.startswith('@effect/sql-') or name in ('effect','@effect/platform-node'),'condition':'EFFECT_INTEGRATION_TESTS=1 enables *.integration.test.ts; Docker required for container-backed suites.','commands':{rt:f"{'pnpm exec vitest run' if rt=='Node' else 'deno task test --run' if rt=='Deno' else 'bun run --bun vitest run'} --project {name} --max-concurrency=10" for rt in runtime}})
matrices=[]
for run in [r for r in runs if r['flow']=='check']:
    cells=[]
    for p in projects:
        for rt in ['Node','Deno','Bun']:
            state='success';reason='Recorded project checks passed.'
            if not p['configured']:state='excluded';reason='No Vitest project declared for this workspace.'
            elif rt not in p['runtimes']:state='excluded';reason='Runtime condition excludes this project in vitest.config.ts.'
            elif p['name']=='@effect/sql-sqlite-bun' and rt!='Bun':state='skipped';reason='Client tests use skipIf(!isBun); the placeholder test does not validate SQLite.'
            elif run['state']=='failed' and p['name']=='@effect/sql-sqlite-bun' and rt=='Bun':state='failure';reason='Failed COMMIT left a transaction open; subsequent BEGIN failed.'
            elif run['state']=='running':state='running' if rt=='Bun' else 'success';reason='Runtime job still running.' if rt=='Bun' else 'Recorded eligible tests passed.'
            elif run['state']=='cancelled':state='cancelled';reason='Superseded by a newer PostgreSQL revision.'
            cell={'package':p['name'],'project':p['name'],'runtime':rt,'state':state,'reason':reason,'stage':'test-'+rt.lower(),'run':run['id'],'duration':'18s' if state in ('success','failure') else '—'}
            if state=='failure':cell.update(path='packages/sql/sqlite-bun/test/Client.test.ts',line=83,test='recovers a failed deferred commit without losing an in-memory database')
            cells.append(cell)
    matrices.append({'run':run['id'],'workflow':'.github/workflows/check.yml','event':run['trigger']['kind'],'state':run['state'],'sharedChecks':[{'stage':s['id'],'name':s['label'],'state':s['state'],'reason':s['summary']} for s in run['stages'] if not s['id'].startswith('test-')],'results':cells})
ci_projects={'source':'vitest.config.ts','workflow':'.github/workflows/check.yml','documentationSource':'vitest.docs.ts','jobs':[{'id':'static-checks','name':'Static','command':'pnpm lint && pnpm circular && pnpm ai-docgen','condition':'all events'},{'id':'types','name':'Types','command':"pnpm check && deno check . && pnpm test-types --target '>=5.9'",'condition':'all events'},{'id':'build','name':'Build','command':'pnpm build && pnpm check-dist-types','condition':"github.event_name == 'pull_request'"},{'id':'bundle','name':'Bundle','command':'node ./packages/tools/bundle/src/bin.ts compare --base-dir base/packages/tools/bundle/fixtures','condition':"github.event_name == 'pull_request'"},{'id':'test-node','name':'Test (Node)','runtime':'Node','command':'pnpm test --run --max-concurrency=10','condition':'all events'},{'id':'test-deno','name':'Test (Deno)','runtime':'Deno','command':'deno task test --run --max-concurrency=10','condition':'all events','version':'v2.9.4'},{'id':'test-bun','name':'Test (Bun)','runtime':'Bun','command':'bun run --bun vitest run --max-concurrency=10','condition':'all events','version':'1.4.0'},{'id':'doctest','name':'Test (Documentation)','command':'pnpm doctest --run','condition':'all events'}],'environment':{'EFFECT_INTEGRATION_TESTS':'1','TESTCONTAINERS_RYUK_DISABLED':'true'},'containers':['ghcr.io/tursodatabase/libsql-server:main','postgres:alpine','mysql:lts','mcr.microsoft.com/mssql/server:2022-latest','vitess/vttestserver:mysql80','redis:alpine'],'projects':projects,'additionalProjects':[{'name':'cluster-integration','package':'@effect/platform-node','path':'packages/platform/node','runtimes':['Node'],'condition':'EFFECT_CLUSTER_TESTS=1; not enabled by check.yml','command':'pnpm exec vitest run --project cluster-integration','state':'excluded'}],'matrices':matrices,'sourceNotes':['Node, Deno and documentation commands add --run for interactive sandbox invocation; check.yml source is preserved verbatim.','Deno excludes the Miniflare file without excluding the whole sqlite-do project.','A green Node placeholder test is not a Bun SQLite result.']}

relations=[]
for issue,(_,_,scope,_) in zip(issues,issue_specs):relations.append({'kind':'issue','ref':str(issue['n']),'packages':scope,'basis':'declared' if scope else 'shared-input','paths':[],'owners':sorted({o for n in scope for o in byname[n]['owners']}) or ['maya','cora']})
for p in pulls:
    changed=[f['path'] for f in p['files']];scope=sorted({x['name'] for path in changed if (x:=by_path(path))})
    relations.append({'kind':'pull','ref':str(p['n']),'packages':scope,'basis':'changed-path','paths':changed,'owners':sorted({o for n in scope for o in byname[n]['owners']})})
for c in commits:
    scope=sorted({x['name'] for f in c['files'] if (x:=by_path(f['path']))})
    relations.append({'kind':'commit','ref':c['sha'],'packages':scope,'basis':'changed-path','paths':[f['path'] for f in c['files']],'owners':sorted({o for n in scope for o in byname[n]['owners']})})
for r in runs:
    scope=next((v['packages'] for v in relations if v['kind']=='pull' and v['ref']==str(r.get('pull'))),[])
    if r['id']=='run-4804':scope=['@effect/sql-pg']
    if r['id']=='run-4803':scope=[p['name'] for p in public]
    if r['id'] in ('run-4808','run-4805'):scope=[p['name'] for p in packages]
    if r['id']=='run-4816':scope=['effect','@effect/sql-pg']
    if r['id']=='run-4802':scope=sorted(set(scope+['@effect/sql-sqlite-bun']))
    relations.append({'kind':'run','ref':r['id'],'packages':scope,'basis':'shared-input' if r['id'] in ('run-4803','run-4808','run-4805') else 'dependency' if r['id']=='run-4802' else 'declared','paths':['pnpm-lock.yaml'] if r['id']=='run-4808' else [],'owners':sorted({o for n in scope for o in byname[n]['owners']})})
for s in stack:
    rel=next(x for x in relations if x['kind']=='issue' and x['ref']==str(s['issue']))
    relations.append({**rel,'kind':'stack','ref':s['id']})

wiki=[{'slug':slug,'title':title,'body':body,'updated':stamp(days=i),'author':'cora' if i%2 else 'maya','revision':i+2,'provenance':{'source':'person'}} for i,(slug,title,body) in enumerate([
('architecture','Architecture','# Architecture\n\n`effect` supplies the runtime and shared services. Platform, SQL, AI and Atom packages build on those contracts. Workspace dependencies keep source changes visible across packages.\n\nThe SQL client owns transaction composition; drivers own connection and command-result behavior. See [Package layout](wiki:package-layout).'),
('release-process','Release process','# Release process\n\nThe 31 public packages share one Changesets fixed group. Pending entries live directly in `.changeset/`; `.changeset/pre/` is historical. The current prerelease tag is `rc`.\n\nPreview using pinned Changesets tooling, review the complete group, then prepare a version PR. A person merges it. The Release workflow publishes and then dispatches website publication. A dispatch receipt does not prove deployment.'),
('package-layout','Package layout','# Package layout\n\nCore: `packages/effect`. Integrations: `packages/ai`, `packages/atom`, `packages/platform`, `packages/sql`. Build and documentation tools: `packages/tools`. `packages/opentelemetry` and `packages/vitest` are standalone.\n\nThere are 38 packages: 31 public and seven private. See [Contributing](wiki:contributing).'),
('contributing','Contributing','# Contributing\n\nOpen an issue with the affected package, runtime and reproduction. cora or maya accepts the issue and makes a TODO. Changes include a focused regression and run the applicable runtime projects.\n\nShared configuration expands validation. An agent opens a PR; a person reviews and merges it. Runtime exclusions remain visible in the matrix.')])]
wiki[0]['proposals']=[{'run':'run-4801','date':stamp(hours=2),'summary':'Document PostgreSQL aborted COMMIT handling and shared-driver cleanup.','diff':'+ Drivers inspect COMMIT outcomes; failed SQLite commits require rollback before connection reuse.'}]
docs=[]
for name in ['effect','@effect/sql-pg','@effect/platform-node','@effect/ai-openai']:
    p=byname[name];docs.append({'slug':p['slug'],'title':name,'section':'Packages','body':file_by_path[p['readme']]['content']})
for slug,title,path in [('guides/schema','Schema','ai-docs/src/01_effect/02_schema/index.md'),('guides/schema-basics','Schema basics','ai-docs/src/01_effect/02_schema/10_schema-basics.ts')]:
    content=file_by_path[path]['content'];docs.append({'slug':slug,'title':title,'section':'Guides','body':content if path.endswith('.md') else '# Schema basics\n\n```ts\n'+content+'\n```'})
for slug,title,path in [('sql-pg/PgClient','PgClient','packages/sql/pg/src/PgClient.ts'),('sql-pg/PgConnection','PgConnection','packages/sql/pg/src/PgConnection.ts'),('sql-pg/PgTypes','PgTypes','packages/sql/pg/src/PgTypes.ts'),('platform-node/NodeHttpServer','NodeHttpServer','packages/platform/node/src/NodeHttpServer.ts'),('ai-openai/OpenAiLanguageModel','OpenAiLanguageModel','packages/ai/openai/src/OpenAiLanguageModel.ts')]:
    text=(ROOT/path).read_text();doc=re.search(r'/\*\*(.*?)\*/',text,re.S)
    body='\n'.join(re.sub(r'^\s*\* ?', '', line) for line in doc[1].splitlines()).strip() if doc else title
    docs.append({'slug':slug,'title':title,'section':'API','body':'# '+title+'\n\n'+clean(body)+f'\n\n[Source](#{BASE}/blob/main/{path})'})
settings={'members':[{'login':'maya','role':'owner','added':stamp(days=28)},{'login':'cora','role':'member','added':stamp(days=27)}],'invites':[],'secrets':[{'name':'CHANGESET_GITHUB_TOKEN','updated':stamp(days=5),'usedBy':['release-plan']},{'name':'WEBSITE_DISPATCH_TOKEN','updated':stamp(days=5),'usedBy':['release-plan']}],'models':[{'provider':'claude','state':'connected','account':'maya','plan':'Subscription','connected':stamp(days=20)},{'provider':'codex','state':'connected','account':'cora','plan':'Subscription','connected':stamp(days=20)}],'environment':[{'name':'Effect runtimes','image':'node:24-bookworm','updated':stamp(days=2),'size':'4 CPU · 8 GB','isDefault':True}],'sandboxes':{'egress':'allowlist','allow':['registry.npmjs.org','jsr.io','deno.land','github.com'],'services':['postgres:alpine','redis:alpine'],'maxRunning':3,'idleSuspendMinutes':30},'webhooks':[],'sync':{'github':{'state':'ok','lastSync':stamp(hours=.2),'app':'Smithers','detail':'Scenario sync receipt; not a live GitHub observation.'}},'reporting':'signed-in'}
ask=[{'view':'','context':'Effect-TS/effect · main · All packages','question':'Which packages are affected by the PostgreSQL fix?','answer':'The PR changes `@effect/sql-pg` and the shared `effect/sql` client. Its required Bun check also exercises `@effect/sql-sqlite-bun`.','cards':[{'kind':'pull','ref':'101'},{'kind':'run','ref':'run-4802'}]}, {'view':'issues/:n','context':'Effect-TS/effect · issue #42 · @effect/sql-pg','question':'/issue.implement 42','answer':'Open the TODO form with `@effect/sql-pg`, `effect`, cora and maya already selected.','cards':[{'kind':'issue','ref':'42'},{'kind':'run','ref':'run-4801'}]}, {'view':'pull/:n','context':'Effect-TS/effect · PR #101','question':'Why is this blocked?','answer':'maya requested SQLite rollback cleanup. The Bun check failed when the connection was reused after a failed COMMIT.','cards':[{'kind':'run','ref':'run-4802'}]}, {'view':'runs/:id/matrix','context':'Effect-TS/effect · run-4802 · All packages','question':'Open the failing test','answer':'The failure is in `packages/sql/sqlite-bun/test/Client.test.ts:83`. The Node and Deno placeholder results do not exercise Bun SQLite.','cards':[{'kind':'file','ref':'packages/sql/sqlite-bun/test/Client.test.ts'}]}, {'view':'flows/version-packages','context':'Effect-TS/effect · two pending changesets · rc','question':'/release.preview','answer':'The preview uses both root changesets and all 31 public fixed-group members. maya has an approval request before exact versions are computed.','cards':[{'kind':'run','ref':'run-4803'}]}]
repo={'owner':'Effect-TS','name':'effect','slug':'Effect-TS/effect','description':'Build production-ready applications in TypeScript.','visibility':'public','defaultBranch':'main','github':'https://github.com/Effect-TS/effect','homepage':'https://effect.website','license':'MIT','topics':['typescript','functional-programming','effect'],'languages':[{'name':'TypeScript','percent':98.2},{'name':'JavaScript','percent':1.3},{'name':'Shell','percent':.5}],'counts':{'commits':len(commits),'branches':len(branches),'tags':len(tags),'issuesOpen':sum(i['state']=='open' for i in issues),'pullsOpen':sum(p['state'] in ('open','draft') for p in pulls),'runsActive':sum(r['state'] in ('running','queued','waiting') for r in runs),'contributors':len(people)},'config':{'packages':packages,'docs':{'root':'packages','title':'Docs'},'home':[{'type':'links','links':[{'label':'Packages','url':'packages'},{'label':'Version packages','url':'releases/plan'},{'label':'Docs','url':'docs'}]}],'monorepo':{'workspace':'pnpm-workspace.yaml','sharedPaths':['.github/','scripts/','tsconfig*.json','vitest.config.ts','pnpm-lock.yaml','package.json'],'changesets':{'directory':'.changeset','config':'.changeset/config.json','prerelease':'rc'},'ci':{'workflows':['.github/workflows/check.yml','.github/workflows/release.yml'],'projects':'vitest.config.ts'},'flows':{'implement':'implement-issue','release':'release-plan'}}}}
# qa4: product home, public API preview and completed evidence use fixture receipts.
repo['config']['home'] = [{'type': 'text', 'text': '# Effect\n\nBuild production-ready TypeScript across the Effect workspace.'}, {'type': 'prompt', 'title': 'Ask about {package}', 'placeholder': 'Which checks cover {package}?'}, {'type': 'links', 'links': [{'label': 'Packages', 'url': 'packages'}, {'label': 'Version packages', 'url': 'releases/plan'}, {'label': 'Docs', 'url': 'docs'}]}, {'type': 'fixed-by-agents', 'issues': [48]}]
next(page for page in docs if page['slug'] == 'sql-pg/PgClient')['body'] = '# PgClient\n\nPostgreSQL support for Effect SQL, backed by the native wire protocol client.\n\n## PgClient service\n\n```ts\nexport const PgClient = Context.Service<PgClient>("@effect/sql-pg/PgClient")\n```\n\nA PostgreSQL `SqlClient` with JSON and `LISTEN`/`NOTIFY` helpers.\n\n## make\n\n```ts\nexport const make = (options: PgPoolConfig): Effect.Effect<PgClient, SqlError, Scope.Scope | Reactivity.Reactivity>\n```\n\n## layer\n\n```ts\nexport const layer = (config: PgPoolConfig): Layer.Layer<PgClient | Client.SqlClient, SqlError>\n```\n\n## Usage\n\n```ts\nimport { PgClient } from "@effect/sql-pg"\nimport { Redacted } from "effect"\n\nconst PostgresLive = PgClient.layer({\n  url: Redacted.make("postgres://user:password@localhost/app")\n})\n```\n\n[Full API reference](https://effect.website/docs/v4/api/sql-pg)\n\n[Source](#smithers.sh/Effect-TS/effect/blob/main/packages/sql/pg/src/PgClient.ts)'
next(pull for pull in pulls if pull['n'] == 107)['merged']['date'] = next(pull for pull in pulls if pull['n'] == 107)['updated']
next(item for item in issues if item['n'] == 48)['receipt'] = {'reported': {'by': 'dev-ahn', 'date': '2026-10-05T23:20:00Z'}, 'accepted': {'by': 'maya', 'date': '2026-10-06T11:20:00Z'}, 'working': {'run': 'run-4812', 'date': '2026-10-08T22:20:00Z'}, 'review': {'pull': 107, 'date': '2026-10-08T22:20:00Z'}, 'landed': {'sha': 'ea2466ebdff386990eb7fcc4a56be720dd58bda0', 'date': '2026-10-08T23:20:00Z'}}
for name,data in list(locals().items()):
    if name in ['repo','people','tree','files','blame','commits','branches','tags','labels','issues','pulls','stack','runs','approvals','flows','agents','wiki','docs','releases','settings','ask','relations']:write(name,data)
write('release-plan',release_plan);write('ci-projects',ci_projects);write('package-releases',package_releases)
write('manifest',{'MOCK_NOW':NOW,'checkout':'a read-only checkout of Effect-TS/effect-smol; set EFFECT_SOURCE to its path to audit','sourceFiles':source_receipts,'releaseSources':[{'path':p['changelog'],'sha256':hashlib.sha256((ROOT/p['changelog']).read_bytes()).hexdigest(),'treatment':'Complete sanitized rc.115 through rc.118 sections where present; full historical blob omitted.'} for p in public],'scenarioFields':['people','commits','branches','tags','issues','pulls','stack','runs','approvals','flows','agents','wiki','settings','ask','relations'],'notes':['All authors, conversations, timestamps, runtime outcomes, publication and sync receipts are explicit scenarios. Technical source and release notes come from the checkout.','The .smithers flow sources are proposed fixture configuration; no upstream CODEOWNERS or .smithers directory exists.','The current checkout moved effect/unstable/* to effect/*; the PostgreSQL scenario uses packages/effect/src/sql/SqlClient.ts.','Full historical changelog blobs total over 5 MB and are omitted to respect the 2.5 MB fixture limit; four complete sanitized rc sections per public package are in package-releases.json.','Generated installation/build files and .changeset/pre history listings are excluded; the complete core source and PostgreSQL source/test trees are included.','Schema.ts is the only truncated code blob (600 source lines and an explicit trailing comment).','Release-plan exact next versions are null until pinned Changesets preview executes; no next version was inferred.']})
print(json.dumps({'packages':len(packages),'public':len(public),'private':len(packages)-len(public),'tree':len(tree),'files':len(files),'commits':len(commits),'issues':len(issues),'pulls':len(pulls),'runs':len(runs),'packageReleases':len(package_releases),'bytes':sum(p.stat().st_size for p in OUT.iterdir() if p.is_file())},indent=2))
