/**
 * CLI E2E tests for bin/cli.ts
 * Tests actual CLI execution via subprocess with environment isolation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const pkgPath = resolve(process.cwd(), 'package.json')

describe('CLI E2E execution', () => {
  let tempDir: string
  let cliPath: string
  let expectedVersion: string
  const timeoutMs = 5000

  const buildEnv = () => ({
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
    HOME: tempDir,
    XDG_CONFIG_HOME: tempDir,
    XDG_DATA_HOME: tempDir,
    XDG_STATE_HOME: tempDir,
    CI: '1',
  })

  const runCli = async (args: string[]) => {
    const proc = Bun.spawn(['bun', cliPath, ...args], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: buildEnv(),
    })

    const timeoutId = setTimeout(() => proc.kill(), timeoutMs)
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    clearTimeout(timeoutId)
    return { stdout, stderr, exitCode }
  }

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'smithers-cli-test-'))
    cliPath = resolve(process.cwd(), 'bin/cli.ts')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
    expectedVersion = pkg.version
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should show help with --help flag', async () => {
    const { stdout, stderr, exitCode } = await runCli(['--help'])

    expect(exitCode).toBe(0)
    expect(stderr.trim()).toBe('')
    expect(stdout).toContain('smithers')
    expect(stdout).toContain('init')
    expect(stdout).toContain('run')
    expect(stdout).toContain('hook-trigger')
  })

  it('should show version with --version flag', async () => {
    const { stdout, stderr, exitCode } = await runCli(['--version'])

    expect(exitCode).toBe(0)
    expect(stderr.trim()).toBe('')
    expect(stdout.trim()).toBe(expectedVersion)
  })

  it('should show init command help', async () => {
    const { stdout, stderr, exitCode } = await runCli(['init', '--help'])

    expect(exitCode).toBe(0)
    expect(stderr.trim()).toBe('')
    expect(stdout).toContain('Create a new Smithers orchestration')
    expect(stdout).toContain('-d, --dir')
  })

  it('should show hook-trigger command help', async () => {
    const { stdout, stderr, exitCode } = await runCli(['hook-trigger', '--help'])

    expect(exitCode).toBe(0)
    expect(stderr.trim()).toBe('')
    expect(stdout).toContain('Trigger a hook event')
    expect(stdout).toContain('--path')
  })

  it('should error on invalid hook type', async () => {
    const { stderr, exitCode } = await runCli(['hook-trigger', 'invalid-type', '{}'])

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Invalid hook type')
    expect(stderr).toContain('Valid types:')
  })

  it('should error on invalid JSON data', async () => {
    const { stderr, exitCode } = await runCli(['hook-trigger', 'post-commit', '{invalid}'])

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Invalid JSON data')
  })

  it('should run init command in temp directory', async () => {
    const { stderr, exitCode } = await runCli(['init', '--dir', tempDir])

    expect(exitCode).toBe(0)
    if (stderr.trim() !== '') {
      expect(stderr).toContain('No package.json found')
      expect(stderr).toContain('smithers-orchestrator install')
    }
    const smithersDir = join(tempDir, '.smithers')
    const exists = await Bun.file(join(smithersDir, 'main.tsx')).exists()
    expect(exists).toBe(true)
  })
})
