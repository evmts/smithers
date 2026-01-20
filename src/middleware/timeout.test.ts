import { describe, test, expect } from 'bun:test'
import type { CLIExecutionOptions } from '../components/agents/types.js'
import { timeoutMiddleware } from './timeout.js'

describe('timeoutMiddleware', () => {
  test('applies base timeout when none specified', async () => {
    const middleware = timeoutMiddleware({ baseTimeout: 5000 })
    const options: CLIExecutionOptions = { prompt: 'test' }

    const transformed = await middleware.transformOptions?.(options)

    expect(transformed?.timeout).toBe(5000)
  })

  test('preserves existing timeout', async () => {
    const middleware = timeoutMiddleware({ baseTimeout: 5000 })
    const options: CLIExecutionOptions = { prompt: 'test', timeout: 10000 }

    const transformed = await middleware.transformOptions?.(options)

    expect(transformed?.timeout).toBe(10000)
  })

  test('applies model multiplier for opus', async () => {
    const middleware = timeoutMiddleware({
      baseTimeout: 1000,
      modelMultipliers: { opus: 2.0, sonnet: 1.0, haiku: 0.5 },
    })
    const options: CLIExecutionOptions = { prompt: 'test', model: 'opus' }

    const transformed = await middleware.transformOptions?.(options)

    expect(transformed?.timeout).toBe(2000)
  })

  test('applies model multiplier for sonnet', async () => {
    const middleware = timeoutMiddleware({
      baseTimeout: 1000,
      modelMultipliers: { opus: 2.0, sonnet: 1.0, haiku: 0.5 },
    })
    const options: CLIExecutionOptions = { prompt: 'test', model: 'sonnet' }

    const transformed = await middleware.transformOptions?.(options)

    expect(transformed?.timeout).toBe(1000)
  })

  test('applies model multiplier for haiku', async () => {
    const middleware = timeoutMiddleware({
      baseTimeout: 1000,
      modelMultipliers: { opus: 2.0, sonnet: 1.0, haiku: 0.5 },
    })
    const options: CLIExecutionOptions = { prompt: 'test', model: 'haiku' }

    const transformed = await middleware.transformOptions?.(options)

    expect(transformed?.timeout).toBe(500)
  })

  test('defaults to sonnet multiplier when no model specified', async () => {
    const middleware = timeoutMiddleware({
      baseTimeout: 1000,
      modelMultipliers: { opus: 2.0, sonnet: 1.0, haiku: 0.5 },
    })
    const options: CLIExecutionOptions = { prompt: 'test' }

    const transformed = await middleware.transformOptions?.(options)

    expect(transformed?.timeout).toBe(1000)
  })

  test('uses multiplier of 1.0 for unknown models', async () => {
    const middleware = timeoutMiddleware({
      baseTimeout: 1000,
      modelMultipliers: { opus: 2.0, sonnet: 1.0 },
    })
    const options: CLIExecutionOptions = { prompt: 'test', model: 'custom-model' }

    const transformed = await middleware.transformOptions?.(options)

    expect(transformed?.timeout).toBe(1000)
  })

  test('adds prompt length factor', async () => {
    const middleware = timeoutMiddleware({
      baseTimeout: 1000,
      promptLengthFactor: 2,
    })
    const options: CLIExecutionOptions = { prompt: 'hello world' } // 11 chars

    const transformed = await middleware.transformOptions?.(options)

    expect(transformed?.timeout).toBe(1022) // 1000 + (11 * 2)
  })

  test('combines model multiplier and prompt length factor', async () => {
    const middleware = timeoutMiddleware({
      baseTimeout: 1000,
      modelMultipliers: { opus: 1.5 },
      promptLengthFactor: 10,
    })
    const options: CLIExecutionOptions = { prompt: 'test', model: 'opus' } // 4 chars

    const transformed = await middleware.transformOptions?.(options)

    // (1000 * 1.5) + (4 * 10) = 1500 + 40 = 1540
    expect(transformed?.timeout).toBe(1540)
  })

  test('handles empty prompt', async () => {
    const middleware = timeoutMiddleware({
      baseTimeout: 1000,
      promptLengthFactor: 10,
    })
    const options: CLIExecutionOptions = { prompt: '' }

    const transformed = await middleware.transformOptions?.(options)

    expect(transformed?.timeout).toBe(1000)
  })

  test('handles undefined prompt gracefully', async () => {
    const middleware = timeoutMiddleware({
      baseTimeout: 1000,
      promptLengthFactor: 10,
    })
    const options = { prompt: undefined } as unknown as CLIExecutionOptions

    const transformed = await middleware.transformOptions?.(options)

    expect(transformed?.timeout).toBe(1000)
  })

  test('uses default values when no options provided', async () => {
    const middleware = timeoutMiddleware({})
    const options: CLIExecutionOptions = { prompt: 'test' }

    const transformed = await middleware.transformOptions?.(options)

    // Default baseTimeout is 300000, default multiplier for sonnet is 1.0, default promptLengthFactor is 0
    expect(transformed?.timeout).toBe(300000)
  })

  test('default model multipliers', async () => {
    const middleware = timeoutMiddleware({ baseTimeout: 1000 })

    const opusResult = await middleware.transformOptions?.({ prompt: 'test', model: 'opus' })
    const sonnetResult = await middleware.transformOptions?.({ prompt: 'test', model: 'sonnet' })
    const haikuResult = await middleware.transformOptions?.({ prompt: 'test', model: 'haiku' })

    expect(opusResult?.timeout).toBe(1500) // 1000 * 1.5
    expect(sonnetResult?.timeout).toBe(1000) // 1000 * 1.0
    expect(haikuResult?.timeout).toBe(500) // 1000 * 0.5
  })

  test('has correct middleware name', () => {
    const middleware = timeoutMiddleware({})
    expect(middleware.name).toBe('timeout-adjustment')
  })

  test('preserves other options', async () => {
    const middleware = timeoutMiddleware({ baseTimeout: 5000 })
    const options: CLIExecutionOptions = {
      prompt: 'test',
      model: 'sonnet',
      maxTurns: 5,
      systemPrompt: 'You are helpful',
    }

    const transformed = await middleware.transformOptions?.(options)

    expect(transformed?.prompt).toBe('test')
    expect(transformed?.model).toBe('sonnet')
    expect(transformed?.maxTurns).toBe(5)
    expect(transformed?.systemPrompt).toBe('You are helpful')
  })

  describe('edge cases', () => {
    test('handles zero base timeout', async () => {
      const middleware = timeoutMiddleware({ baseTimeout: 0 })
      const options: CLIExecutionOptions = { prompt: 'test' }

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(0)
    })

    test('handles negative base timeout', async () => {
      const middleware = timeoutMiddleware({ baseTimeout: -1000 })
      const options: CLIExecutionOptions = { prompt: 'test' }

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(-1000)
    })

    test('handles zero multipliers', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        modelMultipliers: { haiku: 0 },
      })
      const options: CLIExecutionOptions = { prompt: 'test', model: 'haiku' }

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(0)
    })

    test('handles negative multipliers', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        modelMultipliers: { haiku: -0.5 },
      })
      const options: CLIExecutionOptions = { prompt: 'test', model: 'haiku' }

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(-500)
    })

    test('handles very large multipliers', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        modelMultipliers: { opus: 999999 },
      })
      const options: CLIExecutionOptions = { prompt: 'test', model: 'opus' }

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(999999000)
    })

    test('handles fractional multipliers', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        modelMultipliers: { sonnet: 1.7 },
      })
      const options: CLIExecutionOptions = { prompt: 'test', model: 'sonnet' }

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(1700)
    })

    test('handles very small fractional multipliers', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        modelMultipliers: { haiku: 0.001 },
      })
      const options: CLIExecutionOptions = { prompt: 'test', model: 'haiku' }

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(1)
    })

    test('handles zero prompt length factor', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        promptLengthFactor: 0,
      })
      const options: CLIExecutionOptions = { prompt: 'this is a very long prompt with many characters' }

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(1000)
    })

    test('handles negative prompt length factor', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        promptLengthFactor: -10,
      })
      const options: CLIExecutionOptions = { prompt: 'test' } // 4 chars

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(960) // 1000 + (4 * -10)
    })

    test('handles very large prompt length factor', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        promptLengthFactor: 100000,
      })
      const options: CLIExecutionOptions = { prompt: 'test' } // 4 chars

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(401000) // 1000 + (4 * 100000)
    })

    test('handles fractional prompt length factor', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        promptLengthFactor: 0.5,
      })
      const options: CLIExecutionOptions = { prompt: 'hello world!' } // 12 chars

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(1006) // 1000 + (12 * 0.5)
    })

    test('handles very long prompts', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        promptLengthFactor: 1,
      })
      const veryLongPrompt = 'A'.repeat(100000)
      const options: CLIExecutionOptions = { prompt: veryLongPrompt }

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(101000) // 1000 + (100000 * 1)
    })

    test('handles prompts with special characters', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        promptLengthFactor: 2,
      })
      const options: CLIExecutionOptions = { prompt: 'Hello 世界! 🌍 "quotes" \n newlines \t tabs' }

      const transformed = await middleware.transformOptions?.(options)

      // Should count all characters including unicode and special chars
      const promptLength = options.prompt.length
      expect(transformed?.timeout).toBe(1000 + (promptLength * 2))
    })

    test('handles empty model multipliers object', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        modelMultipliers: {},
      })
      const options: CLIExecutionOptions = { prompt: 'test', model: 'opus' }

      const transformed = await middleware.transformOptions?.(options)

      // Should fall back to 1.0 multiplier
      expect(transformed?.timeout).toBe(1000)
    })

    test('handles null/undefined model in multipliers', async () => {
      const middleware = timeoutMiddleware({
        baseTimeout: 1000,
        modelMultipliers: { null: 2.0, undefined: 3.0 } as any,
      })
      const options1: CLIExecutionOptions = { prompt: 'test', model: null as any }
      const options2: CLIExecutionOptions = { prompt: 'test', model: undefined }

      const transformed1 = await middleware.transformOptions?.(options1)
      const transformed2 = await middleware.transformOptions?.(options2)

      // Should handle these edge cases gracefully
      expect(transformed1?.timeout).toBeGreaterThanOrEqual(1000)
      expect(transformed2?.timeout).toBeGreaterThanOrEqual(1000)
    })

    test('preserves timeout of zero when explicitly set', async () => {
      const middleware = timeoutMiddleware({ baseTimeout: 5000 })
      const options: CLIExecutionOptions = { prompt: 'test', timeout: 0 }

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(0)
    })

    test('preserves negative timeout when explicitly set', async () => {
      const middleware = timeoutMiddleware({ baseTimeout: 5000 })
      const options: CLIExecutionOptions = { prompt: 'test', timeout: -1 }

      const transformed = await middleware.transformOptions?.(options)

      expect(transformed?.timeout).toBe(-1)
    })
  })
})
