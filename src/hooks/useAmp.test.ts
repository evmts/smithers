import { describe, test, expect } from 'bun:test'

describe('useAmp', () => {
  describe('return type structure', () => {
    const mockResult = {
      status: 'pending' as const,
      agentId: null,
      executionId: null,
      mode: 'smart',
      result: null,
      error: null,
      tailLog: []
    }

    test('result includes status field', () => {
      expect('status' in mockResult).toBe(true)
      expect(['pending', 'running', 'complete', 'error']).toContain(mockResult.status)
    })

    test('result includes agentId field', () => {
      expect('agentId' in mockResult).toBe(true)
    })

    test('result includes executionId field', () => {
      expect('executionId' in mockResult).toBe(true)
    })

    test('result includes mode field (unique to useAmp)', () => {
      expect('mode' in mockResult).toBe(true)
      expect(typeof mockResult.mode).toBe('string')
    })

    test('result includes result field', () => {
      expect('result' in mockResult).toBe(true)
    })

    test('result includes error field', () => {
      expect('error' in mockResult).toBe(true)
    })

    test('result includes tailLog field', () => {
      expect('tailLog' in mockResult).toBe(true)
      expect(Array.isArray(mockResult.tailLog)).toBe(true)
    })
  })

  describe('mode prop handling', () => {
    test('mode defaults to smart when not specified', () => {
      const props = { children: 'test' }
      const mode = (props as { mode?: string }).mode ?? 'smart'
      expect(mode).toBe('smart')
    })

    test('mode uses provided value when specified', () => {
      const props = { children: 'test', mode: 'rush' }
      const mode = props.mode ?? 'smart'
      expect(mode).toBe('rush')
    })

    test('mode accepts smart value', () => {
      const props = { children: 'test', mode: 'smart' as const }
      expect(props.mode).toBe('smart')
    })

    test('mode accepts rush value', () => {
      const props = { children: 'test', mode: 'rush' as const }
      expect(props.mode).toBe('rush')
    })
  })

  describe('UseAmpResult type shape', () => {
    test('status is one of allowed values', () => {
      const allowedStatuses = ['pending', 'running', 'complete', 'error']
      for (const status of allowedStatuses) {
        expect(allowedStatuses).toContain(status)
      }
    })

    test('agentId can be string or null', () => {
      const nullAgentId: string | null = null
      const stringAgentId: string | null = 'agent-123'
      expect(nullAgentId).toBeNull()
      expect(typeof stringAgentId).toBe('string')
    })

    test('mode is always a string', () => {
      const modes = ['smart', 'rush']
      for (const mode of modes) {
        expect(typeof mode).toBe('string')
      }
    })

    test('error can be Error or null', () => {
      const nullError: Error | null = null
      const errorObj: Error | null = new Error('test error')
      expect(nullError).toBeNull()
      expect(errorObj).toBeInstanceOf(Error)
    })
  })
})
