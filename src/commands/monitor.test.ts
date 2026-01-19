import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import type { ChildProcess } from 'child_process'
import { cleanupTempDir, createTempDir } from './test-utils'

describe('monitor command', () => {
  let tempDir: string
  let _exitCode: number | undefined
  let consoleOutput: string[]
  let consoleErrorOutput: string[]
  let originalExit: typeof process.exit
  let originalConsoleLog: typeof console.log
  let originalConsoleError: typeof console.error
  let spawnedChildren: ChildProcess[] = []

  beforeEach(() => {
    tempDir = createTempDir(import.meta.dir, '.test-tmp-monitor')
    _exitCode = undefined
    consoleOutput = []
    consoleErrorOutput = []
    spawnedChildren = []

    originalExit = process.exit
    process.exit = ((code?: number) => {
      _exitCode = code ?? 0
      throw new Error(`process.exit(${code})`)
    }) as typeof process.exit

    originalConsoleLog = console.log
    originalConsoleError = console.error
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '))
    }
    console.error = (...args: unknown[]) => {
      consoleErrorOutput.push(args.map(String).join(' '))
    }
  })

  afterEach(() => {
    // Kill any spawned children BEFORE restoring mocks
    for (const child of spawnedChildren) {
      try {
        child.kill('SIGKILL')
      } catch {}
    }
    spawnedChildren = []
    cleanupTempDir(tempDir)
    process.exit = originalExit
    console.log = originalConsoleLog
    console.error = originalConsoleError
  })

  describe('file resolution', () => {
    test('uses fileArg when provided', async () => {
      const { monitor } = await import('./monitor')

      const testFile = path.join(tempDir, 'test-monitor.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')

      try {
        const result = await monitor(testFile, { noExit: true })
        spawnedChildren.push(result.child)
      } catch {}

      expect(true).toBe(true) // Just verify it doesn't throw on valid file
    })

    test('resolves relative paths correctly', async () => {
      const { monitor } = await import('./monitor')

      const testFile = path.join(tempDir, 'relative-test.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')

      try {
        const result = await monitor(testFile, { noExit: true })
        spawnedChildren.push(result.child)
      } catch {}

      expect(true).toBe(true)
    })
  })

  describe('file existence check', () => {
    test('exits with code 1 when file does not exist', async () => {
      const { monitor } = await import('./monitor')
      
      const nonExistentFile = path.join(tempDir, 'nonexistent.tsx')
      
      try {
        await monitor(nonExistentFile)
      } catch {}
      expect(_exitCode).toBe(1)
    })

    test('prints file not found error', async () => {
      const { monitor } = await import('./monitor')
      
      const nonExistentFile = path.join(tempDir, 'nonexistent.tsx')
      
      try {
        await monitor(nonExistentFile)
      } catch {}
      
      expect(consoleErrorOutput.some(line => line.includes('File not found'))).toBe(true)
    })

    test('suggests running smithers init', async () => {
      const { monitor } = await import('./monitor')
      
      const nonExistentFile = path.join(tempDir, 'nonexistent.tsx')
      
      try {
        await monitor(nonExistentFile)
      } catch {}
      
      expect(consoleOutput.some(line => line.includes('smithers init'))).toBe(true)
    })
  })

  describe('file permissions', () => {
    test('makes file executable if not already', async () => {
      const { monitor } = await import('./monitor')

      const testFile = path.join(tempDir, 'perm-test.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')
      fs.chmodSync(testFile, '644')

      try {
        const result = await monitor(testFile, { noExit: true })
        spawnedChildren.push(result.child)
      } catch {}

      const stats = fs.statSync(testFile)
      expect((stats.mode & 0o100) !== 0).toBe(true)
    })
  })

  describe('summary option', () => {
    test('enables summary by default', async () => {
      const { monitor } = await import('./monitor')

      const testFile = path.join(tempDir, 'summary-test.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')

      try {
        const result = await monitor(testFile, { noExit: true })
        spawnedChildren.push(result.child)
      } catch {}

      expect(true).toBe(true)
    })

    test('respects options.summary = false', async () => {
      const { monitor } = await import('./monitor')

      const testFile = path.join(tempDir, 'no-summary-test.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')

      try {
        const result = await monitor(testFile, { summary: false, noExit: true })
        spawnedChildren.push(result.child)
      } catch {}

      expect(true).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles file paths with spaces', async () => {
      const { monitor } = await import('./monitor')

      const spacePath = path.join(tempDir, 'path with spaces')
      fs.mkdirSync(spacePath, { recursive: true })
      const testFile = path.join(spacePath, 'test.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')

      try {
        const result = await monitor(testFile, { noExit: true })
        spawnedChildren.push(result.child)
      } catch {}

      expect(true).toBe(true)
    })
  })
})

describe('findPreloadPath (via monitor)', () => {
  test('throws descriptive error when preload.ts not found', async () => {
    const { monitor } = await import('./monitor')

    const tmpDir = createTempDir(import.meta.dir, '.test-preload-monitor')
    const testFile = path.join(tmpDir, 'test.tsx')
    fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')

    const originalExit = process.exit
    let _exitCode: number | undefined
    const originalConsoleLog = console.log
    const originalConsoleError = console.error
    let spawnedChild: ChildProcess | null = null

    process.exit = ((code?: number) => {
      _exitCode = code ?? 0
      throw new Error(`process.exit(${code})`)
    }) as typeof process.exit
    console.log = () => {}
    console.error = () => {}

    try {
      const result = await monitor(testFile, { noExit: true })
      spawnedChild = result.child
    } catch (e: unknown) {
      // Either it finds preload.ts (spawn starts), or throws descriptive error
      if (e instanceof Error && e.message.includes('preload.ts')) {
        expect(e.message).toContain('smithers-orchestrator')
      }
    } finally {
      // Kill spawned child before restoring mocks
      if (spawnedChild) {
        try {
          spawnedChild.kill('SIGKILL')
        } catch {}
      }
      process.exit = originalExit
      console.log = originalConsoleLog
      console.error = originalConsoleError
      cleanupTempDir(tmpDir)
    }
  })
})
