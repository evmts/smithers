/**
 * Tests for Claude mock utilities
 */

import { describe, it, expect } from 'bun:test'
import { createClaudeMock, createStaticMock, createSequenceMock, type MockResponse } from './claude-mock'

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

    it('should succeed on calls after failure', async () => {
      const mock = createClaudeMock({ delay: 0, failOnCall: 2 })

      await mock('first')
      await expect(mock('second')).rejects.toThrow('Mock failure on call 2')
      const r3 = await mock('third')
      expect(r3.output).toContain('Mock response 3')
    })
  })

  describe('delay behavior', () => {
    it('should respect delay option', async () => {
      const delayMs = 50
      const mock = createClaudeMock({ delay: delayMs })

      const start = performance.now()
      await mock('test')
      const elapsed = performance.now() - start

      expect(elapsed).toBeGreaterThanOrEqual(delayMs - 5) // allow small timing variance
    })

    it('should resolve immediately with zero delay', async () => {
      const mock = createClaudeMock({ delay: 0 })

      const start = performance.now()
      await mock('test')
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(10)
    })
  })

  describe('shape invariants', () => {
    it('should always have model as claude-mock', async () => {
      const mocks = [
        createClaudeMock({ delay: 0 }),
        createStaticMock('test', 0),
        createSequenceMock(['a', 'b'], 0),
      ]

      for (const mock of mocks) {
        const result = await mock('prompt')
        expect(result.model).toBe('claude-mock')
      }
    })

    it('should always have turns as 1', async () => {
      const mocks = [
        createClaudeMock({ delay: 0 }),
        createStaticMock('test', 0),
        createSequenceMock(['a', 'b'], 0),
      ]

      for (const mock of mocks) {
        const result = await mock('prompt')
        expect(result.turns).toBe(1)
      }
    })

    it('should include tokensUsed and durationMs', async () => {
      const mock = createClaudeMock({ delay: 0 })
      const result = await mock('test prompt')

      expect(result.tokensUsed).toEqual({ input: expect.any(Number), output: expect.any(Number) })
      expect(result.durationMs).toEqual(expect.any(Number))
      expect(result.stopReason).toBe('completed')
    })

    it('should satisfy MockResponse interface', async () => {
      const mock = createClaudeMock({ delay: 0 })
      const result: MockResponse = await mock('test')

      expect(result).toMatchObject({
        output: expect.any(String),
        model: 'claude-mock',
        turns: 1,
        tokensUsed: { input: expect.any(Number), output: expect.any(Number) },
        durationMs: expect.any(Number),
        stopReason: 'completed',
      })
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

    it('should work with single item', async () => {
      const mock = createSequenceMock(['only'], 0)

      expect((await mock('_')).output).toBe('only')
      expect((await mock('_')).output).toBe('only')
      expect((await mock('_')).output).toBe('only')
    })

    it('should throw on empty responses array', () => {
      expect(() => createSequenceMock([], 0)).toThrow('createSequenceMock requires at least one response')
    })
  })
})
