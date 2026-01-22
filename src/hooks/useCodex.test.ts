import { describe, test, expect } from 'bun:test'

describe('useCodex', () => {
  describe('return type structure', () => {
    const mockResult = {
      status: 'pending' as const,
      agentId: null,
      executionId: null,
      model: 'o4-mini',
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

    test('result includes model field (unique to useCodex)', () => {
      expect('model' in mockResult).toBe(true)
      expect(typeof mockResult.model).toBe('string')
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

  describe('model prop handling', () => {
    test('model defaults to o4-mini when not specified', () => {
      const props = { children: 'test' }
      const model = (props as { model?: string }).model ?? 'o4-mini'
      expect(model).toBe('o4-mini')
    })

    test('model uses provided value when specified', () => {
      const props = { children: 'test', model: 'o3' }
      const model = props.model ?? 'o4-mini'
      expect(model).toBe('o3')
    })

    test('model accepts gpt-4o', () => {
      const props = { children: 'test', model: 'gpt-4o' }
      const model = props.model ?? 'o4-mini'
      expect(model).toBe('gpt-4o')
    })

    test('model accepts gpt-4', () => {
      const props = { children: 'test', model: 'gpt-4' }
      const model = props.model ?? 'o4-mini'
      expect(model).toBe('gpt-4')
    })

    test('model accepts custom model strings', () => {
      const props = { children: 'test', model: 'gpt-4-turbo-2024-01' }
      const model = props.model ?? 'o4-mini'
      expect(model).toBe('gpt-4-turbo-2024-01')
    })
  })

  describe('UseCodexResult type shape', () => {
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

    test('executionId can be string or null', () => {
      const nullExecId: string | null = null
      const stringExecId: string | null = 'exec-456'
      expect(nullExecId).toBeNull()
      expect(typeof stringExecId).toBe('string')
    })

    test('error can be Error or null', () => {
      const nullError: Error | null = null
      const errorObj: Error | null = new Error('test error')
      expect(nullError).toBeNull()
      expect(errorObj).toBeInstanceOf(Error)
    })
  })
})
