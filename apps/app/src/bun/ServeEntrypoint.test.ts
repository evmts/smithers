import { spawnSync } from '../../scripts/test-child'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'bun:test'
// Erased by Bun, but keeps the isolated fixture inside the app's typecheck.
import type {} from '../../e2e/fixtures/unit-entrypoints/Serve.child.test'
import type {} from '../../e2e/fixtures/unit-entrypoints/Gateway.child.test'

const cases = [['signal'], ['backend-failure'], ['stop-error'], ['hostile-origin']] as const
const child = fileURLToPath(new URL('../../e2e/fixtures/unit-entrypoints/Serve.child.test.ts', import.meta.url))
// The child loads an empty bunfig so it cannot overwrite the parent's JUnit report.
const childConfig = fileURLToPath(new URL('../../e2e/fixtures/unit-entrypoints/child.bunfig.toml', import.meta.url))

test.each(cases)('serve entrypoint %s lifecycle runs in an isolated process', (scenario) => {
  const result = spawnSync(process.execPath, ['test', '--config', childConfig, child], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: {
      ...process.env,
      SMITHERS_SERVE_SCENARIO: scenario,
      SMITHERS_API_ORIGIN: scenario === 'hostile-origin' ? 'https://plue.example' : '',
      SMITHERS_LOCAL_STATE_DIR: scenario === 'hostile-origin' ? '/configured' : ''
    },
    encoding: 'utf8',
    timeout: 10_000
  })
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  expect(result.stderr).toContain('1 pass')
  expect(result.stderr).toContain('0 fail')
})

const gatewayChild = fileURLToPath(new URL('../../e2e/fixtures/unit-entrypoints/Gateway.child.test.ts', import.meta.url))
test('serve gateway entrypoint runs in an isolated process', () => {
  const result = spawnSync(process.execPath, ['test', '--config', childConfig, gatewayChild], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)), env: process.env, encoding: 'utf8', timeout: 20_000
  })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toContain('1 pass')
  expect(result.stdout).not.toContain('server-only-credential')
  expect(result.stderr).not.toContain('server-only-credential')
})

test('gateway startup refuses real and symlinked token paths inside real dist', async () => {
  const { mkdtemp, mkdir, writeFile, symlink, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = await mkdtemp(join(tmpdir(), 'gateway-token-path-'))
  try {
    const dist = join(root, 'dist')
    await mkdir(dist)
    await writeFile(join(dist, 'token'), 'private', { mode: 0o600 })
    await symlink(dist, join(root, 'dist-alias'))
    await symlink(join(dist, 'token'), join(root, 'token-alias'))
    for (const [directory, token] of [[dist, join(dist, 'token')], [join(root, 'dist-alias'), join(root, 'token-alias')]]) {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./serve.ts', import.meta.url)), '--gateway', 'http://127.0.0.1:1', '--gateway-token-file', token!, '--dist', directory!], { env: process.env, encoding: 'utf8', timeout: 5000 })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('outside --dist')
      expect(result.stderr).not.toContain('private')
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
