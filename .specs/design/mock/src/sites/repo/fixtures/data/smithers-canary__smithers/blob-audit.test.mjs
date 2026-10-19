/** Exercise the actual audit in fresh processes without mutating shared fixtures. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const checker = new URL('./check.mjs', import.meta.url).href
// The source root check.mjs uses: SMITHERS_SOURCE, or the repository that holds this mock.
const sourceRoot = (process.env.SMITHERS_SOURCE || fileURLToPath(new URL('../../../../../../../../../', import.meta.url))).replace(/\/+$/, '')
const files = new URL('./files.json', import.meta.url).pathname
const evals = new URL('./evals.json', import.meta.url).pathname
const snapshot = new URL('./imports/swebench-scorecard.json', import.meta.url).pathname
const pin = 'e75952e77560b6a4b0a5ae529d4f690a5332d11c'
const run = mutation => spawnSync(process.execPath, ['--input-type=module', '-e', `
  import fs from 'node:fs'
  import cp from 'node:child_process'
  import { syncBuiltinESMExports } from 'node:module'
  const read = fs.readFileSync
  const exec = cp.execFileSync
  const fixturePaths = JSON.parse(read(${JSON.stringify(files)}, 'utf8')).map(f => f.path)
  let sourceReads = 0
  cp.execFileSync = (command, args, options) => {
    if (command !== 'jj' || JSON.stringify(args.slice(0, 5)) !== JSON.stringify(['--ignore-working-copy', 'file', 'show', '-r', ${JSON.stringify(pin)}]) || !args[5].startsWith('root-file:')) throw new Error('Audit must use only pinned read-only jj file show')
    sourceReads++
    return exec(command, args, options)
  }
  fs.readFileSync = (path, ...args) => {
    const name = String(path)
    if (fixturePaths.some(p => name === ${JSON.stringify(sourceRoot + '/')} + p) || name === ${JSON.stringify(sourceRoot + '/.smithers/home.json')}) throw new Error('Moving checkout read')
    const raw = read(path, ...args)
    const mutate = ${mutation.toString()}
    return mutate(name, raw)
  }
  syncBuiltinESMExports()
  await import(${JSON.stringify(checker)})
  if (sourceReads !== 38) throw new Error('Expected 37 blobs and pinned home blocks')
`], { encoding: 'utf8', maxBuffer: 2 ** 21 })

// Functions are serialized into the child; paths are supplied as literals below.
const changeFiles = body => new Function('name', 'raw', `if (name !== ${JSON.stringify(files)}) return raw; const data = JSON.parse(raw); ${body}; return JSON.stringify(data)`)
const reject = (mutation, message) => {
  const result = run(mutation)
  assert.notEqual(result.status, 0, result.stdout)
  assert.match(result.stderr, message)
}

test('all repository bytes pass using only the immutable source revision', () => {
  const result = run((_name, raw) => raw)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /PASS \d+ checks/)
})
test('README bytes beyond the one allowed sentence are rejected', () => reject(changeFiles(`data.find(f => f.path === 'README.md').content += '\\n'`), /README.md: full source content changed or truncated/))
test('package fields beyond the description are rejected', () => reject(changeFiles(`const f = data.find(f => f.path === 'package.json'); f.content = f.content.replace('"name": "smithers"', '"name": "changed"')`), /package.json: full source content changed or truncated/))
test('a different README description is rejected', () => reject(changeFiles(`const f = data.find(f => f.path === 'README.md'); f.content = f.content.replace('tested changes for you to review', 'tested changes')`), /README.md: full source content changed or truncated/))
test('Effect versions are exact source bytes, not a normalization exception', () => reject(changeFiles(`const f = data.find(f => f.path === 'packages/smithers/package.json'); f.content = f.content.replace('4.0.4', '4.0.5')`), /packages\/smithers\/package.json: full source content changed or truncated/))
test('imported snapshots cannot silently change bytes', () => reject(new Function('name', 'raw', `return name === ${JSON.stringify(snapshot)} ? raw + '\\n' : raw`), /imported snapshot changed/))
test('only the named SWE-bench import can omit a repository source', () => reject(new Function('name', 'raw', `if (name !== ${JSON.stringify(evals)}) return raw; const data = JSON.parse(raw); data.find(s => s.id === 'agent').importedSnapshot = true; return JSON.stringify(data)`), /only the documented SWE-bench snapshot may omit a repository file/))
test('executed suites cannot opt out of their case verdicts', () => reject(new Function('name', 'raw', `if (name !== ${JSON.stringify(evals)}) return raw; const data = JSON.parse(raw); data.find(s => s.id === 'agent').unexecuted = true; return JSON.stringify(data)`), /only the documented authoring snapshot has unexecuted placeholders/))
