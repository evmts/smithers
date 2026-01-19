import { describe, test, expect } from 'bun:test'
import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import { composeMiddleware } from './compose.js'
import { applyMiddleware } from './apply.js'
import { cachingMiddleware, LRUCache } from './caching.js'
import { retryMiddleware } from './retry.js'
import { rateLimitingMiddleware } from './rate-limiting.js'
import { costTrackingMiddleware } from './cost-tracking.js'
import { redactSecretsMiddleware } from './redact-secrets.js'
import { timeoutMiddleware } from './timeout.js'
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

describe('middleware composition', () => {
  test('composeMiddleware preserves execution order', async () => {
    const order: string[] = []

    const first = {
      name: 'first',
      transformOptions: async (opts: CLIExecutionOptions) => {
        order.push('transformOptions:first')
        return { ...opts, model: 'haiku' }
      },
      wrapExecute: async (doExecute: () => Promise<AgentResult>) => {
        order.push('wrapExecute:first:before')
        const result = await doExecute()
        order.push('wrapExecute:first:after')
        return result
      },
      transformChunk: (chunk: string) => {
        order.push('transformChunk:first')
        return `${chunk}-a`
      },
      transformResult: async (result: AgentResult) => {
        order.push('transformResult:first')
        return { ...result, output: `${result.output}-a` }
      },
    }

    const second = {
      name: 'second',
      transformOptions: async (opts: CLIExecutionOptions) => {
        order.push('transformOptions:second')
        return { ...opts, timeout: 1234 }
      },
      wrapExecute: async (doExecute: () => Promise<AgentResult>) => {
        order.push('wrapExecute:second:before')
        const result = await doExecute()
        order.push('wrapExecute:second:after')
        return result
      },
      transformChunk: (chunk: string) => {
        order.push('transformChunk:second')
        return `${chunk}-b`
      },
      transformResult: async (result: AgentResult) => {
        order.push('transformResult:second')
        return { ...result, output: `${result.output}-b` }
      },
    }

    const composed = composeMiddleware(first, second)
    const options: CLIExecutionOptions = { prompt: 'test' }
    const transformed = await composed.transformOptions?.(options)
    expect(transformed?.model).toBe('haiku')
    expect(transformed?.timeout).toBe(1234)

    const onExecute = async () => {
      order.push('execute')
      return makeResult()
    }

    await composed.wrapExecute?.(onExecute, options)

    const chunk = composed.transformChunk?.('chunk') ?? 'chunk'
    expect(chunk).toBe('chunk-a-b')

    const finalResult = await composed.transformResult?.(makeResult({ output: 'done' }))
    expect(finalResult?.output).toBe('done-a-b')

    expect(order).toEqual([
      'transformOptions:first',
      'transformOptions:second',
      'wrapExecute:first:before',
      'wrapExecute:second:before',
      'execute',
      'wrapExecute:second:after',
      'wrapExecute:first:after',
      'transformChunk:first',
      'transformChunk:second',
      'transformResult:first',
      'transformResult:second',
    ])
  })

  test('applyMiddleware uses composed middleware', async () => {
    const stack = composeMiddleware({
      name: 'apply-test',
      transformOptions: (opts: CLIExecutionOptions) => ({ ...opts, maxTurns: 2 }),
      transformResult: (result: AgentResult) => ({ ...result, output: `${result.output}-x` }),
    })

    const options: CLIExecutionOptions = { prompt: 'apply' }
    const result = await applyMiddleware(
      async () => makeResult({ output: 'base' }),
      options,
      [stack],
    )

    expect(options.maxTurns).toBe(2)
    expect(result.output).toBe('base-x')
  })
})

describe('built-in middleware', () => {
  test('cachingMiddleware caches results', async () => {
    const cache = new LRUCache({ max: 2 })
    const middleware = cachingMiddleware({ cache })
    const options: CLIExecutionOptions = { prompt: 'cache' }
    let calls = 0

    const execute = async () => {
      calls += 1
      return makeResult({ output: `run-${calls}` })
    }

    const first = await middleware.wrapExecute?.(execute, options)
    const second = await middleware.wrapExecute?.(execute, options)

    expect(calls).toBe(1)
    expect(first?.output).toBe('run-1')
    expect(second?.output).toBe('run-1')
  })

  test('retryMiddleware retries failures', async () => {
    const middleware = retryMiddleware({ maxRetries: 2, baseDelay: 0, backoff: 'constant' })
    let attempts = 0

    const execute = async () => {
      attempts += 1
      if (attempts < 3) {
        throw new Error('boom')
      }
      return makeResult({ output: 'recovered' })
    }

    const result = await middleware.wrapExecute?.(execute, { prompt: 'retry' })
    expect(attempts).toBe(3)
    expect(result?.output).toBe('recovered')
  })

  test('rateLimitingMiddleware passes through results', async () => {
    const middleware = rateLimitingMiddleware({ requestsPerMinute: 1000 })
    const result = await middleware.wrapExecute?.(
      async () => makeResult({ output: 'rate' }),
      { prompt: 'rate' },
    )
    expect(result?.output).toBe('rate')
  })

  test('costTrackingMiddleware reports costs', async () => {
    let lastTotal = 0
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        lastTotal = cost.total
      },
      pricing: {
        sonnet: { input: 0.01, output: 0.02 },
      },
    })

    const result = await middleware.wrapExecute?.(
      async () => makeResult({ tokensUsed: { input: 1000, output: 2000 } }),
      { prompt: 'cost', model: 'sonnet' },
    )

    expect(result?.output).toBe('ok')
    expect(lastTotal).toBeCloseTo(0.05)
  })

  test('redactSecretsMiddleware replaces matches', () => {
    const middleware = redactSecretsMiddleware()
    const chunk = 'token sk-1234567890123456789012345678901234567890123456 end'
    const redacted = middleware.transformChunk?.(chunk)
    expect(redacted).toContain('***REDACTED***')
  })

  test('timeoutMiddleware applies defaults', async () => {
    const middleware = timeoutMiddleware({ baseTimeout: 1000, promptLengthFactor: 2 })
    const options: CLIExecutionOptions = { prompt: 'abcd', model: 'sonnet' }
    const transformed = await middleware.transformOptions?.(options)
    expect(transformed?.timeout).toBe(1008)
  })

  test('validationMiddleware throws on invalid result', async () => {
    const middleware = validationMiddleware({
      validate: () => false,
    })
    let caught: Error | null = null

    try {
      await middleware.wrapExecute?.(async () => makeResult(), { prompt: 'validate' })
    } catch (error) {
      caught = error as Error
    }

    expect(caught).toBeInstanceOf(ValidationError)
  })
})
