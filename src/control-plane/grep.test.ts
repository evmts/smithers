/**
 * Unit tests for control-plane/grep.ts
 * Tests content search functionality
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as path from 'path'
import * as fs from 'fs'
import { grep } from './grep.js'

describe('grep', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(process.cwd(), '.tui-test', 'grep-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('pattern matching', () => {
    test('finds pattern in file', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.ts'), 'const foo = "bar"\nconst baz = "qux"')

      const result = await grep({ pattern: 'foo', cwd: tempDir })
      
      expect(result.matches.length).toBe(1)
      expect(result.matches[0].file).toBe('test.ts')
      expect(result.matches[0].content).toContain('foo')
    })

    test('returns line numbers (1-indexed)', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.ts'), 'line one\nline two\nfoo bar\nline four')

      const result = await grep({ pattern: 'foo', cwd: tempDir })
      
      expect(result.matches[0].line).toBe(3)
    })

    test('handles regex patterns', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.ts'), 'function test() {}\nfunction main() {}')

      const result = await grep({ pattern: 'function \\w+\\(\\)', cwd: tempDir })
      
      expect(result.matches.length).toBe(2)
    })

    test('returns invalid regex error gracefully', async () => {
      const result = await grep({ pattern: '[invalid', cwd: tempDir })
      
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Invalid regex')
      expect(result.matches).toEqual([])
    })
  })

  describe('case sensitivity', () => {
    test('case-insensitive by default', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.ts'), 'FOO\nfoo\nFoO')

      const result = await grep({ pattern: 'foo', cwd: tempDir })
      
      expect(result.matches.length).toBe(3)
    })

    test('case-sensitive when specified', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.ts'), 'FOO\nfoo\nFoO')

      const result = await grep({ pattern: 'foo', cwd: tempDir, caseSensitive: true })
      
      expect(result.matches.length).toBe(1)
      expect(result.matches[0].content).toBe('foo')
    })
  })

  describe('path filtering', () => {
    test('searches specific path', async () => {
      const srcDir = path.join(tempDir, 'src')
      fs.mkdirSync(srcDir, { recursive: true })
      fs.writeFileSync(path.join(tempDir, 'root.ts'), 'foo')
      fs.writeFileSync(path.join(srcDir, 'app.ts'), 'foo')

      const result = await grep({ pattern: 'foo', path: 'src', cwd: tempDir })
      
      expect(result.matches.length).toBe(1)
      expect(result.matches[0].file).toContain('app.ts')
    })

    test('throws when path escapes workspace', async () => {
      await expect(grep({ pattern: 'foo', path: '../', cwd: tempDir })).rejects.toThrow('within workspace')
    })
  })

  describe('glob filtering', () => {
    test('filters by glob pattern', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.ts'), 'foo')
      fs.writeFileSync(path.join(tempDir, 'test.js'), 'foo')

      const result = await grep({ pattern: 'foo', glob: '*.ts', cwd: tempDir })
      
      expect(result.matches.length).toBe(1)
      expect(result.matches[0].file).toBe('test.ts')
    })
  })

  describe('exclusions', () => {
    test('excludes node_modules', async () => {
      const nodeModulesDir = path.join(tempDir, 'node_modules', 'pkg')
      fs.mkdirSync(nodeModulesDir, { recursive: true })
      fs.writeFileSync(path.join(nodeModulesDir, 'index.ts'), 'foo')
      fs.writeFileSync(path.join(tempDir, 'main.ts'), 'foo')

      const result = await grep({ pattern: 'foo', cwd: tempDir })
      
      expect(result.matches.length).toBe(1)
      expect(result.matches[0].file).toBe('main.ts')
    })

    test('excludes .git directory', async () => {
      const gitDir = path.join(tempDir, '.git', 'hooks')
      fs.mkdirSync(gitDir, { recursive: true })
      fs.writeFileSync(path.join(gitDir, 'pre-commit'), 'foo')
      fs.writeFileSync(path.join(tempDir, 'main.ts'), 'foo')

      const result = await grep({ pattern: 'foo', cwd: tempDir })
      
      expect(result.matches.length).toBe(1)
      expect(result.matches[0].file).toBe('main.ts')
    })

    test('skips large files (>1MB)', async () => {
      const largeContent = 'foo\n'.repeat(300000)
      fs.writeFileSync(path.join(tempDir, 'large.ts'), largeContent)
      fs.writeFileSync(path.join(tempDir, 'small.ts'), 'foo')

      const result = await grep({ pattern: 'foo', cwd: tempDir })
      
      expect(result.matches.length).toBe(1)
      expect(result.matches[0].file).toBe('small.ts')
    })
  })

  describe('limits', () => {
    test('respects limit option', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.ts'), 'foo\nfoo\nfoo\nfoo\nfoo')

      const result = await grep({ pattern: 'foo', cwd: tempDir, limit: 2 })
      
      expect(result.matches.length).toBe(2)
    })

    test('truncates long lines', async () => {
      const longLine = 'foo' + 'x'.repeat(300)
      fs.writeFileSync(path.join(tempDir, 'test.ts'), longLine)

      const result = await grep({ pattern: 'foo', cwd: tempDir })
      
      expect(result.matches[0].content.length).toBeLessThanOrEqual(200)
    })
  })

  describe('edge cases', () => {
    test('handles no matches gracefully', async () => {
      fs.writeFileSync(path.join(tempDir, 'test.ts'), 'bar baz qux')

      const result = await grep({ pattern: 'foo', cwd: tempDir })
      
      expect(result.matches).toEqual([])
      expect(result.error).toBeUndefined()
    })

    test('handles empty files', async () => {
      fs.writeFileSync(path.join(tempDir, 'empty.ts'), '')

      const result = await grep({ pattern: 'foo', cwd: tempDir })
      
      expect(result.matches).toEqual([])
    })

    test('searches recursively by default', async () => {
      const subDir = path.join(tempDir, 'a', 'b', 'c')
      fs.mkdirSync(subDir, { recursive: true })
      fs.writeFileSync(path.join(subDir, 'deep.ts'), 'foo')

      const result = await grep({ pattern: 'foo', cwd: tempDir })
      
      expect(result.matches.length).toBe(1)
      expect(result.matches[0].file).toContain('deep.ts')
    })
  })
})
