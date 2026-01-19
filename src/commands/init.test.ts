/**
 * Tests for init command
 * 
 * Covers: Directory creation, template copying, error cases
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import { init } from './init'

// Helper to create temp directory
function createTempDir(): string {
  const tmpDir = path.join(import.meta.dir, '.test-tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2))
  fs.mkdirSync(tmpDir, { recursive: true })
  return tmpDir
}

// Helper to cleanup temp directory
function cleanupTempDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('init command', () => {
  let tempDir: string
  let _originalCwd: string
  let originalExit: typeof process.exit
  let _exitCode: number | undefined
  let consoleOutput: string[]
  let consoleErrorOutput: string[]
  let originalConsoleLog: typeof console.log
  let originalConsoleError: typeof console.error

  beforeEach(() => {
    tempDir = createTempDir()
    _originalCwd = process.cwd()
    _exitCode = undefined
    consoleOutput = []
    consoleErrorOutput = []
    
    // Mock process.exit
    originalExit = process.exit
    process.exit = ((code?: number) => {
      _exitCode = code ?? 0
      throw new Error(`process.exit(${code})`)
    }) as typeof process.exit
    
    // Capture console output
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

  describe('directory creation', () => {
    test('creates .smithers directory in specified --dir path', async () => {
      await init({ dir: tempDir })
      
      const smithersDir = path.join(tempDir, '.smithers')
      expect(fs.existsSync(smithersDir)).toBe(true)
      expect(fs.statSync(smithersDir).isDirectory()).toBe(true)
    })

    test('creates logs subdirectory inside .smithers', async () => {
      await init({ dir: tempDir })
      
      const logsDir = path.join(tempDir, '.smithers', 'logs')
      expect(fs.existsSync(logsDir)).toBe(true)
      expect(fs.statSync(logsDir).isDirectory()).toBe(true)
    })

    test('creates main.tsx file from template', async () => {
      await init({ dir: tempDir })
      
      const mainFile = path.join(tempDir, '.smithers', 'main.tsx')
      expect(fs.existsSync(mainFile)).toBe(true)
    })

    test('sets main.tsx as executable (755 permissions)', async () => {
      await init({ dir: tempDir })
      
      const mainFile = path.join(tempDir, '.smithers', 'main.tsx')
      const stats = fs.statSync(mainFile)
      // Check executable bit for owner
      expect((stats.mode & 0o100) !== 0).toBe(true)
    })
  })

  describe('existing directory handling', () => {
    test('exits with code 1 when .smithers already exists', async () => {
      const smithersDir = path.join(tempDir, '.smithers')
      fs.mkdirSync(smithersDir, { recursive: true })
      
      await expect(init({ dir: tempDir })).rejects.toThrow('process.exit(1)')
      expect(_exitCode).toBe(1)
    })

    test('prints warning message when .smithers exists', async () => {
      const smithersDir = path.join(tempDir, '.smithers')
      fs.mkdirSync(smithersDir, { recursive: true })
      
      try {
        await init({ dir: tempDir })
      } catch {}
      
      expect(consoleOutput.some(line => line.includes('.smithers/ directory already exists'))).toBe(true)
    })

    test('suggests rm -rf command to reinitialize', async () => {
      const smithersDir = path.join(tempDir, '.smithers')
      fs.mkdirSync(smithersDir, { recursive: true })
      
      try {
        await init({ dir: tempDir })
      } catch {}
      
      expect(consoleOutput.some(line => line.includes('rm -rf'))).toBe(true)
    })
  })

  describe('template handling', () => {
    test('copies template content', async () => {
      await init({ dir: tempDir })
      
      const mainFile = path.join(tempDir, '.smithers', 'main.tsx')
      const content = fs.readFileSync(mainFile, 'utf-8')
      
      // Template should contain smithers imports
      expect(content).toContain('smithers-orchestrator')
    })

    test('main.tsx contains shebang', async () => {
      await init({ dir: tempDir })
      
      const mainFile = path.join(tempDir, '.smithers', 'main.tsx')
      const content = fs.readFileSync(mainFile, 'utf-8')
      
      expect(content.startsWith('#!/usr/bin/env bun')).toBe(true)
    })
  })

  describe('output messages', () => {
    test('prints initialization header', async () => {
      await init({ dir: tempDir })
      
      expect(consoleOutput.some(line => line.includes('Initializing Smithers'))).toBe(true)
    })

    test('prints created directory structure', async () => {
      await init({ dir: tempDir })
      
      expect(consoleOutput.some(line => line.includes('main.tsx'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('logs/'))).toBe(true)
    })

    test('prints next steps instructions', async () => {
      await init({ dir: tempDir })
      
      expect(consoleOutput.some(line => line.includes('Next steps'))).toBe(true)
    })

    test('prints success message', async () => {
      await init({ dir: tempDir })
      
      expect(consoleOutput.some(line => line.includes('initialized'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles paths with spaces', async () => {
      const spacePath = path.join(tempDir, 'path with spaces')
      fs.mkdirSync(spacePath, { recursive: true })
      
      await init({ dir: spacePath })
      
      expect(fs.existsSync(path.join(spacePath, '.smithers'))).toBe(true)
    })

    test('handles nested directory paths', async () => {
      const nestedPath = path.join(tempDir, 'a', 'b', 'c')
      fs.mkdirSync(nestedPath, { recursive: true })
      
      await init({ dir: nestedPath })
      
      expect(fs.existsSync(path.join(nestedPath, '.smithers'))).toBe(true)
    })
  })
})
