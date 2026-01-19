import { describe, test, expect } from 'bun:test'
import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import { composeMiddleware, applyMiddleware } from './compose.js'
import { cachingMiddleware, LRUCache } from './caching.js'
import { retryMiddleware } from './retry.js'
import { rateLimitingMiddleware } from './rate-limiting.js'
import { costTrackingMiddleware } from './cost-tracking.js'
import { redactSecretsMiddleware } from './redact-secrets.js'
import { timeoutMiddleware } from './timeout.js'
import { validationMiddleware, ValidationError } from './validation.js'
import { loggingMiddleware } from './logging.js'
import { extractReasoningMiddleware } from './extract-reasoning.js'
import { extractJsonMiddleware } from './extract-json.js'

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
      wrapExecute: async ({ doExecute }: { doExecute: () => Promise<AgentResult> }) => {
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
      wrapExecute: async ({ doExecute }: { doExecute: () => Promise<AgentResult> }) => {
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

    await composed.wrapExecute?.({ doExecute: onExecute, options })

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

    const first = await middleware.wrapExecute?.({ doExecute: execute, options })
    const second = await middleware.wrapExecute?.({ doExecute: execute, options })

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

    const result = await middleware.wrapExecute?.({ doExecute: execute, options: { prompt: 'retry' } })
    expect(attempts).toBe(3)
    expect(result?.output).toBe('recovered')
  })

  test('rateLimitingMiddleware passes through results', async () => {
    const middleware = rateLimitingMiddleware({ requestsPerMinute: 1000 })
    const result = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ output: 'rate' }),
      options: { prompt: 'rate' },
    })
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

    const result = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 1000, output: 2000 } }),
      options: { prompt: 'cost', model: 'sonnet' },
    })

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
      await middleware.wrapExecute?.({
        doExecute: async () => makeResult(),
        options: { prompt: 'test' },
      })
    } catch (error) {
      caught = error as Error
    }

    expect(caught).toBeInstanceOf(ValidationError)
  })

  test('loggingMiddleware logs start and finish', async () => {
    const logs: Array<{ phase: string }> = []
    const middleware = loggingMiddleware({
      logFn: (entry) => logs.push({ phase: entry.phase }),
    })

    await middleware.transformOptions?.({ prompt: 'test' })
    await middleware.wrapExecute?.({
      doExecute: async () => makeResult(),
      options: { prompt: 'test' },
    })

    expect(logs).toEqual([{ phase: 'start' }, { phase: 'finish' }])
  })

  test('loggingMiddleware logs errors', async () => {
    const logs: Array<{ phase: string; error?: string }> = []
    const middleware = loggingMiddleware({
      logFn: (entry) => logs.push({ phase: entry.phase, error: entry.error }),
    })

    try {
      await middleware.wrapExecute?.({
        doExecute: async () => {
          throw new Error('boom')
        },
        options: { prompt: 'test' },
      })
    } catch {
      // expected
    }

    expect(logs).toEqual([{ phase: 'error', error: 'boom' }])
  })

  test('extractReasoningMiddleware extracts tagged content', () => {
    const middleware = extractReasoningMiddleware({ tagName: 'thinking' })
    const result = middleware.transformResult?.(
      makeResult({ output: '<thinking>step 1</thinking>answer here' })
    )

    expect(result?.reasoning).toBe('step 1')
    expect(result?.output).toBe('answer here')
  })

  test('extractReasoningMiddleware calls onReasoning callback', () => {
    let captured = ''
    const middleware = extractReasoningMiddleware({
      tagName: 'think',
      onReasoning: (r) => { captured = r },
    })

    middleware.transformResult?.(makeResult({ output: '<think>my thoughts</think>final' }))
    expect(captured).toBe('my thoughts')
  })

  test('extractJsonMiddleware extracts JSON from output', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: 'Here is the result:\n```json\n{"key":"value"}\n```' })
    )

    expect(result?.structured).toEqual({ key: 'value' })
  })

  test('extractJsonMiddleware handles invalid JSON gracefully', () => {
    const middleware = extractJsonMiddleware()
    const result = middleware.transformResult?.(
      makeResult({ output: 'Here is the result:\n```json\n{invalid}\n```' })
    )

    expect(result?.structured).toBeUndefined()
  })

  test('LRUCache expires entries after TTL', async () => {
    const cache = new LRUCache<string>({ max: 10 })
    cache.set('key', 'value', 0.05) // 50ms TTL

    expect(cache.get('key')).toBe('value')
    await new Promise((r) => setTimeout(r, 60))
    expect(cache.get('key')).toBeNull()
  })

  test('LRUCache evicts oldest entry when full', () => {
    const cache = new LRUCache<string>({ max: 2 })
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('c', '3')

    expect(cache.get('a')).toBeNull()
    expect(cache.get('b')).toBe('2')
    expect(cache.get('c')).toBe('3')
  })
})
