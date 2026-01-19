/**
 * Tests for memories-view
 * 
 * Covers: Memory stats, category/scope breakdown, recent memories display
 */

import { describe, it, test, expect, beforeEach, afterEach } from 'bun:test'
import { showMemories } from './memories-view'

describe('showMemories', () => {
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

  interface MemoryStats {
    total: number
    byCategory: Record<string, number>
    byScope: Record<string, number>
  }

  interface Memory {
    category: string
    key: string
    content: string
    confidence: number
    source?: string
  }

  interface MockDbOptions {
    stats?: MemoryStats
    memories?: Memory[]
  }

  function createMockDb(options: MockDbOptions = {}) {
    const defaultStats: MemoryStats = {
      total: 0,
      byCategory: {},
      byScope: {}
    }
    
    return {
      memories: {
        stats: async () => options.stats ?? defaultStats,
        list: async () => options.memories ?? []
      }
    }
  }

  describe('stats display', () => {
    test('shows total memory count', async () => {
      const db = createMockDb({
        stats: { total: 42, byCategory: {}, byScope: {} }
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('Total: 42'))).toBe(true)
    })

    test('shows breakdown by category', async () => {
      const db = createMockDb({
        stats: {
          total: 10,
          byCategory: { 'learned': 5, 'observed': 5 },
          byScope: {}
        }
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('By Category:'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('learned: 5'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('observed: 5'))).toBe(true)
    })

    test('shows breakdown by scope', async () => {
      const db = createMockDb({
        stats: {
          total: 10,
          byCategory: {},
          byScope: { 'global': 3, 'session': 7 }
        }
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('By Scope:'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('global: 3'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('session: 7'))).toBe(true)
    })

    test('handles empty byCategory', async () => {
      const db = createMockDb({
        stats: { total: 0, byCategory: {}, byScope: {} }
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('By Category:'))).toBe(true)
    })

    test('handles empty byScope', async () => {
      const db = createMockDb({
        stats: { total: 0, byCategory: {}, byScope: {} }
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('By Scope:'))).toBe(true)
    })
  })

  describe('category breakdown', () => {
    test('lists all categories with counts', async () => {
      const db = createMockDb({
        stats: {
          total: 15,
          byCategory: { 'facts': 5, 'preferences': 7, 'context': 3 },
          byScope: {}
        }
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('facts: 5'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('preferences: 7'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('context: 3'))).toBe(true)
    })

    test('handles single category', async () => {
      const db = createMockDb({
        stats: {
          total: 5,
          byCategory: { 'only-one': 5 },
          byScope: {}
        }
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('only-one: 5'))).toBe(true)
    })

    test('handles many categories', async () => {
      const byCategory: Record<string, number> = {}
      for (let i = 0; i < 10; i++) {
        byCategory[`cat-${i}`] = i + 1
      }
      
      const db = createMockDb({
        stats: { total: 55, byCategory, byScope: {} }
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('cat-0: 1'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('cat-9: 10'))).toBe(true)
    })
  })

  describe('scope breakdown', () => {
    test('lists all scopes with counts', async () => {
      const db = createMockDb({
        stats: {
          total: 10,
          byCategory: {},
          byScope: { 'project': 4, 'file': 6 }
        }
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('project: 4'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('file: 6'))).toBe(true)
    })
  })

  describe('recent memories', () => {
    test('displays recent memories when present', async () => {
      const db = createMockDb({
        stats: { total: 1, byCategory: {}, byScope: {} },
        memories: [
          { category: 'fact', key: 'user-name', content: 'John', confidence: 0.9, source: 'input' }
        ]
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('Recent Memories:'))).toBe(true)
    })

    test('shows category in brackets', async () => {
      const db = createMockDb({
        stats: { total: 1, byCategory: {}, byScope: {} },
        memories: [
          { category: 'preference', key: 'theme', content: 'dark', confidence: 1.0 }
        ]
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('[preference]'))).toBe(true)
    })

    test('shows key name', async () => {
      const db = createMockDb({
        stats: { total: 1, byCategory: {}, byScope: {} },
        memories: [
          { category: 'fact', key: 'my-special-key', content: 'value', confidence: 0.8 }
        ]
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('my-special-key'))).toBe(true)
    })

    test('truncates content at 100 chars with ellipsis', async () => {
      const longContent = 'A'.repeat(150)
      const db = createMockDb({
        stats: { total: 1, byCategory: {}, byScope: {} },
        memories: [
          { category: 'fact', key: 'long', content: longContent, confidence: 0.5 }
        ]
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('...'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('A'.repeat(100)))).toBe(true)
    })

    test('shows full content when under 100 chars', async () => {
      const shortContent = 'Short content here'
      const db = createMockDb({
        stats: { total: 1, byCategory: {}, byScope: {} },
        memories: [
          { category: 'fact', key: 'short', content: shortContent, confidence: 1.0 }
        ]
      })
      await showMemories(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain(shortContent)
      // Should not have ellipsis for short content
      const contentLine = consoleOutput.find(line => line.includes(shortContent))
      if (contentLine) {
        expect(contentLine.endsWith('...')).toBe(false)
      }
    })

    test('shows confidence score', async () => {
      const db = createMockDb({
        stats: { total: 1, byCategory: {}, byScope: {} },
        memories: [
          { category: 'fact', key: 'test', content: 'value', confidence: 0.85 }
        ]
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('Confidence: 0.85'))).toBe(true)
    })

    test('shows source or "unknown"', async () => {
      const db = createMockDb({
        stats: { total: 2, byCategory: {}, byScope: {} },
        memories: [
          { category: 'fact', key: 'with-source', content: 'v1', confidence: 1, source: 'user_input' },
          { category: 'fact', key: 'no-source', content: 'v2', confidence: 1 }
        ]
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('Source: user_input'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('Source: unknown'))).toBe(true)
    })

    test('handles empty recent memories list', async () => {
      const db = createMockDb({
        stats: { total: 0, byCategory: {}, byScope: {} },
        memories: []
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('Recent Memories:'))).toBe(false)
    })
  })

  describe('header formatting', () => {
    test('prints correct header separator', async () => {
      const db = createMockDb({})
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('═══════════════════════════════════════════════════════════'))).toBe(true)
    })

    test('prints "MEMORIES" title', async () => {
      const db = createMockDb({})
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('MEMORIES'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles zero total memories', async () => {
      const db = createMockDb({
        stats: { total: 0, byCategory: {}, byScope: {} }
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('Total: 0'))).toBe(true)
    })

    test('handles exactly 100 char content (no ellipsis)', async () => {
      const exactly100 = 'B'.repeat(100)
      const db = createMockDb({
        stats: { total: 1, byCategory: {}, byScope: {} },
        memories: [
          { category: 'fact', key: 'exact', content: exactly100, confidence: 1.0 }
        ]
      })
      await showMemories(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('B'.repeat(100))
    })

    test('handles null source', async () => {
      const db = createMockDb({
        stats: { total: 1, byCategory: {}, byScope: {} },
        memories: [
          { category: 'fact', key: 'null-source', content: 'value', confidence: 1.0, source: undefined }
        ]
      })
      await showMemories(db)
      
      expect(consoleOutput.some(line => line.includes('Source: unknown'))).toBe(true)
    })

    test('handles special characters in content', async () => {
      const db = createMockDb({
        stats: { total: 1, byCategory: {}, byScope: {} },
        memories: [
          { category: 'fact', key: 'special', content: 'Line1\nLine2\tTabbed', confidence: 1.0 }
        ]
      })
      await showMemories(db)
      
      // Should still output something
      expect(consoleOutput.some(line => line.includes('special'))).toBe(true)
    })

    test('handles unicode in content', async () => {
      const db = createMockDb({
        stats: { total: 1, byCategory: {}, byScope: {} },
        memories: [
          { category: 'fact', key: 'emoji', content: '🚀 Rocket launch! 日本語', confidence: 1.0 }
        ]
      })
      await showMemories(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('🚀')
      expect(output).toContain('日本語')
    })
  })
})
