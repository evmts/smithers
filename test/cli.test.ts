/**
 * CLI E2E tests for bin/cli.ts
 * Tests actual CLI execution via subprocess with environment isolation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const pkgPath = resolve(process.cwd(), 'package.json')

describe('CLI E2E execution', () => {
  let tempDir: string
  let cliPath: string
  let expectedVersion: string

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
    const proc = Bun.spawn(['bun', cliPath, '--help'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout).toContain('smithers')
    expect(stdout).toContain('init')
    expect(stdout).toContain('run')
    expect(stdout).toContain('hook-trigger')
  })

  it('should show version with --version flag', async () => {
    const proc = Bun.spawn(['bun', cliPath, '--version'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout.trim()).toBe(expectedVersion)
  })

  it('should show init command help', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'init', '--help'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout).toContain('Create a new Smithers orchestration')
    expect(stdout).toContain('-d, --dir')
  })

  it('should show hook-trigger command help', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'hook-trigger', '--help'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout).toContain('Trigger a hook event')
    expect(stdout).toContain('--path')
  })

  it('should error on invalid hook type', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'hook-trigger', 'invalid-type', '{}'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Invalid hook type')
    expect(stderr).toContain('Valid types:')
  })

  it('should error on invalid JSON data', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'hook-trigger', 'post-commit', '{invalid}'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Invalid JSON data')
  })

  it('should run init command in temp directory', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'init', '--dir', tempDir], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    await proc.exited

    const smithersDir = join(tempDir, '.smithers')
    const exists = await Bun.file(join(smithersDir, 'main.tsx')).exists()
    expect(exists).toBe(true)
  })
})
