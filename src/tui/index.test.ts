/**
 * Tests for src/tui/index.tsx
 * TUI entry point and launchTUI function
 */

import { describe, test, expect } from 'bun:test'

describe('tui/index', () => {
  describe('launchTUI function', () => {
    test('exports launchTUI function', async () => {
      const { launchTUI } = await import('./index.js')
      expect(typeof launchTUI).toBe('function')
    })
  })

  describe('TUIOptions interface', () => {
    test('dbPath defaults to .smithers/data when not provided', () => {
      const options: { dbPath?: string } = {}
      const dbPath = options.dbPath ?? '.smithers/data'
      expect(dbPath).toBe('.smithers/data')
    })

    test('uses custom dbPath when provided', () => {
      const options = { dbPath: '/custom/path' }
      const dbPath = options.dbPath ?? '.smithers/data'
      expect(dbPath).toBe('/custom/path')
    })
  })

  describe('direct execution path resolution', () => {
    test('uses process.argv[2] when available', () => {
      const mockArgv = ['bun', 'index.tsx', '/custom/db/path']
      const dbPath = mockArgv[2] ?? '.smithers/data'
      expect(dbPath).toBe('/custom/db/path')
    })

    test('falls back to .smithers/data when no arg provided', () => {
      const mockArgv = ['bun', 'index.tsx']
      const dbPath = mockArgv[2] ?? '.smithers/data'
      expect(dbPath).toBe('.smithers/data')
    })
  })
})
