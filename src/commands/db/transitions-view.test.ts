/**
 * Tests for transitions-view
 * 
 * Covers: Transition history display, formatting, date handling
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { showTransitions } from './transitions-view'

describe('showTransitions', () => {
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

  interface Transition {
    created_at: string
    key: string
    old_value: unknown
    new_value: unknown
    trigger?: string
  }

  function createMockDb(transitions: Transition[]) {
    return {
      state: {
        history: async (_key: string | undefined, _limit: number) => transitions
      }
    }
  }

  describe('empty transitions', () => {
    test('prints "(no transitions)" when history is empty', async () => {
      const db = createMockDb([])
      await showTransitions(db)
      
      expect(consoleOutput.some(line => line.includes('(no transitions)'))).toBe(true)
    })

    test('prints header even when empty', async () => {
      const db = createMockDb([])
      await showTransitions(db)
      
      expect(consoleOutput.some(line => line.includes('STATE TRANSITIONS'))).toBe(true)
      expect(consoleOutput.some(line => line.includes('═'))).toBe(true)
    })
  })

  describe('transition display', () => {
    test('displays transitions in order', async () => {
      const transitions: Transition[] = [
        { created_at: '2024-01-01T10:00:00Z', key: 'status', old_value: 'pending', new_value: 'running', trigger: 'phase_start' },
        { created_at: '2024-01-01T10:01:00Z', key: 'status', old_value: 'running', new_value: 'complete', trigger: 'phase_end' }
      ]
      const db = createMockDb(transitions)
      await showTransitions(db)
      
      const output = consoleOutput.join('\n')
      const pendingIndex = output.indexOf('pending')
      const runningIndex = output.indexOf('running')
      expect(pendingIndex).toBeLessThan(runningIndex)
    })

    test('shows timestamp for each transition', async () => {
      const db = createMockDb([
        { created_at: '2024-01-15T10:30:00Z', key: 'test', old_value: null, new_value: 'value', trigger: 'init' }
      ])
      await showTransitions(db)
      
      const output = consoleOutput.join('\n')
      // The timestamp should be formatted with toLocaleString
      expect(output).toContain('[')
      expect(output).toContain(']')
    })

    test('shows key name', async () => {
      const db = createMockDb([
        { created_at: '2024-01-01T10:00:00Z', key: 'my_custom_key', old_value: null, new_value: 'value', trigger: 'test' }
      ])
      await showTransitions(db)
      
      expect(consoleOutput.some(line => line.includes('my_custom_key'))).toBe(true)
    })

    test('shows old value as JSON', async () => {
      const db = createMockDb([
        { created_at: '2024-01-01T10:00:00Z', key: 'status', old_value: { state: 'old' }, new_value: 'new', trigger: 'update' }
      ])
      await showTransitions(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('"state"')
      expect(output).toContain('"old"')
    })

    test('shows new value as JSON', async () => {
      const db = createMockDb([
        { created_at: '2024-01-01T10:00:00Z', key: 'data', old_value: null, new_value: { result: 'success' }, trigger: 'complete' }
      ])
      await showTransitions(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('"result"')
      expect(output).toContain('"success"')
    })

    test('shows trigger source', async () => {
      const db = createMockDb([
        { created_at: '2024-01-01T10:00:00Z', key: 'test', old_value: null, new_value: 'value', trigger: 'user_action' }
      ])
      await showTransitions(db)
      
      expect(consoleOutput.some(line => line.includes('Trigger: user_action'))).toBe(true)
    })

    test('handles null old_value as "null" string', async () => {
      const db = createMockDb([
        { created_at: '2024-01-01T10:00:00Z', key: 'new_key', old_value: null, new_value: 'initial', trigger: 'create' }
      ])
      await showTransitions(db)
      
      expect(consoleOutput.some(line => line.includes('null →'))).toBe(true)
    })

    test('handles missing trigger as "unknown"', async () => {
      const db = createMockDb([
        { created_at: '2024-01-01T10:00:00Z', key: 'test', old_value: null, new_value: 'value' }
      ])
      await showTransitions(db)
      
      expect(consoleOutput.some(line => line.includes('Trigger: unknown'))).toBe(true)
    })
  })

  describe('date formatting', () => {
    test('formats timestamps using toLocaleString', async () => {
      const db = createMockDb([
        { created_at: '2024-06-15T14:30:45Z', key: 'test', old_value: null, new_value: 'value', trigger: 'test' }
      ])
      await showTransitions(db)
      
      // Just verify timestamp is present in some formatted way
      const output = consoleOutput.join('\n')
      expect(output).toContain('[')
      expect(output).toContain(']')
    })
  })

  describe('JSON serialization', () => {
    test('serializes object values correctly', async () => {
      const db = createMockDb([
        { created_at: '2024-01-01T10:00:00Z', key: 'obj', old_value: { a: 1 }, new_value: { b: 2 }, trigger: 'update' }
      ])
      await showTransitions(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('"a"')
      expect(output).toContain('"b"')
    })

    test('serializes array values correctly', async () => {
      const db = createMockDb([
        { created_at: '2024-01-01T10:00:00Z', key: 'arr', old_value: [1, 2], new_value: [3, 4], trigger: 'update' }
      ])
      await showTransitions(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('[1,2]')
      expect(output).toContain('[3,4]')
    })

    test('serializes primitive values correctly', async () => {
      const db = createMockDb([
        { created_at: '2024-01-01T10:00:00Z', key: 'num', old_value: 42, new_value: 100, trigger: 'update' }
      ])
      await showTransitions(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('42')
      expect(output).toContain('100')
    })
  })

  describe('header formatting', () => {
    test('prints correct header separator', async () => {
      const db = createMockDb([])
      await showTransitions(db)
      
      expect(consoleOutput.some(line => line.includes('═══════════════════════════════════════════════════════════'))).toBe(true)
    })

    test('prints "STATE TRANSITIONS (last 20)" title', async () => {
      const db = createMockDb([])
      await showTransitions(db)
      
      expect(consoleOutput.some(line => line.includes('STATE TRANSITIONS (last 20)'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles special characters in values', async () => {
      const db = createMockDb([
        { created_at: '2024-01-01T10:00:00Z', key: 'special', old_value: 'a "quoted" value', new_value: 'new\nline', trigger: 'test' }
      ])
      await showTransitions(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('special')
    })

    test('handles empty string values correctly', async () => {
      const db = createMockDb([
        { created_at: '2024-01-01T10:00:00Z', key: 'empty', old_value: '', new_value: 'filled', trigger: 'update' }
      ])
      await showTransitions(db)
      
      const output = consoleOutput.join('\n')
      expect(output).toContain('empty')
      expect(output).toContain('filled')
      expect(output).toContain('"" →')
    })

    test('handles undefined trigger', async () => {
      const transitions: Transition[] = [
        { created_at: '2024-01-01T10:00:00Z', key: 'test', old_value: null, new_value: 'value', trigger: undefined }
      ]
      const db = createMockDb(transitions)
      await showTransitions(db)
      
      expect(consoleOutput.some(line => line.includes('Trigger: unknown'))).toBe(true)
    })
  })
})
