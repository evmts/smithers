import { describe, test, expect } from 'bun:test'
import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import type { SmithersMiddleware } from './types.js'
import { composeMiddleware, applyMiddleware } from './compose.js'

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

describe('applyMiddleware', () => {
  test('executes without middleware', async () => {
    const result = await applyMiddleware(
      async () => makeResult({ output: 'direct' }),
      { prompt: 'test' },
      []
    )

    expect(result.output).toBe('direct')
  })

  test('applies transformOptions before execution', async () => {
    let receivedOptions: CLIExecutionOptions | null = null
    const middleware: SmithersMiddleware = {
      transformOptions: async (opts) => ({ ...opts, model: 'opus' }),
    }

    await applyMiddleware(
      async (opts) => {
        receivedOptions = opts
        return makeResult()
      },
      { prompt: 'test' },
      [middleware]
    )

    expect(receivedOptions?.model).toBe('opus')
  })

  test('applies transformResult after execution', async () => {
    const middleware: SmithersMiddleware = {
      transformResult: async (r) => ({ ...r, output: `${r.output}-modified` }),
    }

    const result = await applyMiddleware(
      async () => makeResult({ output: 'original' }),
      { prompt: 'test' },
      [middleware]
    )

    expect(result.output).toBe('original-modified')
  })

  test('wraps execution with wrapExecute', async () => {
    const order: string[] = []
    const middleware: SmithersMiddleware = {
      wrapExecute: async ({ doExecute }) => {
        order.push('before')
        const result = await doExecute()
        order.push('after')
        return result
      },
    }

    await applyMiddleware(
      async () => {
        order.push('execute')
        return makeResult()
      },
      { prompt: 'test' },
      [middleware]
    )

    expect(order).toEqual(['before', 'execute', 'after'])
  })

  test('applies onProgress transformer', async () => {
    const chunks: string[] = []
    const middleware: SmithersMiddleware = {
      transformChunk: (c) => `[${c}]`,
    }

    await applyMiddleware(
      async (opts) => {
        opts.onProgress?.('hello')
        return makeResult()
      },
      {
        prompt: 'test',
        onProgress: (chunk) => chunks.push(chunk),
      },
      [middleware]
    )

    expect(chunks).toEqual(['[hello]'])
  })

  test('filters out null and undefined middleware', async () => {
    const middleware: SmithersMiddleware = {
      transformResult: async (r) => ({ ...r, output: 'modified' }),
    }

    const result = await applyMiddleware(
      async () => makeResult({ output: 'original' }),
      { prompt: 'test' },
      [null, middleware, undefined]
    )

    expect(result.output).toBe('modified')
  })

  test('multiple middleware execute in correct order', async () => {
    const order: string[] = []

    const first: SmithersMiddleware = {
      transformOptions: async (opts) => {
        order.push('options:first')
        return opts
      },
      wrapExecute: async ({ doExecute }) => {
        order.push('wrap:first:before')
        const result = await doExecute()
        order.push('wrap:first:after')
        return result
      },
      transformResult: async (r) => {
        order.push('result:first')
        return r
      },
    }

    const second: SmithersMiddleware = {
      transformOptions: async (opts) => {
        order.push('options:second')
        return opts
      },
      wrapExecute: async ({ doExecute }) => {
        order.push('wrap:second:before')
        const result = await doExecute()
        order.push('wrap:second:after')
        return result
      },
      transformResult: async (r) => {
        order.push('result:second')
        return r
      },
    }

    await applyMiddleware(
      async () => {
        order.push('execute')
        return makeResult()
      },
      { prompt: 'test' },
      [first, second]
    )

    expect(order).toEqual([
      'options:first',
      'options:second',
      'wrap:first:before',
      'wrap:second:before',
      'execute',
      'result:first',
      'result:second',
      'wrap:second:after',
      'wrap:first:after',
    ])
  })

  test('propagates execution errors', async () => {
    await expect(
      applyMiddleware(
        async () => {
          throw new Error('execution failed')
        },
        { prompt: 'test' },
        []
      )
    ).rejects.toThrow('execution failed')
  })

  test('propagates middleware errors', async () => {
    const middleware: SmithersMiddleware = {
      wrapExecute: async () => {
        throw new Error('middleware failed')
      },
    }

    await expect(
      applyMiddleware(async () => makeResult(), { prompt: 'test' }, [middleware])
    ).rejects.toThrow('middleware failed')
  })
})
