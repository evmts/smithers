"""Stage-2 fixture additions. Read local source only; write this dataset only."""
import json
import os
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
# SMITHERS_SOURCE names a read-only smithers checkout; by default, the repository that holds this mock.
SOURCE = Path(os.environ.get('SMITHERS_SOURCE') or HERE.parents[8])
SOURCE_REVISION = 'e75952e77560b6a4b0a5ae529d4f690a5332d11c'

def read(name):
    return json.loads((HERE / (name + '.json')).read_text())

def write(name, value):
    (HERE / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def source(path):
    if path in {'evals/swebench/fixtures/scorecard.json', 'evals/swebench/fixtures/scorecard.md'}:
        return (HERE / 'imports' / ('swebench-' + path.rsplit('/', 1)[-1])).read_text()
    return subprocess.run(['jj', '--ignore-working-copy', 'file', 'show', '-r', SOURCE_REVISION, 'root-file:' + path], cwd=SOURCE, capture_output=True, text=True, check=True).stdout

def case(name, score, baseline=1, detail=''):
    return dict(id=name, title=name, score=score, baseline=baseline, passed=score >= baseline, detail=detail)

def suite(id, title, file, scorer, threshold, score, baseline, cases, state='pass', note='', runnable=True, date='2026-10-17T23:00:00Z'):
    return dict(id=id, title=title, file=file, scorer=scorer, threshold=threshold,
                latest=dict(run='run-eval-snapshot-' + id, date=date, score=score, baseline=baseline,
                            passed=sum(c['passed'] for c in cases), total=len(cases), state=state),
                history=[dict(date=date, score=score)],
                cases=cases, note=note, runnable=runnable)

review_file = '.smithers/flows/review/seeded-bugs/review-seeded-bugs.eval.ts'
review = json.loads(source('.smithers/flows/review/seeded-bugs/baseline.json'))['records']
review_cases = []
for row in review:
    tp, fp, fn = row['matches'], row['falsePositives'], row['falseNegatives']
    score = 2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 1
    review_cases.append(case(row['fixture'], score, score, f"Recorded deterministic baseline: {tp} matched, {fp} false positive, {fn} missed. Exact anchors and severity are gated separately."))
tp, fp, fn = (sum(row[k] for row in review) for k in ['matches', 'falsePositives', 'falseNegatives'])
f1 = 2*tp/(2*tp+fp+fn)

recommend_file = 'packages/backend/modelhost/recommend-eval/recommend.eval.ts'
recommend = [json.loads(line) for line in source('packages/backend/modelhost/recommend-eval/fixtures/sample.jsonl').splitlines() if line.strip()]
scored = [row for row in recommend if row.get('outcome')]
hits = sum(row['outcome']['command'] in row['commands'] for row in scored)
hit_rate = hits / len(scored)

agent_file = 'packages/smithers/agent/regression/agent.eval.ts'
agent = json.loads(source('packages/smithers/agent/regression/baseline.json'))['records']
agent_cases = [case(row['case'], row['score'], row['score'], 'Recorded committed baseline. Both evals/agent/behaviour and evals/agent/contract must remain 1. No live model is graded.') for row in agent if row['scorerName'] == 'evals/agent/behaviour']

swe_file = 'evals/swebench/fixtures/scorecard.json'
swe = json.loads(source(swe_file))
swe_cases = [case(row['instanceId'], int(row['quality']['verdict'] == 'resolved'), int(row['baseline']['verdict'] == 'resolved'), f"Recorded 2026-08-19 fixture wave. Flows: {row['quality']['verdict']}; Codex comparison: {row['baseline']['verdict']}. {row['quality']['patchBytes']} patch bytes. This is not a current benchmark result.") for row in swe['instances']]
authoring_file = 'evals/authoring/validate.ts'
authoring_rows = [json.loads(line) for line in source('evals/authoring/data/pilot-sft.jsonl').splitlines() if line.strip()]
evals = [
    suite('review-seeded-bugs', 'Review seeded bugs', review_file, 'review-seeded-bugs/f1', 'No drift from the deterministic baseline', f1, f1, review_cases,
          note='Offline pipeline baseline: F1 63.2%, recall 50%, precision 85.7%. A person reviews the resulting findings.'),
    suite('authoring', 'Workflow authoring', authoring_file, 'Chat shape · public workspace imports', 'All pilot rows satisfy the validator', 1, 1,
          [case(f'pilot-{i+1:02d}', 1, 1, 'Pilot chat-format row: assistant final turn, user context, public workspace imports. Display snapshot; no validator execution receipt is supplied.') for i in range(len(authoring_rows))],
          state='inconclusive', runnable=False, note='Pilot dataset snapshot. No validator execution receipt or fixed-suite adapter is supplied.'),
    suite('recommend', 'Command recommendations', recommend_file, 'recommend/hit-rate · hit@5', 'No regression from the sample log', hit_rate, hit_rate,
          [case('sample', hit_rate, hit_rate, f'{hits}/{len(scored)} outcomes hit an offered command. {len(recommend)-len(scored)} rows without outcomes are excluded, not scored as failures.')],
          note=f'Offline sample log: {len(scored)}/{len(recommend)} rows have outcomes.'),
    suite('swebench', 'SWE-bench Verified', swe_file, 'Resolved instances · tests pass', 'Match the recorded Codex comparison (5/5)', .2, 1, swe_cases, state='regressed', runnable=False,
          note='Recorded fixture wave · August 19, 2026. Flows resolved 1/5; Codex resolved 5/5. Baseline is that comparison, not a prior Smithers run. No current performance claim.', date='2026-08-19T23:00:00Z'),
    suite('agent', 'Agent regression', agent_file, 'evals/agent/behaviour · evals/agent/contract', 'Mean 1 · minimum 1 · no missing cases', 1, 1, agent_cases,
          note='Scripted-provider baseline. Each case gates behaviour and observation contracts.')
]
# The fixture wave predates the review clock; never attach later "history" to it.
sources = ['.smithers/flows/review/seeded-bugs/baseline.json', 'evals/authoring/data/pilot-sft.jsonl', 'packages/backend/modelhost/recommend-eval/fixtures/sample.jsonl', 'evals/swebench/fixtures/scorecard.json', 'packages/smithers/agent/regression/baseline.json']
for item, recorded_source in zip(evals, sources): item['sourceFile'] = recorded_source
evals[1]['unexecuted'] = True
evals[1]['history'] = []
evals[1]['latest'].update(score=0, baseline=0, passed=0)
for row in evals[1]['cases']: row.update(score=0, baseline=0, passed=False)
evals[1]['unavailable'] = 'The authoring validator has no eval suite adapter yet.'
evals[3]['importedSnapshot'] = True
evals[3]['note'] = 'Imported snapshot · not in this repository. ' + evals[3]['note']
evals[3]['unavailable'] = 'Recorded fixture wave · imported snapshot, not a repository suite.'
write('evals', evals)

# Map metadata to the mock cast. Complete source blobs and exported messages remain byte-for-byte source.
def cast(value):
    if isinstance(value, list): return [cast(item) for item in value]
    if isinstance(value, dict): return {key: cast(item) for key, item in value.items()}
    return 'maya' if value == 'roninjin10' else value

for name in ['people','commits','branches','issues','pulls','stack','runs','approvals','flows','agents','wiki','releases','settings','ask']:
    value = cast(read(name))
    if name == 'people':
        owner = next(person for person in value if person['login'] == 'maya')
        owner.update(name='maya', initials='M')
        next(person for person in value if person['login'] == 'lander').update(kind='human', role='member', name='lander')
    if name in ['agents','wiki','ask']:
        value = json.loads(json.dumps(value).replace('roninjin10', 'maya'))
    write(name, value)

settings = read('settings')
settings['sync']['github'] = dict(state='ok', lastSync=max(item['date'] for item in read('commits')), app='Smithers')
write('settings', settings)

repo = read('repo')
repo['config']['evals'] = {'title': 'Evals'}
write('repo', repo)
flows, runs = read('flows'), read('runs')
flows = [flow for flow in flows if flow['name'] != 'eval.run']
runs = [run for run in runs if not run['id'].startswith('run-eval-snapshot-')]
for item in evals:
    stage = dict(id='snapshot', label='Snapshot import', state='succeeded', started=item['latest']['date'],
                 summary=item['note'], log=['Snapshot import; no eval was executed by this site.', 'Imported snapshot; not a repository file.' if item.get('importedSnapshot') else f"Source: {item.get('sourceFile', item['file'])}", item['note']])
    runs.append(dict(id=item['latest']['run'], flow='eval.run', title='Authoring dataset snapshot' if item.get('unexecuted') else 'Recorded eval snapshot: '+item['title'], state='succeeded',
                     trigger=dict(kind='manual', by='maya', ref='Recorded fixture'), harness='Offline fixture', started=item['latest']['date'], finished=item['latest']['date'],
                     duration='Recorded', cost=dict(usd=0, tokens=0), stages=[stage], approvals=[], trace=[dict(at=item['latest']['date'], stage='snapshot', kind='message', text=item['note'])]))
eval_cli = 'packages/smithers/src/evaluation/EvalCli.ts'
flows.append(dict(name='eval.run', file=eval_cli, description='Run a fixed eval suite with its declared scorers. Snapshot runs in this mock import recorded fixtures.',
                  inputs=[dict(name='file', type='string', required=True, description='Eval suite module path.')], triggers=[dict(kind='manual',spec='Suite module',enabled=True)], roles=[],
                  graph=dict(nodes=[dict(id='execute',label='Execute cases',kind='check'),dict(id='score',label='Score',kind='check'),dict(id='compare',label='Compare baseline',kind='check')], edges=[['execute','score'],['score','compare']]),
                  runs=[item['latest']['run'] for item in evals]))
next(flow for flow in flows if flow['name']=='land')['description'] = 'After a person approves, the configured landing user takes the next change from the queue and checks its landing gates.'
write('flows',flows)
write('runs',runs)

files, tree, blame = read('files'), read('tree'), read('blame')
paths = ['packages/smithers/agent/evals/docs/guides/author-a-suite.md'] + sources + [item['file'] for item in evals] + [eval_cli, '.smithers/flows/review/seeded-bugs/SCORECARD.md', 'evals/swebench/fixtures/scorecard.md']
anchor = read('commits')[-1]['sha']
# Imported scorecards never become repository file/tree/blame subjects.
imported_paths = {'evals/swebench/fixtures/scorecard.json', 'evals/swebench/fixtures/scorecard.md'}
files = [item for item in files if item['path'] not in imported_paths]
tree = [item for item in tree if item['path'] not in imported_paths]
blame = [item for item in blame if item['path'] not in imported_paths]
for path in dict.fromkeys(paths):
    if path in imported_paths: continue
    content = source(path)
    if not any(blob['path']==path for blob in files):
        files.append(dict(path=path,lang='json' if path.endswith(('.json', '.jsonl')) else 'md' if path.endswith('.md') else 'ts',content=content))
        blame.append(dict(path=path,start=1,end=len(content.split('\n')),sha=anchor))
    parts = path.split('/')
    for depth in range(1,len(parts)+1):
        name = '/'.join(parts[:depth])
        if not any(entry['path']==name for entry in tree): tree.append(dict(path=name,kind='file' if depth==len(parts) else 'dir',sha=anchor))
    next(entry for entry in tree if entry['path']==path)['size'] = len(content.encode())
write('files',files); write('tree',tree); write('blame',blame)

settings = read('settings')
if not any(member['login'] == 'lander' for member in settings['members']):
    settings['members'].append(dict(login='lander', role='member', added='2026-08-31T12:00:00Z'))
write('settings', settings)
ask = [sample for sample in read('ask') if sample['view'] != 'evals']
base = 'smithers.sh/smithers-canary/smithers'
ask.append(dict(view='evals', context='Fixed suites · recorded snapshots', question='Which eval needs attention?',
                answer='The [SWE-bench fixture wave]('+base+'/evals/swebench) records 1/5 resolved versus the 5/5 Codex comparison. It is an imported snapshot, not a repository file or current result. Authoring is inconclusive because no execution receipt is supplied.',
                cards=[dict(kind='run', ref='run-eval-snapshot-swebench')]))
write('ask', ask)

subjects = ['MOCK_NOW','repo','people','tree','files','blame','commits','omittedCommits','branches','tags','labels','issues','pulls','stack','runs','approvals','flows','agents','wiki','docs','releases','settings','ask','evals']
imports = '\n'.join(f'import {field} from "./{field}.json"' for field in subjects)
properties = '\n'.join(f'  {field}: {field} as Dataset["{field}"],' for field in subjects if field != 'repo')
# Keep the shared fixture API read-only. Consumers get configured suites through its live `repo` binding.
configured_repo = '  repo: { ...repo, config: { ...repo.config, evals: { ...repo.config.evals, suites: evals } } } as Dataset["repo"],'
(HERE/'index.ts').write_text('import type { Dataset } from "../../types"\n'+imports+'\n\nexport const dataset: Dataset = {\n'+configured_repo+'\n'+properties+'\n}\n')
print(f'Extended stage 2: {len(evals)} eval suites, {len(files)} complete source blobs.')
