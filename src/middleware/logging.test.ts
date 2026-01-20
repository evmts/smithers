import { describe, test, expect } from 'bun:test'
import type { AgentResult, CLIExecutionOptions } from '../components/agents/types.js'
import { loggingMiddleware, type LogEntry } from './logging.js'

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

describe('loggingMiddleware', () => {
  test('logs start and finish phases', async () => {
    const logs: LogEntry[] = []
    const middleware = loggingMiddleware({
      logFn: (entry) => logs.push(entry),
    })

    await middleware.transformOptions?.({ prompt: 'test' })
    await middleware.wrapExecute?.({
      doExecute: async () => makeResult(),
      options: { prompt: 'test' },
    })

    expect(logs).toHaveLength(2)
    expect(logs[0].phase).toBe('start')
    expect(logs[1].phase).toBe('finish')
  })

  test('logs error phase on exception', async () => {
    const logs: LogEntry[] = []
    const middleware = loggingMiddleware({
      logFn: (entry) => logs.push(entry),
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

    expect(logs).toHaveLength(1)
    expect(logs[0].phase).toBe('error')
    expect(logs[0].error).toBe('boom')
  })

  test('includes options in start log', async () => {
    const logs: LogEntry[] = []
    const middleware = loggingMiddleware({
      logFn: (entry) => logs.push(entry),
    })

    const options: CLIExecutionOptions = { prompt: 'test prompt', model: 'sonnet' }
    await middleware.transformOptions?.(options)

    expect(logs[0].options).toEqual(options)
  })

  test('includes duration in finish log', async () => {
    const logs: LogEntry[] = []
    const middleware = loggingMiddleware({
      logFn: (entry) => logs.push(entry),
    })

    await middleware.wrapExecute?.({
      doExecute: async () => {
        await new Promise((r) => setTimeout(r, 50))
        return makeResult()
      },
      options: { prompt: 'test' },
    })

    expect(logs[0].durationMs).toBeGreaterThanOrEqual(40)
    expect(logs[0].durationMs).toBeLessThan(200)
  })

  test('includes tokens when includeTokens is true', async () => {
    const logs: LogEntry[] = []
    const middleware = loggingMiddleware({
      logFn: (entry) => logs.push(entry),
      includeTokens: true,
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 100, output: 50 } }),
      options: { prompt: 'test' },
    })

    expect(logs[0].tokens).toEqual({ input: 100, output: 50 })
  })

  test('excludes tokens when includeTokens is false', async () => {
    const logs: LogEntry[] = []
    const middleware = loggingMiddleware({
      logFn: (entry) => logs.push(entry),
      includeTokens: false,
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 100, output: 50 } }),
      options: { prompt: 'test' },
    })

    expect(logs[0].tokens).toBeUndefined()
  })

  test('respects debug log level', async () => {
    const logs: LogEntry[] = []
    const middleware = loggingMiddleware({
      logLevel: 'debug',
      logFn: (entry) => logs.push(entry),
    })

    await middleware.transformOptions?.({ prompt: 'test' })
    await middleware.wrapExecute?.({
      doExecute: async () => makeResult(),
      options: { prompt: 'test' },
    })

    expect(logs).toHaveLength(2)
    expect(logs[0].level).toBe('debug')
    expect(logs[1].level).toBe('debug')
  })

  test('respects info log level', async () => {
    const logs: LogEntry[] = []
    const middleware = loggingMiddleware({
      logLevel: 'info',
      logFn: (entry) => logs.push(entry),
    })

    await middleware.transformOptions?.({ prompt: 'test' })
    await middleware.wrapExecute?.({
      doExecute: async () => makeResult(),
      options: { prompt: 'test' },
    })

    expect(logs).toHaveLength(2)
  })

  test('warn level skips start/finish but logs errors', async () => {
    const logs: LogEntry[] = []
    const middleware = loggingMiddleware({
      logLevel: 'warn',
      logFn: (entry) => logs.push(entry),
    })

    await middleware.transformOptions?.({ prompt: 'test' })
    await middleware.wrapExecute?.({
      doExecute: async () => makeResult(),
      options: { prompt: 'test' },
    })

    expect(logs).toHaveLength(0)

    try {
      await middleware.wrapExecute?.({
        doExecute: async () => {
          throw new Error('error')
        },
        options: { prompt: 'test' },
      })
    } catch {
      // expected
    }

    expect(logs).toHaveLength(1)
    expect(logs[0].phase).toBe('error')
  })

  test('type is always execute', async () => {
    const logs: LogEntry[] = []
    const middleware = loggingMiddleware({
      logFn: (entry) => logs.push(entry),
    })

    await middleware.transformOptions?.({ prompt: 'test' })
    await middleware.wrapExecute?.({
      doExecute: async () => makeResult(),
      options: { prompt: 'test' },
    })

    expect(logs.every((log) => log.type === 'execute')).toBe(true)
  })

  test('rethrows error after logging', async () => {
    const middleware = loggingMiddleware({
      logFn: () => {},
    })

    await expect(
      middleware.wrapExecute?.({
        doExecute: async () => {
          throw new Error('original error')
        },
        options: { prompt: 'test' },
      })
    ).rejects.toThrow('original error')
  })

  test('handles non-Error exceptions', async () => {
    const logs: LogEntry[] = []
    const middleware = loggingMiddleware({
      logFn: (entry) => logs.push(entry),
    })

    try {
      await middleware.wrapExecute?.({
        doExecute: async () => {
          throw 'string error'
        },
        options: { prompt: 'test' },
      })
    } catch {
      // expected
    }

    expect(logs[0].error).toBe('string error')
  })

  test('returns original result', async () => {
    const middleware = loggingMiddleware({
      logFn: () => {},
    })

    const result = await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ output: 'test output' }),
      options: { prompt: 'test' },
    })

    expect(result?.output).toBe('test output')
  })

  test('returns original options from transformOptions', async () => {
    const middleware = loggingMiddleware({
      logFn: () => {},
    })

    const options: CLIExecutionOptions = { prompt: 'test', model: 'sonnet', maxTurns: 5 }
    const result = await middleware.transformOptions?.(options)

    expect(result).toEqual(options)
  })

  test('has correct middleware name', () => {
    const middleware = loggingMiddleware()
    expect(middleware.name).toBe('logging')
  })

  test('default log function does not throw', async () => {
    const middleware = loggingMiddleware({})

    // Should not throw
    await middleware.transformOptions?.({ prompt: 'test' })
    await middleware.wrapExecute?.({
      doExecute: async () => makeResult(),
      options: { prompt: 'test' },
    })

    try {
      await middleware.wrapExecute?.({
        doExecute: async () => {
          throw new Error('test')
        },
        options: { prompt: 'test' },
      })
    } catch {
      // expected
    }
  })
})
