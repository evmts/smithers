import { describe, test, expect } from 'bun:test'
import type { AgentResult } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'
import { composeMiddleware } from './compose.js'

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

describe('composeMiddleware', () => {
  test('returns empty object for no middleware', () => {
    const composed = composeMiddleware()
    expect(composed).toEqual({})
  })

  test('returns empty object for null/undefined middleware', () => {
    const composed = composeMiddleware(null, undefined, null)
    expect(composed).toEqual({})
  })

  test('filters out null and undefined middleware', () => {
    const mw: SmithersMiddleware = {
      name: 'test',
      transformResult: (r) => ({ ...r, output: 'modified' }),
    }
    const composed = composeMiddleware(null, mw, undefined)

    expect(composed.name).toBe('test')
  })

  test('combines middleware names with +', () => {
    const first: SmithersMiddleware = { name: 'first' }
    const second: SmithersMiddleware = { name: 'second' }
    const third: SmithersMiddleware = { name: 'third' }

    const composed = composeMiddleware(first, second, third)
    expect(composed.name).toBe('first+second+third')
  })

  test('skips unnamed middleware in name composition', () => {
    const first: SmithersMiddleware = { name: 'first' }
    const second: SmithersMiddleware = {}
    const third: SmithersMiddleware = { name: 'third' }

    const composed = composeMiddleware(first, second, third)
    expect(composed.name).toBe('first+third')
  })

  describe('transformOptions', () => {
    test('chains transformOptions in order', async () => {
      const first: SmithersMiddleware = {
        transformOptions: async (opts) => ({ ...opts, model: 'haiku' }),
      }
      const second: SmithersMiddleware = {
        transformOptions: async (opts) => ({ ...opts, maxTurns: 5 }),
      }

      const composed = composeMiddleware(first, second)
      const result = await composed.transformOptions?.({ prompt: 'test' })

      expect(result?.model).toBe('haiku')
      expect(result?.maxTurns).toBe(5)
    })

    test('later middleware can override earlier transformations', async () => {
      const first: SmithersMiddleware = {
        transformOptions: async (opts) => ({ ...opts, model: 'haiku' }),
      }
      const second: SmithersMiddleware = {
        transformOptions: async (opts) => ({ ...opts, model: 'opus' }),
      }

      const composed = composeMiddleware(first, second)
      const result = await composed.transformOptions?.({ prompt: 'test' })

      expect(result?.model).toBe('opus')
    })

    test('wraps onProgress with transformChunk pipeline', async () => {
      const chunks: string[] = []
      const first: SmithersMiddleware = {
        transformChunk: (c) => `[${c}]`,
      }
      const second: SmithersMiddleware = {
        transformChunk: (c) => `<${c}>`,
      }

      const composed = composeMiddleware(first, second)
      const result = await composed.transformOptions?.({
        prompt: 'test',
        onProgress: (chunk) => chunks.push(chunk),
      })

      result?.onProgress?.('hello')
      expect(chunks).toEqual(['<[hello]>'])
    })
  })

  describe('wrapExecute', () => {
    test('executes middleware in onion order', async () => {
      const order: string[] = []

      const first: SmithersMiddleware = {
        wrapExecute: async ({ doExecute }) => {
          order.push('first:before')
          const result = await doExecute()
          order.push('first:after')
          return result
        },
      }
      const second: SmithersMiddleware = {
        wrapExecute: async ({ doExecute }) => {
          order.push('second:before')
          const result = await doExecute()
          order.push('second:after')
          return result
        },
      }

      const composed = composeMiddleware(first, second)
      await composed.wrapExecute?.({
        doExecute: async () => {
          order.push('execute')
          return makeResult()
        },
        options: { prompt: 'test' },
      })

      expect(order).toEqual([
        'first:before',
        'second:before',
        'execute',
        'second:after',
        'first:after',
      ])
    })

    test('first middleware can short-circuit execution', async () => {
      let executed = false

      const first: SmithersMiddleware = {
        wrapExecute: async () => {
          return makeResult({ output: 'short-circuited' })
        },
      }
      const second: SmithersMiddleware = {
        wrapExecute: async ({ doExecute }) => {
          return doExecute()
        },
      }

      const composed = composeMiddleware(first, second)
      const result = await composed.wrapExecute?.({
        doExecute: async () => {
          executed = true
          return makeResult()
        },
        options: { prompt: 'test' },
      })

      expect(executed).toBe(false)
      expect(result?.output).toBe('short-circuited')
    })

    test('propagates errors through wrapExecute chain', async () => {
      const first: SmithersMiddleware = {
        wrapExecute: async ({ doExecute }) => {
          try {
            return await doExecute()
          } catch {
            return makeResult({ output: 'caught', stopReason: 'error' })
          }
        },
      }
      const second: SmithersMiddleware = {
        wrapExecute: async ({ doExecute }) => doExecute(),
      }

      const composed = composeMiddleware(first, second)
      const result = await composed.wrapExecute?.({
        doExecute: async () => {
          throw new Error('boom')
        },
        options: { prompt: 'test' },
      })

      expect(result?.output).toBe('caught')
      expect(result?.stopReason).toBe('error')
    })
  })

  describe('transformResult', () => {
    test('chains transformResult in order', async () => {
      const first: SmithersMiddleware = {
        transformResult: async (r) => ({ ...r, output: `${r.output}-a` }),
      }
      const second: SmithersMiddleware = {
        transformResult: async (r) => ({ ...r, output: `${r.output}-b` }),
      }

      const composed = composeMiddleware(first, second)
      const result = await composed.transformResult?.(makeResult({ output: 'start' }))

      expect(result?.output).toBe('start-a-b')
    })
  })

  describe('transformChunk', () => {
    test('chains transformChunk in order', () => {
      const first: SmithersMiddleware = {
        transformChunk: (c) => `[${c}]`,
      }
      const second: SmithersMiddleware = {
        transformChunk: (c) => `<${c}>`,
      }

      const composed = composeMiddleware(first, second)
      const result = composed.transformChunk?.('hello')

      expect(result).toBe('<[hello]>')
    })

    test('only adds transformChunk if any middleware has it', () => {
      const first: SmithersMiddleware = { name: 'first' }
      const second: SmithersMiddleware = { name: 'second' }

      const composed = composeMiddleware(first, second)
      expect(composed.transformChunk).toBeUndefined()
    })
  })
})
