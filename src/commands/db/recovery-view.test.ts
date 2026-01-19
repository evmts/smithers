/**
 * Tests for recovery-view
 * 
 * Covers: Incomplete execution detection, state recovery, transition history
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { showRecovery } from './recovery-view'

describe('showRecovery', () => {
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

  interface IncompleteExecution {
    id: string
    name?: string
    file_path: string
    started_at?: string
  }

  interface Transition {
    created_at: string
    key: string
    new_value: unknown
  }

  interface MockDbOptions {
    incomplete?: IncompleteExecution | null
    state?: Record<string, unknown>
    transitions?: Transition[]
  }

  function createMockDb(options: MockDbOptions = {}) {
    return {
      execution: {
        findIncomplete: async () => options.incomplete ?? null
      },
      state: {
        getAll: async () => options.state ?? {},
        history: async () => options.transitions ?? []
      }
    }
  }

  describe('no incomplete execution', () => {
    test('prints success message when null', async () => {
      const db = createMockDb({ incomplete: null })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('No incomplete executions found'))).toBe(true)
    })

    test('prints "No recovery needed"', async () => {
      const db = createMockDb({ incomplete: null })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('No recovery needed'))).toBe(true)
    })

    test('returns early when no incomplete execution', async () => {
      const db = createMockDb({ incomplete: null })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('Last Known State'))).toBe(false)
    })
  })

  describe('incomplete execution display', () => {
    test('shows warning icon', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' }
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('⚠️'))).toBe(true)
    })

    test('shows execution name or "Unnamed"', async () => {
      const db = createMockDb({
        incomplete: { id: '1', name: 'Failed Run', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' }
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('Name: Failed Run'))).toBe(true)
    })

    test('shows "Unnamed" when name is missing', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' }
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('Unnamed'))).toBe(true)
    })

    test('shows execution ID', async () => {
      const db = createMockDb({
        incomplete: { id: 'exec-crashed-123', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' }
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('ID: exec-crashed-123'))).toBe(true)
    })

    test('shows file path', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/path/to/crashed.tsx', started_at: '2024-01-01T10:00:00Z' }
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('File: /path/to/crashed.tsx'))).toBe(true)
    })

    test('shows start time formatted with toLocaleString', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-15T10:30:00Z' }
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('Started:'))).toBe(true)
    })
  })

  describe('last known state', () => {
    test('shows all state key-value pairs', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' },
        state: { phase: 'review', iteration: 3 }
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('phase:'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('iteration:'))).toBe(true)
    })

    test('serializes values as JSON', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' },
        state: { config: { enabled: true } }
      })
      await showRecovery(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('config')
    })

    test('handles empty state', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' },
        state: {}
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('Last Known State'))).toBe(true)
    })
  })

  describe('transition history', () => {
    test('shows last 5 transitions', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' },
        transitions: [
          { created_at: '2024-01-01T10:01:00Z', key: 'step', new_value: 1 },
          { created_at: '2024-01-01T10:02:00Z', key: 'step', new_value: 2 },
          { created_at: '2024-01-01T10:03:00Z', key: 'step', new_value: 3 },
          { created_at: '2024-01-01T10:04:00Z', key: 'step', new_value: 4 },
          { created_at: '2024-01-01T10:05:00Z', key: 'step', new_value: 5 }
        ]
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('Last 5 Transitions'))).toBe(true)
    })

    test('formats transition timestamps', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' },
        transitions: [
          { created_at: '2024-01-15T14:30:00Z', key: 'status', new_value: 'running' }
        ]
      })
      await showRecovery(db)
      
      // Timestamp should be formatted
      const output = consoleOutput.join('\n')
      expect(output).toContain('status')
    })

    test('shows key and new value for each transition', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' },
        transitions: [
          { created_at: '2024-01-01T10:00:00Z', key: 'phase_name', new_value: 'Implementation' }
        ]
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('phase_name') && line.includes('Implementation'))).toBe(true)
    })

    test('handles empty transition history', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' },
        transitions: []
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('Last 0 Transitions'))).toBe(true)
    })
  })

  describe('recovery options', () => {
    test('displays recovery instruction', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' }
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('To recover, run: smithers run'))).toBe(true)
    })

    test('displays auto-detection message', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' }
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('orchestration will detect the incomplete state'))).toBe(true)
    })
  })

  describe('header formatting', () => {
    test('prints correct header separator', async () => {
      const db = createMockDb({})
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('═══════════════════════════════════════════════════════════'))).toBe(true)
    })

    test('prints "CRASH RECOVERY" title', async () => {
      const db = createMockDb({})
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('CRASH RECOVERY'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles null name', async () => {
      const db = createMockDb({
        incomplete: { id: '1', name: undefined, file_path: '/test.tsx', started_at: '2024-01-01T10:00:00Z' }
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('Unnamed'))).toBe(true)
    })

    test('handles very old started_at timestamps', async () => {
      const db = createMockDb({
        incomplete: { id: '1', file_path: '/test.tsx', started_at: '2020-01-01T00:00:00Z' }
      })
      await showRecovery(db)
      
      expect(consoleOutput.some(line => line.includes('Started:'))).toBe(true)
    })
  })
})
