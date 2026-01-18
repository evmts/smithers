/**
 * Tests for stop conditions checker
 */

import { describe, test, expect } from 'bun:test'
import { checkStopConditions } from './stop-conditions.js'
import type { StopCondition, AgentResult } from '../types.js'

describe('checkStopConditions', () => {
  describe('undefined or empty conditions', () => {
    test('returns shouldStop: false for undefined conditions', () => {
      const result = checkStopConditions(undefined, { output: 'test' })
      expect(result.shouldStop).toBe(false)
      expect(result.reason).toBeUndefined()
    })

    test('returns shouldStop: false for empty conditions array', () => {
      const result = checkStopConditions([], { output: 'test' })
      expect(result.shouldStop).toBe(false)
      expect(result.reason).toBeUndefined()
    })
  })

  describe('token_limit', () => {
    test('triggers when exactly at limit', () => {
      const conditions: StopCondition[] = [
        { type: 'token_limit', value: 100 }
      ]
      const partialResult = {
        tokensUsed: { input: 50, output: 50 }
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('100')
    })

    test('triggers when over limit', () => {
      const conditions: StopCondition[] = [
        { type: 'token_limit', value: 100 }
      ]
      const partialResult = {
        tokensUsed: { input: 80, output: 50 }
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
    })

    test('does not trigger when under limit', () => {
      const conditions: StopCondition[] = [
        { type: 'token_limit', value: 100 }
      ]
      const partialResult = {
        tokensUsed: { input: 30, output: 30 }
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })

    test('uses custom message when provided', () => {
      const conditions: StopCondition[] = [
        { type: 'token_limit', value: 100, message: 'Custom token message' }
      ]
      const partialResult = {
        tokensUsed: { input: 60, output: 60 }
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toBe('Custom token message')
    })

    test('defaults to 0 + 0 when tokensUsed is undefined', () => {
      const conditions: StopCondition[] = [
        { type: 'token_limit', value: 1 }
      ]
      const partialResult = {
        output: 'test'
      }

      // tokensUsed is undefined, so total is 0 + 0 = 0
      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })

    test('handles partial tokensUsed (only input defined)', () => {
      const conditions: StopCondition[] = [
        { type: 'token_limit', value: 50 }
      ]
      const partialResult = {
        tokensUsed: { input: 60 } as any
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
    })
  })

  describe('time_limit', () => {
    test('triggers when exactly at limit', () => {
      const conditions: StopCondition[] = [
        { type: 'time_limit', value: 5000 }
      ]
      const partialResult = {
        durationMs: 5000
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('5000')
    })

    test('triggers when over limit', () => {
      const conditions: StopCondition[] = [
        { type: 'time_limit', value: 5000 }
      ]
      const partialResult = {
        durationMs: 6000
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
    })

    test('does not trigger when under limit', () => {
      const conditions: StopCondition[] = [
        { type: 'time_limit', value: 5000 }
      ]
      const partialResult = {
        durationMs: 3000
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })

    test('defaults to 0 when durationMs is undefined', () => {
      const conditions: StopCondition[] = [
        { type: 'time_limit', value: 1000 }
      ]
      const partialResult = {
        output: 'test'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })

    test('uses custom message when provided', () => {
      const conditions: StopCondition[] = [
        { type: 'time_limit', value: 1000, message: 'Timeout reached' }
      ]
      const partialResult = {
        durationMs: 2000
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.reason).toBe('Timeout reached')
    })
  })

  describe('turn_limit', () => {
    test('triggers when exactly at limit', () => {
      const conditions: StopCondition[] = [
        { type: 'turn_limit', value: 5 }
      ]
      const partialResult = {
        turnsUsed: 5
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('5')
    })

    test('triggers when over limit', () => {
      const conditions: StopCondition[] = [
        { type: 'turn_limit', value: 5 }
      ]
      const partialResult = {
        turnsUsed: 7
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
    })

    test('does not trigger when under limit', () => {
      const conditions: StopCondition[] = [
        { type: 'turn_limit', value: 5 }
      ]
      const partialResult = {
        turnsUsed: 3
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })

    test('defaults to 0 when turnsUsed is undefined', () => {
      const conditions: StopCondition[] = [
        { type: 'turn_limit', value: 1 }
      ]
      const partialResult = {
        output: 'test'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })

    test('uses custom message when provided', () => {
      const conditions: StopCondition[] = [
        { type: 'turn_limit', value: 3, message: 'Max turns reached' }
      ]
      const partialResult = {
        turnsUsed: 3
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.reason).toBe('Max turns reached')
    })
  })

  describe('pattern', () => {
    test('triggers when RegExp matches output', () => {
      const conditions: StopCondition[] = [
        { type: 'pattern', value: /DONE|COMPLETE/i }
      ]
      const partialResult = {
        output: 'Task is DONE'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
    })

    test('triggers when string pattern matches', () => {
      const conditions: StopCondition[] = [
        { type: 'pattern', value: 'SUCCESS' }
      ]
      const partialResult = {
        output: 'Operation SUCCESS completed'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
    })

    test('converts string to RegExp', () => {
      const conditions: StopCondition[] = [
        { type: 'pattern', value: 'error|fail' }
      ]
      const partialResult = {
        output: 'This is an error'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
    })

    test('does not trigger when pattern does not match', () => {
      const conditions: StopCondition[] = [
        { type: 'pattern', value: /FINISHED/ }
      ]
      const partialResult = {
        output: 'Still processing'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })

    test('handles undefined output gracefully', () => {
      const conditions: StopCondition[] = [
        { type: 'pattern', value: /test/ }
      ]
      const partialResult = {}

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })

    test('uses custom message when provided', () => {
      const conditions: StopCondition[] = [
        { type: 'pattern', value: /STOP/, message: 'Stop signal detected' }
      ]
      const partialResult = {
        output: 'Please STOP now'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.reason).toBe('Stop signal detected')
    })

    test('default message includes pattern', () => {
      const conditions: StopCondition[] = [
        { type: 'pattern', value: /done/i }
      ]
      const partialResult = {
        output: 'Done!'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.reason).toContain('Pattern matched')
    })
  })

  describe('custom', () => {
    test('triggers when function returns true', () => {
      const conditions: StopCondition[] = [
        {
          type: 'custom',
          fn: (result: AgentResult) => result.output.includes('HALT')
        }
      ]
      const partialResult = {
        output: 'Please HALT execution'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
    })

    test('does not trigger when function returns false', () => {
      const conditions: StopCondition[] = [
        {
          type: 'custom',
          fn: (result: AgentResult) => result.turnsUsed > 10
        }
      ]
      const partialResult = {
        output: 'test',
        turnsUsed: 5
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })

    test('skips check when output is undefined', () => {
      const conditions: StopCondition[] = [
        {
          type: 'custom',
          fn: (result: AgentResult) => true
        }
      ]
      const partialResult = {}

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })

    test('uses custom message when provided', () => {
      const conditions: StopCondition[] = [
        {
          type: 'custom',
          fn: () => true,
          message: 'Custom condition met'
        }
      ]
      const partialResult = {
        output: 'test'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.reason).toBe('Custom condition met')
    })

    test('uses default message when no custom message', () => {
      const conditions: StopCondition[] = [
        {
          type: 'custom',
          fn: () => true
        }
      ]
      const partialResult = {
        output: 'test'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.reason).toBe('Custom stop condition met')
    })

    test('fn receives a complete AgentResult with defaults', () => {
      let receivedResult: AgentResult | null = null
      const conditions: StopCondition[] = [
        {
          type: 'custom',
          fn: (result: AgentResult) => {
            receivedResult = result
            return false
          }
        }
      ]
      const partialResult = {
        output: 'test output'
      }

      checkStopConditions(conditions, partialResult)

      expect(receivedResult).not.toBeNull()
      expect(receivedResult!.output).toBe('test output')
      expect(receivedResult!.tokensUsed).toEqual({ input: 0, output: 0 })
      expect(receivedResult!.turnsUsed).toBe(0)
      expect(receivedResult!.stopReason).toBe('completed')
      expect(receivedResult!.durationMs).toBe(0)
    })
  })

  describe('multiple conditions', () => {
    test('first matching condition wins', () => {
      const conditions: StopCondition[] = [
        { type: 'token_limit', value: 100, message: 'Token limit' },
        { type: 'pattern', value: /DONE/, message: 'Pattern match' },
        { type: 'time_limit', value: 1000, message: 'Time limit' }
      ]
      const partialResult = {
        output: 'Task is DONE',
        tokensUsed: { input: 60, output: 60 },
        durationMs: 2000
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
      // Token limit is checked first and triggers
      expect(result.reason).toBe('Token limit')
    })

    test('returns first matching even if multiple would match', () => {
      const conditions: StopCondition[] = [
        { type: 'turn_limit', value: 5, message: 'Turn limit' },
        { type: 'token_limit', value: 100, message: 'Token limit' }
      ]
      const partialResult = {
        turnsUsed: 10,
        tokensUsed: { input: 100, output: 100 }
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.reason).toBe('Turn limit')
    })

    test('continues checking if earlier conditions do not match', () => {
      const conditions: StopCondition[] = [
        { type: 'token_limit', value: 1000, message: 'Token limit' },
        { type: 'pattern', value: /DONE/, message: 'Pattern match' }
      ]
      const partialResult = {
        output: 'Task is DONE',
        tokensUsed: { input: 50, output: 50 }
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toBe('Pattern match')
    })

    test('returns shouldStop: false if no conditions match', () => {
      const conditions: StopCondition[] = [
        { type: 'token_limit', value: 1000 },
        { type: 'time_limit', value: 10000 },
        { type: 'turn_limit', value: 50 }
      ]
      const partialResult = {
        tokensUsed: { input: 100, output: 100 },
        durationMs: 1000,
        turnsUsed: 5
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })
  })

  describe('edge cases', () => {
    test('handles value being undefined for numeric conditions', () => {
      const conditions: StopCondition[] = [
        { type: 'token_limit' } // value is undefined
      ]
      const partialResult = {
        tokensUsed: { input: 1000, output: 1000 }
      }

      const result = checkStopConditions(conditions, partialResult)
      // Should not trigger since value is undefined (typeof check fails)
      expect(result.shouldStop).toBe(false)
    })

    test('handles condition without fn for custom type', () => {
      const conditions: StopCondition[] = [
        { type: 'custom' } // fn is undefined
      ]
      const partialResult = {
        output: 'test'
      }

      const result = checkStopConditions(conditions, partialResult)
      expect(result.shouldStop).toBe(false)
    })

    test('handles non-number value for numeric conditions', () => {
      const conditions: StopCondition[] = [
        { type: 'token_limit', value: 'not a number' as any }
      ]
      const partialResult = {
        tokensUsed: { input: 100, output: 100 }
      }

      const result = checkStopConditions(conditions, partialResult)
      // typeof check should fail
      expect(result.shouldStop).toBe(false)
    })
  })
})
