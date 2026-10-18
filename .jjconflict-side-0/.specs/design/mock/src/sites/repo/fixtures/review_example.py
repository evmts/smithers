"""Explicit simulated review evidence, separate from imported source records."""
import datetime
import hashlib
import json
from pathlib import Path

EXAMPLE_NUMBER = 9001
EXAMPLE_RUN = 'run-review-example'

def apply_review_example(data):
    if data['repo']['slug'] == 'Effect-TS/effect' or any(p['n'] == EXAMPLE_NUMBER for p in data['pulls']):
        return
    branch = 'mock/review-example'
    now = datetime.datetime.fromisoformat(data['MOCK_NOW'].replace('Z', '+00:00'))
    started = (now - datetime.timedelta(minutes=4)).isoformat().replace('+00:00', 'Z')
    date = (now - datetime.timedelta(minutes=1)).isoformat().replace('+00:00', 'Z')
    sha = hashlib.sha1((data['repo']['slug'] + ':review-example-v1').encode()).hexdigest()
    flow = next((f for f in data['flows'] if f['name'] == 'implement-issue'), next(f for f in data['flows'] if f['name'] == 'docs-sync'))
    harness = 'Codex · gpt-6.1-sol'
    agent = {'run': EXAMPLE_RUN, 'flow': flow['name'], 'harness': harness, 'for': 'maya'}
    title = 'Add a review example'
    diff = {'path': 'review-example.md', 'status': 'added', 'additions': 1, 'deletions': 0,
            'lines': [{'kind': 'hunk', 'text': '@@ -0,0 +1 @@'}, {'kind': 'add', 'text': 'A small example for human review.', 'new': 1}]}
    checks = [{'name': 'Example content', 'state': 'success', 'duration': '1 s',
               'detail': 'Mock scenario: the example contains one nonempty line.', 'run': EXAMPLE_RUN}]
    data['commits'].insert(0, {'sha': sha, 'title': title, 'body': 'Mock review scenario.', 'author': 'smithers-agent', 'agent': agent,
        'date': date, 'parents': [next(b['head'] for b in data['branches'] if b['name'] == data['repo']['defaultBranch'])],
        'branches': [branch], 'pull': EXAMPLE_NUMBER, 'checks': checks, 'verified': True, 'files': [diff]})
    data['pulls'].append({'n': EXAMPLE_NUMBER, 'title': title, 'state': 'open',
        'kind': 'pull' if data['repo']['slug'] == 'maya/tinyhttp' else 'landing', 'author': 'smithers-agent', 'agent': agent,
        'base': data['repo']['defaultBranch'], 'head': branch, 'opened': date, 'updated': date,
        'body': 'Mock scenario: a one-line documentation change with passed checks, awaiting maya’s review.',
        'reviewers': ['maya'], 'reviews': [], 'reviewComments': [], 'comments': [],
        'checks': checks, 'commits': [sha], 'files': [diff], 'fixes': [], 'labels': []})
    data['branches'].append({'name': branch, 'head': sha, 'author': 'smithers-agent', 'updated': date,
        'ahead': 1, 'behind': 0, 'protected': False, 'pull': EXAMPLE_NUMBER, 'run': EXAMPLE_RUN})
    stages = [{'id': name.lower(), 'label': name, 'state': 'succeeded', 'started': started, 'duration': '1 min',
               'summary': 'Mock review example.', 'log': ['Simulated example step completed.']} for name in ['Understand', 'Implement', 'Verify']]
    data['runs'].append({'id': EXAMPLE_RUN, 'flow': flow['name'], 'title': title, 'state': 'succeeded',
        'trigger': {'kind': 'manual', 'by': 'maya'}, 'harness': harness, 'started': started, 'finished': date,
        'duration': '3 min', 'cost': {'usd': .01, 'tokens': 100}, 'branch': branch, 'pull': EXAMPLE_NUMBER,
        'stages': stages, 'approvals': [], 'trace': [{'at': date, 'stage': 'verify', 'kind': 'checkpoint', 'text': 'Mock check passed; human review requested.'}]})
    flow['runs'].append(EXAMPLE_RUN)
    data['stack'].append({'id': 'review-example', 'order': max(s['order'] for s in data['stack']) + 1,
        'title': title, 'state': 'ready', 'owner': 'lander' if data['repo']['slug'] == 'smithers-canary/smithers' else 'maya',
        'pull': EXAMPLE_NUMBER, 'run': EXAMPLE_RUN, 'updated': date})
    for field in ['commits', 'branches']:
        data['repo']['counts'][field] = len(data[field])
    data['repo']['counts']['pullsOpen'] = sum(p['state'] in ['open', 'draft'] for p in data['pulls'])

if __name__ == '__main__':
    for directory in (Path(__file__).parent / 'data').iterdir():
        if not directory.is_dir():
            continue
        names = ['repo', 'pulls', 'commits', 'branches', 'runs', 'flows', 'stack']
        data = {name: json.loads((directory / (name + '.json')).read_text()) for name in names}
        data['MOCK_NOW'] = json.loads((directory / 'MOCK_NOW.json').read_text()) if (directory / 'MOCK_NOW.json').exists() else '2026-10-17T21:00:00.000Z'
        before = json.dumps(data)
        apply_review_example(data)
        if json.dumps(data) != before:
            for name in names:
                (directory / (name + '.json')).write_text(json.dumps(data[name], ensure_ascii=False, indent=2) + '\n')
