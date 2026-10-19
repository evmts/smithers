import { expect, setDefaultTimeout, test } from 'bun:test'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { spawnSync } from './test-child'

// One case starts up to ten Node processes and takes four seconds on an idle
// machine; beside the rest of the unit suite it passes Bun's five-second
// default (#3483). The child keeps test-child's own 30-second limit.
setDefaultTimeout(60_000)

for (const shard of [undefined, '1', '2', '3']) test(`browser runner preserves tiers for shard ${shard ?? 'local'}`, () => {
  const root = mkdtempSync(join(tmpdir(), 'browser-shard-'))
  try {
    const log = join(root, 'commands')
    writeFileSync(join(root, 'pnpm'), '#!/usr/bin/env node\nrequire("fs").appendFileSync(process.env.COMMAND_LOG, JSON.stringify({args:process.argv.slice(2),skip:process.env.SMITHERS_SKIP_SPA_BUILD})+"\\n")\n')
    chmodSync(join(root, 'pnpm'), 0o755)
    // In the fixture's own directory: a run that reaches a red step writes its
    // retained reports beside its working directory, and that must never be
    // this package (scripts/run-pr-e2e.mjs).
    const result = spawnSync('node', [join(import.meta.dir, 'run-pr-e2e.mjs'), ...(shard ? [shard] : [])], {
      cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${root}:${process.env.PATH}`, COMMAND_LOG: log }
    })
    expect(result.status).toBe(0)
    const commands = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(commands.slice(0, 4).map(command => command.args)).toEqual([
      ['exec', 'playwright', 'install', '--with-deps', 'chromium', 'webkit'], ['run', 'test:e2e:auth'],
      ['run', 'test:e2e:probes'], ['run', 'test:e2e:graph-lifecycle']
    ])
    expect(commands[4].args).toEqual(['exec', 'playwright', 'test', ...(shard ? [`--shard=${shard}/3`] : [])])
    if (!shard || shard === '3') {
      expect(commands.slice(5).map(command => command.args.at(-1))).toEqual([
        'playwright.showcase.config.ts', 'playwright.site.config.ts', 'playwright.graph.config.ts'
      ])
      expect(commands[5].skip).toBe(shard ? undefined : '1')
    } else expect(commands.length).toBe(5)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

/*
 * A failed step's evidence must outlive the steps that run after it. T1, site
 * and graph all clear Playwright's default test-results/ when they start, and
 * the four Bun preflight steps write their JUnit report into that same
 * directory, so a red preflight left nothing for CI to upload: release
 * 38710688411's shard 3 failed in `probes` and its artifact step reported
 * "No files were found with the provided path". These cases drive the runner
 * through a fake pnpm that reproduces exactly that: an early step writes a
 * report and exits non-zero, a later green step deletes the directory.
 */

/** A fake pnpm on PATH, on a bin directory outside the run's own cwd. */
const fakePnpm = (root: string, body: string): string => {
  const bin = join(root, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'pnpm'), `#!/usr/bin/env node
const { mkdirSync, rmSync, writeFileSync, appendFileSync } = require('fs')
const args = process.argv.slice(2)
appendFileSync(process.env.COMMAND_LOG, JSON.stringify(args) + '\\n')
${body}
process.exit(0)
`)
  chmodSync(join(bin, 'pnpm'), 0o755)
  return bin
}

const runShard3 = (root: string, body: string) => {
  const bin = fakePnpm(root, body)
  return spawnSync('node', [join(import.meta.dir, 'run-pr-e2e.mjs'), '3'], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, COMMAND_LOG: join(root, 'commands') }
  })
}

const stages = (root: string) => JSON.parse(readFileSync(join(root, 'stage-evidence/stages.json'), 'utf8'))

/** The JUnit report the four Bun preflight steps write, as its bunfig declares it. */
const junitReport = /^\s*junit = "([^"]+)"$/m.exec(readFileSync(join(import.meta.dir, '../bunfig.toml'), 'utf8'))![1]!

test('a failed step keeps its report where the later steps that clear it cannot reach', () => {
  const root = mkdtempSync(join(tmpdir(), 'browser-stage-'))
  try {
    const result = runShard3(root, `
if (args.join(' ') === 'run test:e2e:probes') {
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/unit-tests.xml', '<testsuites name="probes"/>')
  process.exit(1)
}
if (args.includes('playwright') && args.includes('test')) rmSync('test-results', { recursive: true, force: true })
`)
    expect(result.status).toBe(1)
    // The later tiers still run, and the run still clears test-results/.
    const commands = readFileSync(join(root, 'commands'), 'utf8').trim().split('\n')
    expect(commands.length).toBe(8)
    expect(existsSync(join(root, 'test-results'))).toBe(false)
    expect(readFileSync(join(root, 'stage-evidence/probes/test-results/unit-tests.xml'), 'utf8')).toBe('<testsuites name="probes"/>')
    const manifest = stages(root)
    expect(manifest).toMatchObject({ runner: 'run-pr-e2e', shard: '3', exit: 1, complete: true })
    expect(manifest.stages.map((stage: { stage: string; status: number }) => [stage.stage, stage.status])).toEqual([
      ['install', 0], ['auth', 0], ['probes', 1], ['graph-lifecycle', 0],
      ['t1', 0], ['showcase', 0], ['site', 0], ['graph', 0]
    ])
    expect(manifest.stages[2].retained).toEqual(['test-results'])
    expect(manifest.stages[2].reason).toBeUndefined()
    // A green step keeps no copy of its own outputs.
    expect(existsSync(join(root, 'stage-evidence/t1'))).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a failed step that wrote no report at all still names itself and its status', () => {
  const root = mkdtempSync(join(tmpdir(), 'browser-stage-'))
  try {
    const result = runShard3(root, "if (args.join(' ') === 'run test:e2e:auth') process.exit(3)\n")
    expect(result.status).toBe(3)
    expect(readFileSync(join(root, 'commands'), 'utf8').trim().split('\n').length).toBe(8)
    const manifest = stages(root)
    expect(manifest.exit).toBe(3)
    expect(manifest.stages[1]).toMatchObject({ stage: 'auth', status: 3, retained: [], reason: 'no-known-output-paths' })
    expect(typeof manifest.stages[1].minutes).toBe('number')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a green run keeps no evidence directory, and a failed install stops the run', () => {
  const green = mkdtempSync(join(tmpdir(), 'browser-stage-'))
  try {
    expect(runShard3(green, '').status).toBe(0)
    expect(existsSync(join(green, 'stage-evidence'))).toBe(false)
  } finally { rmSync(green, { recursive: true, force: true }) }
  const red = mkdtempSync(join(tmpdir(), 'browser-stage-'))
  try {
    const result = runShard3(red, "if (args.includes('install')) process.exit(7)\n")
    expect(result.status).toBe(7)
    expect(readFileSync(join(red, 'commands'), 'utf8').trim().split('\n').length).toBe(1)
    expect(stages(red)).toMatchObject({ exit: 7, complete: true })
  } finally { rmSync(red, { recursive: true, force: true }) }
})

test('a retained report keeps no link, so no path outside the report directory reaches the artifact', () => {
  const root = mkdtempSync(join(tmpdir(), 'browser-stage-'))
  try {
    // A link the uploader would resolve is how a path outside test-results/
    // would reach an artifact, so the copy skips links at every depth.
    const result = runShard3(root, `
if (args.join(' ') === 'run test:e2e:probes') {
  mkdirSync('test-results/trace', { recursive: true })
  writeFileSync('test-results/unit-tests.xml', '<testsuites name="probes"/>')
  require('fs').symlinkSync(${JSON.stringify(import.meta.path)}, 'test-results/escape')
  require('fs').symlinkSync(${JSON.stringify(import.meta.dir)}, 'test-results/trace/escape-dir')
  process.exit(1)
}
`)
    expect(result.status).toBe(1)
    const kept = join(root, 'stage-evidence/probes/test-results')
    expect(readdirSync(kept).sort()).toEqual(['trace', basename(junitReport)])
    expect(readdirSync(join(kept, 'trace'))).toEqual([])
    expect(lstatSync(join(kept, basename(junitReport))).isSymbolicLink()).toBe(false)
    expect(stages(root).stages[2].retained).toEqual(['test-results'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a step whose child never launches is recorded, not thrown past the manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'browser-stage-'))
  try {
    // No pnpm on PATH at all, so spawnSync answers with an error and no
    // status. Node is named by its own path, because PATH cannot find it here.
    const empty = join(root, 'empty')
    mkdirSync(empty)
    const result = spawnSync(Bun.which('node')!, [join(import.meta.dir, 'run-pr-e2e.mjs'), '3'], {
      cwd: root, encoding: 'utf8', env: { PATH: empty, COMMAND_LOG: join(root, 'commands') }
    })
    expect(result.status).toBe(1)
    const manifest = stages(root)
    expect(manifest).toMatchObject({ shard: '3', exit: 1, complete: true })
    // Nothing after a child that cannot start. The cause is Node's own errno
    // name and nothing else: no argv, no environment, no error prose anywhere.
    expect(manifest.stages).toEqual([
      { stage: 'install', status: 1, minutes: manifest.stages[0].minutes, reason: 'launch-failed', errno: 'ENOENT' }
    ])
    // The errno names the cause on stdout; the launch error's own text, which
    // carries the command it tried, is never emitted.
    expect(result.stdout).toContain('launch failed (ENOENT)')
    expect(result.stderr).toBe('')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the retained directories cover every output the steps this runner runs declare', () => {
  // Derived from the configs and the bunfig, never restated: a config that
  // starts writing somewhere else must be retained too, or its failures go
  // back to being erased by the next step.
  const runner = readFileSync(join(import.meta.dir, 'run-pr-e2e.mjs'), 'utf8')
  const retained = JSON.parse(/^const reportDirs = (\[[^\]]+\])$/m.exec(runner)![1]) as ReadonlyArray<string>
  const app = join(import.meta.dir, '..')
  const declared = ['playwright.config.ts', 'playwright.showcase.config.ts', 'playwright.site.config.ts', 'playwright.graph.config.ts']
    // Playwright's own default when a config declares no outputDir.
    .map(config => /^\s*outputDir: [`"]([^`"$]+)/m.exec(readFileSync(join(app, config), 'utf8'))?.[1] ?? 'test-results/')
  // The four Bun preflight steps write the report their bunfig declares.
  declared.push(junitReport)
  expect(declared).toEqual(['test-results/', 'test-results-showcase/', 'test-results/', 'test-results/', `test-results/${basename(junitReport)}`])
  for (const path of declared) expect(retained).toContain(path.split('/')[0])
})

test('a linked evidence root is refused, so no copy lands wherever it points', () => {
  const root = mkdtempSync(join(tmpdir(), 'browser-stage-'))
  try {
    // Every copy below the root would otherwise follow it out of the package.
    const elsewhere = join(root, 'elsewhere')
    mkdirSync(elsewhere)
    symlinkSync(elsewhere, join(root, 'stage-evidence'))
    const result = runShard3(root, `
if (args.join(' ') === 'run test:e2e:probes') {
  mkdirSync('test-results', { recursive: true })
  writeFileSync(${JSON.stringify(junitReport)}, '<testsuites name="probes"/>')
  process.exit(1)
}
`)
    expect(result.status).toBe(1)
    expect(readdirSync(elsewhere)).toEqual([])
    expect(result.stdout).toContain('stage-evidence/stages.json: write-refused')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
