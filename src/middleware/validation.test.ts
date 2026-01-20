import { describe, test, expect } from 'bun:test'
import type { AgentResult } from '../components/agents/types.js'
import { validationMiddleware, ValidationError } from './validation.js'

function makeResult(overrides?: Partial<AgentResult>): AgentResult {
  return {
    output: 'ok',
    structured: undefined,
    tokensUsed: { input: 10, output: 5 },
    turnsUsed: 1,
    stopReason: 'completed',
    durationMs: 100,
    ...overrides,
  }
}

describe('ValidationError', () => {
  test('creates error with correct name', () => {
    const error = new ValidationError('test message')
    expect(error.name).toBe('ValidationError')
    expect(error.message).toBe('test message')
  })

  test('is instanceof Error', () => {
    const error = new ValidationError('test')
    expect(error).toBeInstanceOf(Error)
  })

  test('is instanceof ValidationError', () => {
    const error = new ValidationError('test')
    expect(error).toBeInstanceOf(ValidationError)
  })
})

describe('validationMiddleware', () => {
  test('passes valid results through', async () => {
    const middleware = validationMiddleware({
      validate: () => true,
    })

    const result = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ output: 'valid' }),
      options: { prompt: 'test' },
    })

    expect(result?.output).toBe('valid')
  })

  test('throws ValidationError on invalid results', async () => {
    const middleware = validationMiddleware({
      validate: () => false,
    })

    await expect(
      middleware.wrapExecute?.({
        doExecute: async () => makeResult(),
        options: { prompt: 'test' },
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  test('uses default error message', async () => {
    const middleware = validationMiddleware({
      validate: () => false,
    })

    try {
      await middleware.wrapExecute?.({
        doExecute: async () => makeResult(),
        options: { prompt: 'test' },
      })
      expect(true).toBe(false) // Should not reach
    } catch (error) {
      expect((error as ValidationError).message).toBe('Validation failed')
    }
  })

  test('uses custom error message', async () => {
    const middleware = validationMiddleware({
      validate: () => false,
      errorMessage: 'Custom validation error',
    })

    try {
      await middleware.wrapExecute?.({
        doExecute: async () => makeResult(),
        options: { prompt: 'test' },
      })
      expect(true).toBe(false) // Should not reach
    } catch (error) {
      expect((error as ValidationError).message).toBe('Custom validation error')
    }
  })

  test('receives result in validator', async () => {
    let receivedResult: AgentResult | null = null
    const middleware = validationMiddleware({
      validate: (result) => {
        receivedResult = result
        return true
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ output: 'test output' }),
      options: { prompt: 'test' },
    })

    expect(receivedResult?.output).toBe('test output')
  })

  test('validates based on output content', async () => {
    const middleware = validationMiddleware({
      validate: (result) => result.output.includes('success'),
    })

    const validResult = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ output: 'success message' }),
      options: { prompt: 'test' },
    })
    expect(validResult?.output).toBe('success message')

    await expect(
      middleware.wrapExecute?.({
        doExecute: async () => makeResult({ output: 'failure message' }),
        options: { prompt: 'test' },
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  test('validates based on structured data', async () => {
    const middleware = validationMiddleware({
      validate: (result) => result.structured?.status === 'ok',
    })

    const validResult = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ structured: { status: 'ok' } }),
      options: { prompt: 'test' },
    })
    expect(validResult?.structured).toEqual({ status: 'ok' })

    await expect(
      middleware.wrapExecute?.({
        doExecute: async () => makeResult({ structured: { status: 'error' } }),
        options: { prompt: 'test' },
      })
    ).rejects.toBeInstanceOf(ValidationError)
  })

  test('supports async validator', async () => {
    const middleware = validationMiddleware({
      validate: async (result) => {
        await new Promise((r) => setTimeout(r, 10))
        return result.output.length > 0
      },
    })

    const validResult = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ output: 'valid' }),
      options: { prompt: 'test' },
    })
    expect(validResult?.output).toBe('valid')
  })

  test('skips validation when stopReason is error', async () => {
    let validateCalled = false
    const middleware = validationMiddleware({
      validate: () => {
        validateCalled = true
        return false
      },
    })

    const result = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ stopReason: 'error', output: 'error occurred' }),
      options: { prompt: 'test' },
    })

    expect(validateCalled).toBe(false)
    expect(result?.stopReason).toBe('error')
  })

  test('validates when stopReason is completed', async () => {
    let validateCalled = false
    const middleware = validationMiddleware({
      validate: () => {
        validateCalled = true
        return true
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ stopReason: 'completed' }),
      options: { prompt: 'test' },
    })

    expect(validateCalled).toBe(true)
  })

  test('validates when stopReason is stop_condition', async () => {
    let validateCalled = false
    const middleware = validationMiddleware({
      validate: () => {
        validateCalled = true
        return true
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ stopReason: 'stop_condition' }),
      options: { prompt: 'test' },
    })

    expect(validateCalled).toBe(true)
  })

  test('validates when stopReason is cancelled', async () => {
    let validateCalled = false
    const middleware = validationMiddleware({
      validate: () => {
        validateCalled = true
        return true
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ stopReason: 'cancelled' }),
      options: { prompt: 'test' },
    })

    expect(validateCalled).toBe(true)
  })

  test('preserves all result properties', async () => {
    const middleware = validationMiddleware({
      validate: () => true,
    })

    const result = await middleware.wrapExecute?.({
      doExecute: async () =>
        makeResult({
          output: 'test output',
          structured: { data: 'value' },
          tokensUsed: { input: 100, output: 50 },
          turnsUsed: 3,
          stopReason: 'completed',
          durationMs: 500,
          reasoning: 'some reasoning',
        }),
      options: { prompt: 'test' },
    })

    expect(result?.output).toBe('test output')
    expect(result?.structured).toEqual({ data: 'value' })
    expect(result?.tokensUsed).toEqual({ input: 100, output: 50 })
    expect(result?.turnsUsed).toBe(3)
    expect(result?.stopReason).toBe('completed')
    expect(result?.durationMs).toBe(500)
    expect(result?.reasoning).toBe('some reasoning')
  })

  test('has correct middleware name', () => {
    const middleware = validationMiddleware({ validate: () => true })
    expect(middleware.name).toBe('validation')
  })

  test('validator error propagates', async () => {
    const middleware = validationMiddleware({
      validate: () => {
        throw new Error('validator crashed')
      },
    })

    await expect(
      middleware.wrapExecute?.({
        doExecute: async () => makeResult(),
        options: { prompt: 'test' },
      })
    ).rejects.toThrow('validator crashed')
  })

  test('executes doExecute before validation', async () => {
    const order: string[] = []
    const middleware = validationMiddleware({
      validate: () => {
        order.push('validate')
        return true
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => {
        order.push('execute')
        return makeResult()
      },
      options: { prompt: 'test' },
    })

    expect(order).toEqual(['execute', 'validate'])
  })
})
