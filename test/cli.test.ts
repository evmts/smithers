/**
 * CLI tests for bin/cli.ts
 * Tests command parsing, options, and basic execution flows
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Command } from 'commander'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('CLI Command Parsing', () => {
  let program: Command
  let exitSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    program = new Command()
    program.exitOverride()
    program.configureOutput({
      writeErr: () => {},
      writeOut: () => {},
    })
    
    program
      .name('smithers')
      .description('CLI tool for multi-agent AI orchestration with Smithers framework')
      .version('0.1.0')

    program
      .command('init')
      .description('Create a new Smithers orchestration in .smithers/')
      .option('-d, --dir <directory>', 'Directory to create .smithers in', process.cwd())
      .action(() => {})

    program
      .command('run [file]')
      .description('Run a Smithers orchestration file')
      .action(() => {})

    program
      .command('monitor [file]')
      .description('Run with LLM-friendly monitoring')
      .option('-f, --file <file>', 'Orchestration file to monitor', '.smithers/main.tsx')
      .option('--no-summary', 'Disable Haiku summarization')
      .action(() => {})

    program
      .command('db [subcommand]')
      .description('Inspect and manage the SQLite database')
      .option('--path <path>', 'Database path', '.smithers/data/smithers.db')
      .action(() => {})

    program
      .command('tui')
      .description('Launch observability TUI dashboard')
      .option('-p, --path <path>', 'Database path', '.smithers/data')
      .action(() => {})

    const VALID_HOOK_TYPES = ['pre-commit', 'post-commit', 'pre-push', 'post-merge'] as const
    program
      .command('hook-trigger <type> <data>')
      .description('Trigger a hook event')
      .option('--path <path>', 'Database path', '.smithers/data/smithers.db')
      .action(() => {})

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })

  describe('program metadata', () => {
    it('should have correct name', () => {
      expect(program.name()).toBe('smithers')
    })

    it('should have correct version', () => {
      expect(program.version()).toBe('0.1.0')
    })
  })

  describe('init command', () => {
    it('should parse init command', () => {
      program.parse(['node', 'cli', 'init'])
      expect(program.args).toContain('init')
    })

    it('should accept --dir option', () => {
      const initCmd = program.commands.find(c => c.name() === 'init')
      expect(initCmd).toBeDefined()
      
      const dirOption = initCmd?.options.find(o => o.long === '--dir')
      expect(dirOption).toBeDefined()
      expect(dirOption?.defaultValue).toBe(process.cwd())
    })
  })

  describe('run command', () => {
    it('should parse run command without file', () => {
      program.parse(['node', 'cli', 'run'])
      expect(program.args).toContain('run')
    })

    it('should parse run command with file', () => {
      program.parse(['node', 'cli', 'run', 'custom.tsx'])
      expect(program.args).toContain('run')
    })
  })

  describe('monitor command', () => {
    it('should parse monitor command', () => {
      program.parse(['node', 'cli', 'monitor'])
      expect(program.args).toContain('monitor')
    })

    it('should have --file option with default', () => {
      const monitorCmd = program.commands.find(c => c.name() === 'monitor')
      const fileOption = monitorCmd?.options.find(o => o.long === '--file')
      expect(fileOption?.defaultValue).toBe('.smithers/main.tsx')
    })

    it('should have --no-summary option', () => {
      const monitorCmd = program.commands.find(c => c.name() === 'monitor')
      const summaryOption = monitorCmd?.options.find(o => o.long === '--no-summary')
      expect(summaryOption).toBeDefined()
    })
  })

  describe('db command', () => {
    it('should parse db command', () => {
      program.parse(['node', 'cli', 'db'])
      expect(program.args).toContain('db')
    })

    it('should have --path option with default', () => {
      const dbCmd = program.commands.find(c => c.name() === 'db')
      const pathOption = dbCmd?.options.find(o => o.long === '--path')
      expect(pathOption?.defaultValue).toBe('.smithers/data/smithers.db')
    })
  })

  describe('tui command', () => {
    it('should parse tui command', () => {
      program.parse(['node', 'cli', 'tui'])
      expect(program.args).toContain('tui')
    })

    it('should have --path option with default', () => {
      const tuiCmd = program.commands.find(c => c.name() === 'tui')
      const pathOption = tuiCmd?.options.find(o => o.long === '--path')
      expect(pathOption?.defaultValue).toBe('.smithers/data')
    })
  })

  describe('hook-trigger command', () => {
    it('should parse hook-trigger command with args', () => {
      program.parse(['node', 'cli', 'hook-trigger', 'post-commit', '{"sha":"abc123"}'])
      expect(program.args).toContain('hook-trigger')
    })

    it('should have --path option with default', () => {
      const hookCmd = program.commands.find(c => c.name() === 'hook-trigger')
      const pathOption = hookCmd?.options.find(o => o.long === '--path')
      expect(pathOption?.defaultValue).toBe('.smithers/data/smithers.db')
    })
  })

  describe('invalid commands', () => {
    it('should throw on unknown command', () => {
      expect(() => {
        program.parse(['node', 'cli', 'unknown-command'])
      }).toThrow()
    })
  })
})

describe('CLI hook-trigger validation', () => {
  const VALID_HOOK_TYPES = ['pre-commit', 'post-commit', 'pre-push', 'post-merge'] as const

  it('should accept valid hook types', () => {
    for (const hookType of VALID_HOOK_TYPES) {
      expect(VALID_HOOK_TYPES.includes(hookType)).toBe(true)
    }
  })

  it('should reject invalid hook types', () => {
    const invalidTypes = ['invalid', 'pre-merge', 'post-push', 'commit']
    for (const hookType of invalidTypes) {
      expect(VALID_HOOK_TYPES.includes(hookType as typeof VALID_HOOK_TYPES[number])).toBe(false)
    }
  })

  it('should parse valid JSON data', () => {
    const validData = '{"sha":"abc123","branch":"main"}'
    expect(() => JSON.parse(validData)).not.toThrow()
    expect(JSON.parse(validData)).toEqual({ sha: 'abc123', branch: 'main' })
  })

  it('should reject invalid JSON data', () => {
    const invalidData = '{invalid json}'
    expect(() => JSON.parse(invalidData)).toThrow()
  })
})

describe('CLI E2E execution', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'smithers-cli-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should show help with --help flag', async () => {
    const proc = Bun.spawn(['bun', 'bin/cli.ts', '--help'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout).toContain('smithers')
    expect(stdout).toContain('CLI tool for multi-agent AI orchestration')
    expect(stdout).toContain('init')
    expect(stdout).toContain('run')
    expect(stdout).toContain('monitor')
    expect(stdout).toContain('db')
    expect(stdout).toContain('tui')
    expect(stdout).toContain('hook-trigger')
  })

  it('should show version with --version flag', async () => {
    const proc = Bun.spawn(['bun', 'bin/cli.ts', '--version'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout.trim()).toBe('0.1.0')
  })

  it('should show init command help', async () => {
    const proc = Bun.spawn(['bun', 'bin/cli.ts', 'init', '--help'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout).toContain('Create a new Smithers orchestration')
    expect(stdout).toContain('-d, --dir')
  })

  it('should show hook-trigger command help', async () => {
    const proc = Bun.spawn(['bun', 'bin/cli.ts', 'hook-trigger', '--help'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    expect(stdout).toContain('Trigger a hook event')
    expect(stdout).toContain('--path')
  })

  it('should error on invalid hook type', async () => {
    const proc = Bun.spawn(['bun', 'bin/cli.ts', 'hook-trigger', 'invalid-type', '{}'], {
      cwd: process.cwd(),
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
    const proc = Bun.spawn(['bun', 'bin/cli.ts', 'hook-trigger', 'post-commit', '{invalid}'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Invalid JSON data')
  })

  it('should run init command in temp directory', async () => {
    const proc = Bun.spawn(['bun', 'bin/cli.ts', 'init', '--dir', tempDir], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    await proc.exited
    
    const smithersDir = join(tempDir, '.smithers')
    const exists = await Bun.file(join(smithersDir, 'main.tsx')).exists()
    expect(exists).toBe(true)
  })
})
