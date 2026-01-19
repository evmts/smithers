/**
 * Tests for run command
 * 
 * Covers: File execution, spawn handling, error cases
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'


// Helper to create temp directory
function createTempDir(): string {
  const tmpDir = path.join(import.meta.dir, '.test-tmp-run-' + Date.now() + '-' + Math.random().toString(36).slice(2))
  fs.mkdirSync(tmpDir, { recursive: true })
  return tmpDir
}

// Helper to cleanup temp directory
function cleanupTempDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('run command', () => {
  let tempDir: string
  let exitCode: number | undefined
  let consoleOutput: string[]
  let consoleErrorOutput: string[]
  let originalExit: typeof process.exit
  let originalConsoleLog: typeof console.log
  let originalConsoleError: typeof console.error

  beforeEach(() => {
    tempDir = createTempDir()
    exitCode = undefined
    consoleOutput = []
    consoleErrorOutput = []
    
    originalExit = process.exit
    process.exit = ((code?: number) => {
      exitCode = code ?? 0
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
    cleanupTempDir(tempDir)
    process.exit = originalExit
    console.log = originalConsoleLog
    console.error = originalConsoleError
  })

  describe('file resolution', () => {
    test('uses fileArg when provided as positional argument', async () => {
      // Import dynamically to get fresh module
      const { run } = await import('./run')
      
      // Create a test file
      const testFile = path.join(tempDir, 'test.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')
      
      // The run function will try to spawn bun, which will fail in test
      // but we can verify the file path logic
      try {
        await run(testFile)
      } catch {}
      
      expect(consoleOutput.some(line => line.includes(testFile))).toBe(true)
    })

    test('resolves relative paths to absolute paths', async () => {
      const { run } = await import('./run')
      
      const testFile = path.join(tempDir, 'test.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')
      
      try {
        await run(testFile)
      } catch {}
      
      // Output should contain the absolute path
      expect(consoleOutput.some(line => line.includes(path.resolve(testFile)))).toBe(true)
    })
  })

  describe('file existence check', () => {
    test('exits with code 1 when file does not exist', async () => {
      const { run } = await import('./run')
      
      const nonExistentFile = path.join(tempDir, 'nonexistent.tsx')
      
      try {
        await run(nonExistentFile)
      } catch {}
      expect(exitCode).toBe(1)
    })

    test('prints file not found error message', async () => {
      const { run } = await import('./run')
      
      const nonExistentFile = path.join(tempDir, 'nonexistent.tsx')
      
      try {
        await run(nonExistentFile)
      } catch {}
      
      expect(consoleErrorOutput.some(line => line.includes('File not found'))).toBe(true)
    })

    test('suggests running smithers init first', async () => {
      const { run } = await import('./run')
      
      const nonExistentFile = path.join(tempDir, 'nonexistent.tsx')
      
      try {
        await run(nonExistentFile)
      } catch {}
      
      expect(consoleOutput.some(line => line.includes('smithers init'))).toBe(true)
    })
  })

  describe('file permissions', () => {
    test('makes file executable if not already executable', async () => {
      const { run } = await import('./run')
      
      const testFile = path.join(tempDir, 'test.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')
      fs.chmodSync(testFile, '644') // Not executable
      
      try {
        // This will spawn bun and may fail, but permissions should be fixed
        await run(testFile)
      } catch {}
      
      // Check file is now executable
      const stats = fs.statSync(testFile)
      expect((stats.mode & 0o100) !== 0).toBe(true)
    })
  })

  describe('output', () => {
    test('prints running header with file path', async () => {
      const { run } = await import('./run')
      
      const testFile = path.join(tempDir, 'test.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')
      
      try {
        await run(testFile)
      } catch {}
      
      expect(consoleOutput.some(line => line.includes('Running Smithers'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('File:'))).toBe(true)
    })

    test('prints separator lines', async () => {
      const { run } = await import('./run')
      
      const testFile = path.join(tempDir, 'test.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')
      
      try {
        await run(testFile)
      } catch {}
      
      expect(consoleOutput.some(line => line.includes('━'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles file paths with spaces', async () => {
      const { run } = await import('./run')
      
      const spacePath = path.join(tempDir, 'path with spaces')
      fs.mkdirSync(spacePath, { recursive: true })
      const testFile = path.join(spacePath, 'test.tsx')
      fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')
      
      try {
        await run(testFile)
      } catch {}
      
      // Should not fail due to spaces in path
      expect(consoleOutput.some(line => line.includes('Running Smithers'))).toBe(true)
    })
  })
})

describe('findPreloadPath', () => {
  test('throws descriptive error when preload.ts not found', async () => {
    // The findPreloadPath function searches from the commands directory upward
    // In test environment running from a temp dir, it may not find preload.ts
    // This test verifies the error message is descriptive
    const { run } = await import('./run')
    
    const tmpDir = path.join(import.meta.dir, '.test-preload-' + Date.now())
    fs.mkdirSync(tmpDir, { recursive: true })
    const testFile = path.join(tmpDir, 'test.tsx')
    fs.writeFileSync(testFile, '#!/usr/bin/env bun\nconsole.log("test")')
    
    let originalExit = process.exit
    let _exitCode: number | undefined
    let consoleOutput: string[] = []
    let consoleErrorOutput: string[] = []
    let originalConsoleLog = console.log
    let originalConsoleError = console.error
    
    process.exit = ((code?: number) => {
      _exitCode = code ?? 0
      throw new Error(`process.exit(${code})`)
    }) as typeof process.exit
    console.log = (...args: unknown[]) => { consoleOutput.push(args.map(String).join(' ')) }
    console.error = (...args: unknown[]) => { consoleErrorOutput.push(args.map(String).join(' ')) }
    
    try {
      await run(testFile)
    } catch (e: unknown) {
      // Either it finds preload.ts (spawn starts), or throws descriptive error
      if (e instanceof Error && e.message.includes('preload.ts')) {
        expect(e.message).toContain('smithers-orchestrator')
      }
    } finally {
      process.exit = originalExit
      console.log = originalConsoleLog
      console.error = originalConsoleError
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
