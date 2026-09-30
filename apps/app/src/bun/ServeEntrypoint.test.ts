import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'bun:test'
// Erased by Bun, but keeps the isolated fixture inside the app's typecheck.
import type {} from '../../e2e/fixtures/unit-entrypoints/Serve.child.test'

const cases = [['signal'], ['backend-failure'], ['stop-error'], ['missing-origin'], ['plue-origin']] as const
const child = fileURLToPath(new URL('../../e2e/fixtures/unit-entrypoints/Serve.child.test.ts', import.meta.url))

test.each(cases)('serve entrypoint %s lifecycle runs in an isolated process', (scenario) => {
  const result = spawnSync(process.execPath, ['test', child], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: {
      ...process.env,
      SMITHERS_SERVE_SCENARIO: scenario,
      SMITHERS_API_ORIGIN: scenario === 'plue-origin' ? 'https://plue.example' : '',
      SMITHERS_LOCAL_STATE_DIR: scenario === 'plue-origin' ? '/configured' : ''
    },
    encoding: 'utf8',
    timeout: 10_000
  })
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  expect(result.stderr).toContain('1 pass')
  expect(result.stderr).toContain('0 fail')
})

test('the real serve module reaches selected-backend readiness without loading the retired test host', async () => {
  const origin = 'http://127.0.0.1:49191'
  const serve = fileURLToPath(new URL('./serve.ts', import.meta.url))
  const childProcess = Bun.spawn([Bun.which('bun')!, serve], {
    env: { ...process.env, SMITHERS_BACKEND_MODE: 'plue', SMITHERS_API_ORIGIN: origin, SMITHERS_LOCAL_STATE_DIR: '/private/tmp/smithers-serve-import-smoke' },
    stdin: 'ignore', stdout: 'pipe', stderr: 'pipe'
  })
  try {
    const reader = childProcess.stdout.getReader()
    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(new TextDecoder().decode(first.value)).toBe(`SMITHERS_LOCAL_ORIGIN=${origin}\n`)
    reader.releaseLock()
    childProcess.kill('SIGTERM')
    expect(await childProcess.exited).toBe(0)
    expect(await new Response(childProcess.stderr).text()).toBe('')
  } finally {
    if (childProcess.exitCode === null) childProcess.kill('SIGKILL')
    await childProcess.exited
  }
}, 10_000)
