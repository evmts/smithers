/** Regression fixtures for the shared pre-push gate. @since 0.1.0 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
const script = resolve(import.meta.dirname, 'lane-gates.sh')
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'lane-gates-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
for (const [label, output, baseline, allowed] of [
  ['new node failure', '✖ some test (1.2ms)', 'flows: tool-failure', false],
  ['known node failure', '✖ some test (1.2ms)', 'some test', true],
  ['new TAP failure', 'not ok 1 - some test', 'flows: tool-failure', false],
  ['known TAP failure', 'not ok 1 - some test', 'some test', true],
  ['tool failure', 'Error: compiler unavailable', 'flows: tool-failure', true],
  ['names and tool error', '✖ some test\nError: compiler unavailable', 'flows: tool-failure', false],
  ['passed names and tool error', '✔ some test\nError: compiler unavailable', 'flows: tool-failure', false],
  ['unnamed failures', '# tests 3\n# fail 1', 'flows: tool-failure', false],
  ['Go', '    --- FAIL: TestX/sub (0.01s)', 'TestX/sub', true],
  ['bun', '(fail) some test [1.20ms]', 'some test', true],
  ['vitest FAIL', ' FAIL  some test', 'some test', true],
  ['vitest cross', ' × some test', 'some test', true],
  ['vitest timed cross', ' × some test 124ms', 'some test', true],
  ['vitest decimal duration', ' × some test 1.25s', 'some test', true],
  ['vitest new timed failure', ' × new test 124ms', 'some test', false],
  ['timed baseline milliseconds', ' × some test 124ms', 'some test 5312ms', true],
  ['timed baseline seconds', ' × some test 1.25s', 'some test 2.75s', true],
  ['timed baseline parentheses', '✖ some test (1.2ms)', 'some test (4ms)', true],
  ['timed baseline does not admit new names', ' × other test 124ms', 'some test 5312ms', false],
  ['timed baseline mixed names', ' × first test 1ms\n × second test 2ms', 'first test 13ms\nsecond test 2.5s', true],
  ['duration inside a name stays significant', ' × takes 10ms for input 1ms', 'takes 11ms for input 13ms', false],
  ['ANSI node', '\x1b[31m✖ some test (1ms)\x1b[0m', 'some test', true],
  ['missing tool baseline', 'Error: compiler unavailable', 'other test', false]
]) test(label, t => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'output'), output)
  writeFileSync(join(dir, 'baseline'), baseline + '\n')
  const result = spawnSync('bash', ['-c', `source "$1"
mode=gate; log="$2/log"; baseline="$2/baseline"; newreds=()
check flows 'cat "$FIXTURE/output"; exit 1'
[ \${#newreds[@]} -eq 0 ]`, '_', script, dir], {
    encoding: 'utf8', env: { ...process.env, FIXTURE: dir }
  })
  assert.equal(result.status, allowed ? 0 : 1, result.stderr)
  assert.equal(readFileSync(join(dir, 'baseline'), 'utf8'), baseline + '\n')
})
for (const behavior of ['drop', 'keep', 'delete', 'allow-delete', 'wrong-allowance']) test(`integration ${behavior}`, t => {
  const dir = fixture(t)
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  git('init', '-q'); git('config', 'user.email', 'fixture@example.com'); git('config', 'user.name', 'Fixture')
  writeFileSync(join(dir, 'file.txt'), 'base\n'); git('add', '.'); git('commit', '-qm', 'base')
  const base = git('rev-parse', 'HEAD')
  writeFileSync(join(dir, 'file.txt'), 'base\nmain added\n'); git('commit', '-qam', 'main')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD'); git('checkout', '-q', '--detach', base)
  if (behavior.includes('delete') || behavior === 'wrong-allowance') git('rm', '-q', 'file.txt')
  else writeFileSync(join(dir, 'file.txt'), behavior === 'keep' ? 'base\nmain added\nlane\n' : 'base\nlane\n')
  git('add', '.'); git('commit', '-qm', 'lane')
  const args = ['--integration', base]
  if (behavior === 'allow-delete') args.push('--allow-deleted', '*.txt')
  if (behavior === 'wrong-allowance') args.push('--allow-deleted', '*.tsx')
  const result = spawnSync('bash', [script, ...args], { cwd: dir, encoding: 'utf8' })
  assert.equal(result.status, ['keep', 'allow-delete'].includes(behavior) ? 0 : 1, result.stderr)
  if (result.status === 1) assert.match(result.stdout, /file\.txt\t1/)
})

for (const reporter of ['spec', 'tap']) test(`real node:test ${reporter}`, t => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'red.test.mjs'), "import {test} from 'node:test'; test('some test', () => { throw new Error('red'); });")
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT
  const run = spawnSync(process.execPath, ['--test', `--test-reporter=${reporter}`, join(dir, 'red.test.mjs')], { encoding: 'utf8', env })
  assert.equal(run.status, 1)
  const parsed = spawnSync('bash', ['-c', 'source "$1"; extract', '_', script], { input: run.stdout, encoding: 'utf8' })
  assert.match(parsed.stdout, /^some test$/m)
})

test('baseline writes require the baseline-run marker', () => {
  assert.match(readFileSync(script, 'utf8'), /\[ \$mode = baseline \] && \[ "\$\{LANE:-\}" != fr-baseline-main \]/)
})

test('Go selection includes transitive importers and prints the selected list', t => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'go.mod'), 'module fixture.local/reverse\n\ngo 1.24\n')
  for (const [pkg, body] of Object.entries({a: 'const A = 1', b: 'import "fixture.local/reverse/a"\nconst B = a.A', c: 'const C = 1', d: 'import "fixture.local/reverse/b"\nconst D = b.B'})) {
    mkdirSync(join(dir, pkg))
    writeFileSync(join(dir, pkg, 'code.go'), `package ${pkg}\n${body}\n`)
  }
  for (const [touched, expected] of [
    ['./a', ['a', 'b', 'd']],
    ['./a ./c', ['a', 'b', 'c', 'd']],
    ['./a ./b ./c', ['a', 'b', 'c', 'd']]
  ]) {
    const result = spawnSync('bash', ['-c', 'source "$1"; log="$2/log"; : > "$log"; select_go_packages "$2" "$3" >/dev/null || exit; cat "$log"', '_', script, dir, touched], {encoding: 'utf8'})
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Selected Go packages/)
    assert.deepEqual(result.stdout.trim().split('\n').slice(1), expected.map(pkg => `fixture.local/reverse/${pkg}`))
  }
  const empty = spawnSync('bash', ['-c', 'source "$1"; log="$2/log"; select_go_packages "$2" fmt', '_', script, dir], {encoding: 'utf8'})
  assert.equal(empty.status, 1, empty.stderr)
  assert.match(empty.stderr, /No Go packages selected/)
})

test('unformatted Go in a touched package is refused even with a tool baseline', t => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'bad.go'), 'package bad\nfunc Bad( ){ }\n')
  const result = spawnSync('bash', ['-c', 'source "$1"; log="$2/log"; newreds=(); check_go_format "$2"; status=$?; cat "$log"; exit "$status"', '_', script, dir], {encoding: 'utf8'})
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /FAIL gofmt:/)
  assert.match(result.stdout, /bad\.go/)
})


// //.smithers/flows:moduleLint and //:jsdocTree share the root eslint.config.js. Lanes that
// landed without it reddened both release steps twice in one day (#3765).
test('a touched automation module or package source must pass the root ESLint config, and nothing else is linted', t => {
  const dir = fixture(t)
  const root = resolve(import.meta.dirname, '../../..')
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir')
  for (const file of ['eslint.config.js', 'eslint.jsdoc.js']) copyFileSync(join(root, file), join(dir, file))
  mkdirSync(join(dir, '.smithers/flows'), { recursive: true })
  writeFileSync(join(dir, '.smithers/flows/bad.mjs'), 'export const bad = 1;\n')
  writeFileSync(join(dir, '.smithers/flows/good.mjs'), 'export const good = 1\n')
  writeFileSync(join(dir, 'notes.mjs'), 'export const outside = 1;\n')
  const lint = (changed) => spawnSync('bash', ['-c', 'source "$1"; cd "$2"; log="$2/log"; : > "$log"; newreds=(); check_root_lint <<< "$3"; status=$?; cat "$log"; printf "newreds=%s\\n" "${newreds[*]:-}"; exit "$status"', '_', script, dir, changed], {encoding: 'utf8'})
  const refused = lint('.smithers/flows/bad.mjs\n.smithers/flows/good.mjs\n.smithers/flows/deleted.mjs')
  assert.equal(refused.status, 1, refused.stderr)
  assert.match(refused.stdout, /FAIL root-eslint/)
  assert.match(refused.stdout, /bad\.mjs[\s\S]*Extra semicolon/)
  assert.match(refused.stdout, /newreds=root-eslint/)
  const passed = lint('.smithers/flows/good.mjs\nnotes.mjs\nREADME.md')
  assert.equal(passed.status, 0, passed.stdout + passed.stderr)
  assert.match(passed.stdout, /PASS root-eslint \(1 files\)/)
  const none = lint('README.md\nnotes.mjs')
  assert.equal(none.status, 0, none.stdout + none.stderr)
  assert.doesNotMatch(none.stdout, /root-eslint/)
})

test('an unreadable baseline cannot admit a named failure', t => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'output'), ' × some test 1ms')
  const result = spawnSync('bash', ['-c', `source "$1"
mode=gate; log="$2/log"; baseline="$2/missing"; newreds=()
check flows 'cat "$FIXTURE/output"; exit 1'
[ \${#newreds[@]} -eq 0 ]`, '_', script, dir], {
    encoding: 'utf8', env: { ...process.env, FIXTURE: dir }
  })
  assert.equal(result.status, 1)
  assert.match(readFileSync(join(dir, 'log'), 'utf8'), /unreadable baseline/)
})

// File flows moved from flows/ to .smithers/flows/ (M-49); the gate kept sourcing
// flows/land/lane-prerequisites.sh and refused every lane before running a check.
test('a lane checkout reaches its prerequisites under .smithers/flows/land', t => {
  const dir = fixture(t)
  const repo = join(dir, 'repo'), home = join(dir, 'home'), bin = join(dir, 'bin')
  for (const path of [join(repo, '.smithers/flows/land'), join(home, 'lanes'), bin]) mkdirSync(path, { recursive: true })
  for (const file of ['lane-gates.sh', 'lane-prerequisites.sh']) copyFileSync(resolve(import.meta.dirname, file), join(repo, '.smithers/flows/land', file))
  writeFileSync(join(home, 'lanes/main-baseline-failures.txt'), 'some test\n')
  writeFileSync(join(bin, 'bun'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  // Cargo writes to the workspace target at the repository root, whatever its working directory.
  writeFileSync(join(bin, 'cargo'), `#!/bin/sh
mkdir -p "$FIXTURE_REPO/target/release"
printf '%s\\n' '#!/bin/sh' "echo '{\\"capabilities\\":[\\"trusted-process-binding/v1\\"]}'" > "$FIXTURE_REPO/target/release/smithers-jj-export"
chmod +x "$FIXTURE_REPO/target/release/smithers-jj-export"
`, { mode: 0o755 })
  for (const tool of ['psql', 'pg_isready']) writeFileSync(join(bin, tool), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'fixture@example.com'); git('config', 'user.name', 'Fixture')
  writeFileSync(join(repo, '.gitignore'), 'target/\n'); git('add', '.'); git('commit', '-qm', 'base')
  git('remote', 'add', 'origin', repo)
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, FIXTURE_REPO: repo, LANE: 'fixture' }
  delete env.CARGO_TARGET_DIR; delete env.SMITHERS_TEST_DATABASE_URL
  const result = spawnSync('bash', [join(repo, '.smithers/flows/land/lane-gates.sh')], { cwd: repo, encoding: 'utf8', env })
  assert.equal(result.status, 1, result.stderr)
  assert.doesNotMatch(result.stdout, /test prerequisites failed/, result.stderr)
  assert.match(result.stdout, /BLOCKED: no PostgreSQL/)
})

test('changed paths under .smithers/flows select its tests and the first journey; stale root flows/ paths select nothing', () => {
  const run = (fn, input) => spawnSync('bash', ['-c', `source "$1"; ${fn}`, '_', script], { input, encoding: 'utf8' })
  assert.equal(run('changed_test_dirs', '.smithers/flows/land/lane-gates.sh\npackages/rpc/src/a.ts\nflows/coding/x.ts\nREADME.md\n').stdout,
    '.smithers/flows\npackages/rpc\n')
  for (const [path, expected] of [
    ['.smithers/flows/coding/flow.ts', 0],
    ['.smithers/flows/todo/flow.ts', 0],
    ['packages/backend/internal/compose/a.go', 0],
    ['packages/backend/internal/services/a.go', 0],
    ['flows/coding/flow.ts', 1],
    ['.smithers/flows/land/lane-gates.sh', 1]
  ]) assert.equal(run('needs_j1', path + '\n').status, expected, path)
})

// J1's rehearsal confines processes with Linux bubblewrap (#3783). The gate assumed a Mac mini
// dylib and skipped elsewhere; on macOS the rehearsal must run in a Linux VM instead.
function j1Host(t, { os, bwrap, mode = 'gate' }) {
  const dir = fixture(t)
  const bin = join(dir, 'bin'), calls = join(dir, 'calls')
  mkdirSync(bin)
  writeFileSync(join(bin, 'uname'), `#!/bin/sh\necho ${os}\n`, { mode: 0o755 })
  symlinkSync(execFileSync('bash', ['-c', 'command -v tee'], { encoding: 'utf8' }).trim(), join(bin, 'tee'))
  if (bwrap) {
    writeFileSync(join(bin, 'bwrap'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    writeFileSync(join(bin, 'cargo'), `#!/bin/sh
echo "cargo $*" >> "$CALLS"; mkdir -p "$ROOT/target/release"; : > "$ROOT/target/release/libsmithers_ffi.so"
`, { mode: 0o755 })
    writeFileSync(join(bin, 'node'), '#!/bin/sh\necho "node $* ffi=$SMITHERS_FFI_LIBRARY_PATH continue=$J1_REHEARSAL_CONTINUE" >> "$CALLS"\n', { mode: 0o755 })
  }
  // PATH holds only the stubs, so a host bwrap cannot leak into the missing-bwrap case.
  const path = bwrap ? `${bin}:${process.env.PATH}` : bin
  const result = spawnSync('/bin/bash', ['-c', `source "$1"; root=$ROOT; cd "$root"; mode=${mode}; log="$ROOT/log"; : > "$log"; newreds=(); check_j1; status=$?
printf 'newreds=%s\\n' "\${newreds[*]:-}"; exit "$status"`, '_', script], {
    encoding: 'utf8', env: { HOME: dir, PATH: path, ROOT: dir, CALLS: calls }
  })
  const read = file => { try { return readFileSync(file, 'utf8') } catch { return '' } }
  return { ...result, log: read(join(dir, 'log')), calls: read(calls), dir }
}

test('J1 on macOS refuses the gate and names the Linux VM', t => {
  const result = j1Host(t, { os: 'Darwin', bwrap: false })
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /Linux bubblewrap \(#3783\).*Linux VM/)
  assert.match(result.stdout, /newreds=j1: needs a Linux host with bwrap/)
  assert.doesNotMatch(result.log, /SKIP j1/)
})

test('J1 on macOS records nothing in a baseline run', t => {
  const result = j1Host(t, { os: 'Darwin', bwrap: false, mode: 'baseline' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.log, /SKIP j1: the rehearsal needs Linux bubblewrap/)
  assert.match(result.stdout, /newreds=$/m)
})

test('J1 on Linux without bwrap refuses the gate', t => {
  const result = j1Host(t, { os: 'Linux', bwrap: false })
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /bwrap is missing/)
  assert.match(result.stdout, /newreds=j1: bwrap missing/)
})

test('J1 on Linux with bwrap builds the .so library and runs the rehearsal against it', t => {
  const result = j1Host(t, { os: 'Linux', bwrap: true })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.log, /PASS j1/)
  assert.equal(result.calls, `cargo build --locked --release -p smithers-ffi --lib
node packages/backend/run-journey-todo-label.mjs --j1 ffi=${join(result.dir, 'target/release/libsmithers_ffi.so')} continue=1
`)
})
