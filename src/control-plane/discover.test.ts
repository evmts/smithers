/**
 * Unit tests for control-plane/discover.ts
 * Tests script discovery logic for finding .smithers orchestrations
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as path from 'path'
import * as fs from 'fs'
import { discoverScripts } from './discover.js'

describe('discoverScripts', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(process.cwd(), '.tui-test', 'discover-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('finding .smithers directory', () => {
    test('finds .tsx files in .smithers directory', async () => {
      const smithersDir = path.join(tempDir, '.smithers')
      fs.mkdirSync(smithersDir, { recursive: true })
      fs.writeFileSync(path.join(smithersDir, 'main.tsx'), `
        import { SmithersProvider } from 'smithers'
        export default () => <SmithersProvider />
      `)

      const scripts = await discoverScripts({ cwd: tempDir })
      expect(scripts.length).toBe(1)
      expect(scripts[0].name).toBe('main')
    })

    test('finds .tsx files in cwd', async () => {
      fs.writeFileSync(path.join(tempDir, 'workflow.tsx'), `
        import { SmithersProvider } from 'smithers'
        export default () => <SmithersProvider />
      `)

      const scripts = await discoverScripts({ cwd: tempDir })
      expect(scripts.length).toBe(1)
      expect(scripts[0].name).toBe('workflow')
    })

    test('returns empty array when no .smithers found', async () => {
      const scripts = await discoverScripts({ cwd: tempDir })
      expect(scripts).toEqual([])
    })

    test('skips files without SmithersProvider', async () => {
      const smithersDir = path.join(tempDir, '.smithers')
      fs.mkdirSync(smithersDir, { recursive: true })
      fs.writeFileSync(path.join(smithersDir, 'utils.tsx'), `
        export const helper = () => {}
      `)

      const scripts = await discoverScripts({ cwd: tempDir })
      expect(scripts.length).toBe(0)
    })

    test('skips node_modules', async () => {
      const nodeModulesDir = path.join(tempDir, 'node_modules', 'some-package')
      fs.mkdirSync(nodeModulesDir, { recursive: true })
      fs.writeFileSync(path.join(nodeModulesDir, 'index.tsx'), `
        import { SmithersProvider } from 'smithers'
        export default () => <SmithersProvider />
      `)

      const scripts = await discoverScripts({ cwd: tempDir })
      expect(scripts.length).toBe(0)
    })
  })

  describe('ScriptInfo structure', () => {
    test('includes correct path', async () => {
      const smithersDir = path.join(tempDir, '.smithers')
      fs.mkdirSync(smithersDir, { recursive: true })
      const filePath = path.join(smithersDir, 'main.tsx')
      fs.writeFileSync(filePath, `
        import { SmithersProvider } from 'smithers'
        export default () => <SmithersProvider />
      `)

      const scripts = await discoverScripts({ cwd: tempDir })
      expect(scripts[0].path).toBe(filePath)
    })

    test('extracts name from filename', async () => {
      const smithersDir = path.join(tempDir, '.smithers')
      fs.mkdirSync(smithersDir, { recursive: true })
      fs.writeFileSync(path.join(smithersDir, 'my-workflow.tsx'), `
        import { SmithersProvider } from 'smithers'
        export default () => <SmithersProvider />
      `)

      const scripts = await discoverScripts({ cwd: tempDir })
      expect(scripts[0].name).toBe('my-workflow')
    })

    test('derives dbPath correctly', async () => {
      const smithersDir = path.join(tempDir, '.smithers')
      fs.mkdirSync(smithersDir, { recursive: true })
      fs.writeFileSync(path.join(smithersDir, 'main.tsx'), `
        import { SmithersProvider } from 'smithers'
        export default () => <SmithersProvider />
      `)

      const scripts = await discoverScripts({ cwd: tempDir })
      expect(scripts[0].dbPath).toContain('.smithers')
      expect(scripts[0].dbPath).toContain('data')
      expect(scripts[0].dbPath).toEndWith('.db')
    })

    test('hasIncomplete defaults to false when no DB exists', async () => {
      const smithersDir = path.join(tempDir, '.smithers')
      fs.mkdirSync(smithersDir, { recursive: true })
      fs.writeFileSync(path.join(smithersDir, 'main.tsx'), `
        import { SmithersProvider } from 'smithers'
        export default () => <SmithersProvider />
      `)

      const scripts = await discoverScripts({ cwd: tempDir })
      expect(scripts[0].hasIncomplete).toBe(false)
    })
  })

  describe('deduplication', () => {
    test('does not return duplicates when file exists in multiple search paths', async () => {
      const smithersDir = path.join(tempDir, '.smithers')
      fs.mkdirSync(smithersDir, { recursive: true })
      fs.writeFileSync(path.join(smithersDir, 'main.tsx'), `
        import { SmithersProvider } from 'smithers'
        export default () => <SmithersProvider />
      `)

      const scripts = await discoverScripts({ cwd: tempDir })
      const paths = scripts.map(s => s.path)
      const uniquePaths = [...new Set(paths)]
      expect(paths.length).toBe(uniquePaths.length)
    })
  })

  describe('recursive discovery', () => {
    test('finds .tsx files in subdirectories', async () => {
      const smithersDir = path.join(tempDir, '.smithers')
      const subDir = path.join(smithersDir, 'workflows')
      fs.mkdirSync(subDir, { recursive: true })
      fs.writeFileSync(path.join(subDir, 'deploy.tsx'), `
        import { SmithersProvider } from 'smithers'
        export default () => <SmithersProvider />
      `)

      const scripts = await discoverScripts({ cwd: tempDir })
      expect(scripts.length).toBe(1)
      expect(scripts[0].name).toBe('deploy')
    })
  })
})
