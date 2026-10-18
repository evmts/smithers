// Fixture authorship and claim boundaries; no browser or network access.
// Meet this gate by excluding conflicting sourced records, never by editing source text.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const agentLogins = new Set(['smithers', 'smithers-agent', 'the agent', 'an agent'])
const agentMergeActor = text => [...agentLogins].some(login => new RegExp('\\b' + login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+wants to merge\\b', 'i').test(text))
const forbiddenClaim = text => agentMergeActor(text)
  || /Only the lander takes[\s\S]{0,110}to publication|The lander is running the landing gates|Landing: retain signal delivery receipts/i.test(text)
  || [...agentLogins].some(login => new RegExp('\\b' + login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(?:approved|approves|merged|merges|lands|landed)\\b', 'i').test(text))
  || /reviewed, tested changes|landed in order by the lander|doesn.t merge for you[\s\S]{0,60}yet|ready to merge/i.test(text)
let checked = 0
for (const entry of readdirSync(join(root, 'fixtures/data'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const directory = join(root, 'fixtures/data', entry.name)
  const read = name => JSON.parse(readFileSync(join(directory, name+'.json'), 'utf8'))
  const people = read('people')
  const configuredAgents = read('agents')
  for (const agent of configuredAgents) assert(!people.some(person => person.login === agent.id && person.kind === 'human'), `${entry.name}/${agent.id}: check agent and human identities must differ`)
  for (const agent of configuredAgents) agentLogins.add(agent.id)
  for (const person of people) if (person.kind === 'agent') agentLogins.add(person.login)
  const human = login => people.some(person => person.login === login && person.kind === 'human')
  const pulls = read('pulls')
  const viewer = people.find(person => person.role === 'owner').login
  assert(pulls.some(pull => pull.state === 'open' && pull.agent && pull.checks.length > 0
    && pull.checks.every(check => check.state === 'success')
    && (pull.reviewers.length ? pull.reviewers.includes(viewer) : pull.agent.for === viewer)
    && !pull.reviews.some(review => review.author === viewer && review.state !== 'commented')),
    `${entry.name}: demonstrate an open passed agent PR awaiting the viewer's review`)
  const example = pulls.find(pull => pull.n === 9001)
  if (example) {
    assert.match(example.body, /^Mock scenario:/, 'Additional example is an explicit simulation')
    const commit = read('commits').find(commit => commit.sha === example.commits[0])
    const run = read('runs').find(run => run.id === example.agent.run)
    const branch = read('branches').find(branch => branch.name === example.head)
    const stack = read('stack').find(item => item.pull === example.n)
    assert.equal(example.commits.length, 1)
    assert.equal(commit.pull, example.n)
    assert.deepEqual(commit.agent, example.agent)
    assert.deepEqual(commit.files, example.files)
    assert.deepEqual(commit.checks, example.checks)
    assert.equal(run.state, 'succeeded')
    assert.equal(run.pull, example.n)
    assert.equal(branch.head, commit.sha)
    assert.equal(branch.run, run.id)
    assert.equal(branch.ahead, 1)
    assert.equal(branch.behind, 0)
    assert.deepEqual(commit.branches, [branch.name])
    assert.deepEqual(commit.parents, [read('branches').find(branch => branch.name === example.base).head])
    assert(example.checks.every(check => check.run === run.id))
    assert.equal(stack.run, run.id)
    assert.equal(stack.state, 'ready')
    assert.equal(example.reviews.length, 0)
  }
  for (const pull of pulls) {
    if (pull.agent) {
      assert(human(pull.agent.for), `${entry.name}#${pull.n}: a person requests agent work`)
      assert(pull.reviewers.every(human), `${entry.name}#${pull.n}: only people review and merge`)
    }
    for (const review of pull.reviews) {
      assert(review.state === 'commented' || (!review.agent && human(review.author)), `${entry.name}#${pull.n}: only a person gives a review verdict`)
    }
    if (pull.merged) assert(human(pull.merged.by), `${entry.name}#${pull.n}: only a person merges`)
    checked++
  }
  for (const approval of read('approvals')) {
    assert(human(approval.askedOf), `${entry.name}/${approval.id}: a person receives approval requests`)
    if (approval.decided) assert(human(approval.decided.by), `${entry.name}/${approval.id}: a person decides`)
  }
}
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)])
for (const file of [...walk(root), ...walk(resolve(root, '../effect'))]) {
  if (!/\.(tsx?|json|py)$/.test(file)) continue
  const text = readFileSync(file, 'utf8')
  assert(!forbiddenClaim(text), `${file}: agent cannot want to merge`)
  assert(!/\{item\.author\}[^\n]*wants to merge/.test(text) || text.includes('item.agent ?'), `${file}: dynamic agent author cannot be the merge requester`)
  assert(!/ready to (?:merge|land)\b/i.test(text), `${file}: no readiness verdict`)
  assert(!/(?:approved|landed|merged) by (?:an? agent|smithers(?:-agent)?)\b/i.test(text), `${file}: no agent approval or merge attribution`)
  assert(!/\b(?:smithers(?:-agent)?|the agent) (?:approves|merges|lands)\b/i.test(text), `${file}: only a person approves or merges`)
}
for (const login of agentLogins) {
  assert(forbiddenClaim(`${login} wants to merge 1 commit`), 'reject agent merge request')
  assert(forbiddenClaim(`${login} merged 1 commit`), 'reject agent merge receipt')
  assert(forbiddenClaim(`${login} approves this change`), 'reject agent approval')
  assert(forbiddenClaim(`${login} lands this change`), 'reject agent landing')
}
for (const phrase of ['reviewed, tested changes', 'landed in order by the lander', "doesn't merge for you … yet", 'Ready to merge', 'ready to merge', 'Only the lander takes a queued change through its tests and mandatory landing gates to publication', 'The lander is running the landing gates.', 'Landing: retain signal delivery receipts']) assert(forbiddenClaim(phrase), `reject ${phrase}`)
assert(!agentMergeActor('cora wants to merge 1 commit'), 'people may request a merge')
console.log(`PASS claim boundaries across ${checked} PRs and all repo/effect code and fixtures`)
