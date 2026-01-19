/**
 * Tests for state-view
 * 
 * Covers: State display, JSON formatting, empty state handling
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { showState } from './state-view'

describe('showState', () => {
  let consoleOutput: string[]
  let originalConsoleLog: typeof console.log

  beforeEach(() => {
    consoleOutput = []
    originalConsoleLog = console.log
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '))
    }
  })

  afterEach(() => {
    console.log = originalConsoleLog
  })

  // Mock db object factory
  function createMockDb(state: Record<string, unknown>) {
    return {
      state: {
        getAll: async () => state
      }
    }
  }

  describe('empty state', () => {
    test('prints "(empty state)" when no state exists', async () => {
      const db = createMockDb({})
      await showState(db)
      
      expect(consoleOutput.some(line => line.includes('(empty state)'))).toBe(true)
    })

    test('prints header even when empty', async () => {
      const db = createMockDb({})
      await showState(db)
      
      expect(consoleOutput.some(line => line.includes('CURRENT STATE'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('═'))).toBe(true)
    })
  })

  describe('state display', () => {
    test('prints all state key-value pairs', async () => {
      const db = createMockDb({ key1: 'value1', key2: 'value2' })
      await showState(db)
      
      expect(consoleOutput.some(line => line.includes('key1:'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('key2:'))).toBe(true)
    })

    test('handles string values', async () => {
      const db = createMockDb({ name: 'test-string' })
      await showState(db)
      
      expect(consoleOutput.some(line => line.includes('"test-string"'))).toBe(true)
    })

    test('handles number values', async () => {
      const db = createMockDb({ count: 42 })
      await showState(db)
      
      expect(consoleOutput.some(line => line.includes('42'))).toBe(true)
    })

    test('handles boolean values', async () => {
      const db = createMockDb({ enabled: true, disabled: false })
      await showState(db)
      
      expect(consoleOutput.some(line => line.includes('true'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('false'))).toBe(true)
    })

    test('handles null values', async () => {
      const db = createMockDb({ nullValue: null })
      await showState(db)
      
      expect(consoleOutput.some(line => line.includes('null'))).toBe(true)
    })

    test('handles array values', async () => {
      const db = createMockDb({ items: [1, 2, 3] })
      await showState(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('[')
      expect(output).toContain('1')
      expect(output).toContain('2')
      expect(output).toContain('3')
    })

    test('handles nested object values', async () => {
      const db = createMockDb({ nested: { inner: 'value', deep: { deeper: true } } })
      await showState(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('inner')
      expect(output).toContain('value')
      expect(output).toContain('deeper')
    })
  })

  describe('JSON formatting', () => {
    test('uses 2-space indentation for nested objects', async () => {
      const db = createMockDb({ nested: { key: 'value' } })
      await showState(db)
      
      const output = consoleOutput.join('\n')
      // JSON.stringify with 2-space indent
      expect(output).toContain('  "key"')
    })

    test('handles deeply nested structures', async () => {
      const db = createMockDb({
        level1: {
          level2: {
            level3: {
              level4: 'deep'
            }
          }
        }
      })
      await showState(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('level1')
      expect(output).toContain('level4')
      expect(output).toContain('deep')
    })
  })

  describe('header formatting', () => {
    test('prints correct header separator', async () => {
      const db = createMockDb({})
      await showState(db)
      
      expect(consoleOutput.some(line => line.includes('═══════════════════════════════════════════════════════════'))).toBe(true)
    })

    test('prints "CURRENT STATE" title', async () => {
      const db = createMockDb({})
      await showState(db)
      
      expect(consoleOutput.some(line => line.includes('CURRENT STATE'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles very long key names', async () => {
      const longKey = 'a'.repeat(100)
      const db = createMockDb({ [longKey]: 'value' })
      await showState(db)
      
      expect(consoleOutput.some(line => line.includes(longKey))).toBe(true)
    })

    test('handles very large values', async () => {
      const largeArray = Array.from({ length: 100 }, (_, i) => i)
      const db = createMockDb({ large: largeArray })
      await showState(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('99')
    })

    test('handles special characters in keys', async () => {
      const db = createMockDb({ 'key-with-dashes': 'value', 'key.with.dots': 'value2' })
      await showState(db)
      
      expect(consoleOutput.some(line => line.includes('key-with-dashes'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('key.with.dots'))).toBe(true)
    })

    test('handles unicode in values', async () => {
      const db = createMockDb({ emoji: '🚀', japanese: 'こんにちは' })
      await showState(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('🚀')
      expect(output).toContain('こんにちは')
    })
  })
})
