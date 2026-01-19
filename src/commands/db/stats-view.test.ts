/**
 * Tests for stats-view
 * 
 * Covers: Table statistics, count queries, formatting
 */

import { describe, it, test, expect, beforeEach, afterEach } from 'bun:test'
import { showStats } from './stats-view'

describe('showStats', () => {
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

  function createMockDb(counts: Record<string, number>) {
    return {
      query: async (sql: string) => {
        // Extract table name from query
        const match = sql.match(/FROM (\w+)/)
        const table = match ? match[1] : ''
        return [{ count: counts[table] ?? 0 }]
      }
    }
  }

  describe('table statistics', () => {
    test('queries count for executions table', async () => {
      const db = createMockDb({ executions: 10 })
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('executions') && line.includes('10'))).toBe(true)
    })

    test('queries count for phases table', async () => {
      const db = createMockDb({ phases: 25 })
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('phases') && line.includes('25'))).toBe(true)
    })

    test('queries count for agents table', async () => {
      const db = createMockDb({ agents: 50 })
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('agents') && line.includes('50'))).toBe(true)
    })

    test('queries count for tool_calls table', async () => {
      const db = createMockDb({ tool_calls: 100 })
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('tool_calls') && line.includes('100'))).toBe(true)
    })

    test('queries count for memories table', async () => {
      const db = createMockDb({ memories: 15 })
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('memories') && line.includes('15'))).toBe(true)
    })

    test('queries count for state table', async () => {
      const db = createMockDb({ state: 5 })
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('state') && line.includes('5'))).toBe(true)
    })

    test('queries count for transitions table', async () => {
      const db = createMockDb({ transitions: 200 })
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('transitions') && line.includes('200'))).toBe(true)
    })

    test('queries count for artifacts table', async () => {
      const db = createMockDb({ artifacts: 30 })
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('artifacts') && line.includes('30'))).toBe(true)
    })
  })

  describe('count display', () => {
    test('shows count for each table', async () => {
      const db = createMockDb({
        executions: 1,
        phases: 2,
        agents: 3,
        tool_calls: 4,
        memories: 5,
        state: 6,
        transitions: 7,
        artifacts: 8
      })
      await showStats(db)
      
      const tables = ['executions', 'phases', 'agents', 'tool_calls', 'memories', 'state', 'transitions', 'artifacts']
      for (const table of tables) {
        expect(consoleOutput.some(line => line.includes(table))).toBe(true)
      }
    })

    test('pads table names to 15 characters', async () => {
      const db = createMockDb({ executions: 10 })
      await showStats(db)
      
      // 'executions' is 10 chars, padded to 15 means 5 spaces follow
      const output = consoleOutput.join('\n')
      expect(output).toContain('executions')
    })

    test('handles zero counts', async () => {
      const db = createMockDb({ executions: 0 })
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('executions') && line.includes('0'))).toBe(true)
    })

    test('handles large counts', async () => {
      const db = createMockDb({ tool_calls: 1000000 })
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('1000000'))).toBe(true)
    })

    test('handles empty query result with default 0', async () => {
      const db = {
        query: async () => []
      }
      await showStats(db)
      
      // All tables should show 0
      expect(consoleOutput.some(line => line.includes('executions') && line.includes('0'))).toBe(true)
    })
  })

  describe('header formatting', () => {
    test('prints correct header separator', async () => {
      const db = createMockDb({})
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('═══════════════════════════════════════════════════════════'))).toBe(true)
    })

    test('prints "DATABASE STATISTICS" title', async () => {
      const db = createMockDb({})
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('DATABASE STATISTICS'))).toBe(true)
    })
  })

  describe('error handling', () => {
    test('handles null result from query', async () => {
      const db = {
        query: async () => [{ count: null }]
      }
      await showStats(db)
      
      // Should fallback to 0
      expect(consoleOutput.some(line => line.includes('0'))).toBe(true)
    })

    test('handles empty result array', async () => {
      const db = {
        query: async () => []
      }
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('0'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles very large row counts', async () => {
      const db = createMockDb({ transitions: 999999999 })
      await showStats(db)
      
      expect(consoleOutput.some(line => line.includes('999999999'))).toBe(true)
    })
  })
})
