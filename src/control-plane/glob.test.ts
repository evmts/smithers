/**
 * Unit tests for control-plane/glob.ts
 * Tests file pattern matching functionality
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as path from 'path'
import * as fs from 'fs'
import { glob } from './glob.js'

describe('glob', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(process.cwd(), '.tui-test', 'glob-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('pattern matching', () => {
    test('matches *.tsx files', async () => {
      fs.writeFileSync(path.join(tempDir, 'main.tsx'), '')
      fs.writeFileSync(path.join(tempDir, 'other.tsx'), '')
      fs.writeFileSync(path.join(tempDir, 'readme.md'), '')

      const results = await glob({ pattern: '*.tsx', cwd: tempDir })
      
      expect(results.length).toBe(2)
      expect(results).toContain('main.tsx')
      expect(results).toContain('other.tsx')
    })

    test('matches **/*.tsx recursively', async () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true })
      fs.writeFileSync(path.join(tempDir, 'main.tsx'), '')
      fs.writeFileSync(path.join(tempDir, 'src', 'app.tsx'), '')

      const results = await glob({ pattern: '**/*.tsx', cwd: tempDir })
      
      expect(results.length).toBe(2)
      expect(results).toContain('main.tsx')
      expect(results).toContain('src/app.tsx')
    })

    test('returns sorted results', async () => {
      fs.writeFileSync(path.join(tempDir, 'z.tsx'), '')
      fs.writeFileSync(path.join(tempDir, 'a.tsx'), '')
      fs.writeFileSync(path.join(tempDir, 'm.tsx'), '')

      const results = await glob({ pattern: '*.tsx', cwd: tempDir })
      
      expect(results).toEqual(['a.tsx', 'm.tsx', 'z.tsx'])
    })
  })

  describe('exclusions', () => {
    test('excludes node_modules by default', async () => {
      const nodeModulesDir = path.join(tempDir, 'node_modules', 'pkg')
      fs.mkdirSync(nodeModulesDir, { recursive: true })
      fs.writeFileSync(path.join(nodeModulesDir, 'index.tsx'), '')
      fs.writeFileSync(path.join(tempDir, 'main.tsx'), '')

      const results = await glob({ pattern: '**/*.tsx', cwd: tempDir })
      
      expect(results.length).toBe(1)
      expect(results).toContain('main.tsx')
    })

    test('excludes .git directory', async () => {
      const gitDir = path.join(tempDir, '.git', 'hooks')
      fs.mkdirSync(gitDir, { recursive: true })
      fs.writeFileSync(path.join(gitDir, 'pre-commit.tsx'), '')
      fs.writeFileSync(path.join(tempDir, 'main.tsx'), '')

      const results = await glob({ pattern: '**/*.tsx', cwd: tempDir })
      
      expect(results.length).toBe(1)
      expect(results).toContain('main.tsx')
    })
  })

  describe('limits', () => {
    test('respects limit option', async () => {
      for (let i = 0; i < 10; i++) {
        fs.writeFileSync(path.join(tempDir, `file${i}.tsx`), '')
      }

      const results = await glob({ pattern: '*.tsx', cwd: tempDir, limit: 3 })
      
      expect(results.length).toBe(3)
    })

    test('defaults limit to 100', async () => {
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(tempDir, `file${i}.tsx`), '')
      }

      const results = await glob({ pattern: '*.tsx', cwd: tempDir })
      
      expect(results.length).toBe(5)
    })
  })

  describe('security', () => {
    test('throws on absolute path patterns', async () => {
      await expect(glob({ pattern: '/etc/*.conf', cwd: tempDir })).rejects.toThrow('absolute paths')
    })

    test('throws on parent traversal patterns', async () => {
      await expect(glob({ pattern: '../*.tsx', cwd: tempDir })).rejects.toThrow('parent traversal')
    })
  })

  describe('edge cases', () => {
    test('handles no matches gracefully', async () => {
      const results = await glob({ pattern: '*.nonexistent', cwd: tempDir })
      expect(results).toEqual([])
    })

    test('uses cwd when not specified', async () => {
      const originalCwd = process.cwd()
      try {
        process.chdir(tempDir)
        fs.writeFileSync(path.join(tempDir, 'test.tsx'), '')
        
        const results = await glob({ pattern: '*.tsx' })
        expect(results).toContain('test.tsx')
      } finally {
        process.chdir(originalCwd)
      }
    })
  })
})
