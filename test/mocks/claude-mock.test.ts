/**
 * Tests for Claude mock utilities
 */

import { describe, it, expect } from 'vitest'
import { createClaudeMock, createStaticMock, createSequenceMock } from './claude-mock'

describe('Claude Mock Utilities', () => {
  describe('createClaudeMock', () => {
    it('should return mock response with prompt snippet', async () => {
      const mock = createClaudeMock({ delay: 0 })
      const response = await mock('Hello world')

      expect(response.output).toContain('Mock response 1')
      expect(response.output).toContain('Hello world')
      expect(response.model).toBe('claude-mock')
      expect(response.turns).toBe(1)
    })

    it('should increment call count', async () => {
      const mock = createClaudeMock({ delay: 0 })

      const r1 = await mock('first')
      const r2 = await mock('second')

      expect(r1.output).toContain('Mock response 1')
      expect(r2.output).toContain('Mock response 2')
    })

    it('should use custom responses when provided', async () => {
      const mock = createClaudeMock({
        delay: 0,
        responses: ['custom 1', 'custom 2'],
      })

      const r1 = await mock('ignored')
      const r2 = await mock('ignored')

      expect(r1.output).toBe('custom 1')
      expect(r2.output).toBe('custom 2')
    })

    it('should fail on specific call when configured', async () => {
      const mock = createClaudeMock({ delay: 0, failOnCall: 2 })

      await expect(mock('first')).resolves.toBeDefined()
      await expect(mock('second')).rejects.toThrow('Mock failure on call 2')
    })
  })

  describe('createStaticMock', () => {
    it('should always return the same response', async () => {
      const mock = createStaticMock('static response', 0)

      const r1 = await mock('any prompt')
      const r2 = await mock('different prompt')

      expect(r1.output).toBe('static response')
      expect(r2.output).toBe('static response')
      expect(r1.model).toBe('claude-mock')
    })
  })

  describe('createSequenceMock', () => {
    it('should return responses in sequence', async () => {
      const mock = createSequenceMock(['first', 'second', 'third'], 0)

      expect((await mock('_')).output).toBe('first')
      expect((await mock('_')).output).toBe('second')
      expect((await mock('_')).output).toBe('third')
    })

    it('should wrap around when sequence exhausted', async () => {
      const mock = createSequenceMock(['a', 'b'], 0)

      expect((await mock('_')).output).toBe('a')
      expect((await mock('_')).output).toBe('b')
      expect((await mock('_')).output).toBe('a') // wraps
      expect((await mock('_')).output).toBe('b')
    })
  })
})
