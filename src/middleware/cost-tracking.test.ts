import { describe, test, expect } from 'bun:test'
import type { AgentResult } from '../components/agents/types.js'
import { costTrackingMiddleware } from './cost-tracking.js'

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

describe('costTrackingMiddleware', () => {
  test('reports costs using default sonnet pricing', async () => {
    let reportedCost: { input: number; output: number; total: number } | null = null
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        reportedCost = cost
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 1000, output: 1000 } }),
      options: { prompt: 'test' },
    })

    // Default sonnet pricing: input=0.003, output=0.015 per 1000 tokens
    expect(reportedCost).not.toBeNull()
    expect(reportedCost!.input).toBeCloseTo(0.003)
    expect(reportedCost!.output).toBeCloseTo(0.015)
    expect(reportedCost!.total).toBeCloseTo(0.018)
  })

  test('uses model-specific pricing for opus', async () => {
    let reportedCost: { input: number; output: number; total: number } | null = null
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        reportedCost = cost
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 1000, output: 1000 } }),
      options: { prompt: 'test', model: 'opus' },
    })

    // Default opus pricing: input=0.015, output=0.075 per 1000 tokens
    expect(reportedCost!.input).toBeCloseTo(0.015)
    expect(reportedCost!.output).toBeCloseTo(0.075)
    expect(reportedCost!.total).toBeCloseTo(0.09)
  })

  test('uses model-specific pricing for haiku', async () => {
    let reportedCost: { input: number; output: number; total: number } | null = null
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        reportedCost = cost
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 1000, output: 1000 } }),
      options: { prompt: 'test', model: 'haiku' },
    })

    // Default haiku pricing: input=0.00025, output=0.00125 per 1000 tokens
    expect(reportedCost!.input).toBeCloseTo(0.00025)
    expect(reportedCost!.output).toBeCloseTo(0.00125)
    expect(reportedCost!.total).toBeCloseTo(0.0015)
  })

  test('uses custom pricing', async () => {
    let reportedCost: { input: number; output: number; total: number } | null = null
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        reportedCost = cost
      },
      pricing: {
        sonnet: { input: 0.01, output: 0.02 },
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 1000, output: 2000 } }),
      options: { prompt: 'test', model: 'sonnet' },
    })

    // Custom pricing: input=0.01, output=0.02 per 1000 tokens
    // 1000 input tokens = 0.01, 2000 output tokens = 0.04
    expect(reportedCost!.input).toBeCloseTo(0.01)
    expect(reportedCost!.output).toBeCloseTo(0.04)
    expect(reportedCost!.total).toBeCloseTo(0.05)
  })

  test('falls back to default pricing for unknown model in custom pricing', async () => {
    let reportedCost: { input: number; output: number; total: number } | null = null
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        reportedCost = cost
      },
      pricing: {
        'custom-model': { input: 0.1, output: 0.2 },
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 1000, output: 1000 } }),
      options: { prompt: 'test', model: 'sonnet' },
    })

    // Falls back to default sonnet pricing
    expect(reportedCost!.input).toBeCloseTo(0.003)
    expect(reportedCost!.output).toBeCloseTo(0.015)
  })

  test('handles zero tokens', async () => {
    let reportedCost: { input: number; output: number; total: number } | null = null
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        reportedCost = cost
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 0, output: 0 } }),
      options: { prompt: 'test' },
    })

    expect(reportedCost!.input).toBe(0)
    expect(reportedCost!.output).toBe(0)
    expect(reportedCost!.total).toBe(0)
  })

  test('handles undefined tokens', async () => {
    let reportedCost: { input: number; output: number; total: number } | null = null
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        reportedCost = cost
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => ({
        output: 'ok',
        tokensUsed: { input: 0, output: 0 },
        turnsUsed: 1,
        stopReason: 'completed' as const,
        durationMs: 100,
      }),
      options: { prompt: 'test' },
    })

    expect(reportedCost!.total).toBe(0)
  })

  test('calculates cost for partial tokens (non-multiples of 1000)', async () => {
    let reportedCost: { input: number; output: number; total: number } | null = null
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        reportedCost = cost
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 500, output: 250 } }),
      options: { prompt: 'test' },
    })

    // 500/1000 * 0.003 = 0.0015 input
    // 250/1000 * 0.015 = 0.00375 output
    expect(reportedCost!.input).toBeCloseTo(0.0015)
    expect(reportedCost!.output).toBeCloseTo(0.00375)
    expect(reportedCost!.total).toBeCloseTo(0.00525)
  })

  test('defaults to sonnet when no model specified', async () => {
    let reportedCost: { input: number; output: number; total: number } | null = null
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        reportedCost = cost
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 1000, output: 1000 } }),
      options: { prompt: 'test' }, // no model
    })

    // Should use sonnet pricing
    expect(reportedCost!.input).toBeCloseTo(0.003)
    expect(reportedCost!.output).toBeCloseTo(0.015)
  })

  test('does not call onCost for unknown model without default', async () => {
    let reportedCost: { input: number; output: number; total: number } | null = null
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        reportedCost = cost
      },
      pricing: {}, // Empty pricing, no defaults
    })

    await middleware.wrapExecute?.({
      doExecute: async () => makeResult({ tokensUsed: { input: 1000, output: 1000 } }),
      options: { prompt: 'test', model: 'unknown-model' },
    })

    // Custom pricing is empty and unknown-model not in DEFAULT_PRICING
    // So onCost is never called (pricing is undefined)
    expect(reportedCost).toBeNull()
  })

  test('preserves result properties', async () => {
    const middleware = costTrackingMiddleware({
      onCost: () => {},
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
        }),
      options: { prompt: 'test' },
    })

    expect(result?.output).toBe('test output')
    expect(result?.structured).toEqual({ data: 'value' })
    expect(result?.tokensUsed).toEqual({ input: 100, output: 50 })
    expect(result?.turnsUsed).toBe(3)
    expect(result?.stopReason).toBe('completed')
    expect(result?.durationMs).toBe(500)
  })

  test('has correct middleware name', () => {
    const middleware = costTrackingMiddleware({ onCost: () => {} })
    expect(middleware.name).toBe('cost-tracking')
  })

  test('calls onCost after execution completes', async () => {
    const order: string[] = []
    const middleware = costTrackingMiddleware({
      onCost: () => {
        order.push('onCost')
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () => {
        order.push('execute')
        return makeResult()
      },
      options: { prompt: 'test' },
    })

    expect(order).toEqual(['execute', 'onCost'])
  })

  test('handles large token counts', async () => {
    let reportedCost: { input: number; output: number; total: number } | null = null
    const middleware = costTrackingMiddleware({
      onCost: (cost) => {
        reportedCost = cost
      },
    })

    await middleware.wrapExecute?.({
      doExecute: async () =>
        makeResult({ tokensUsed: { input: 100000, output: 100000 } }),
      options: { prompt: 'test', model: 'opus' },
    })

    // 100000/1000 * 0.015 = 1.5 input
    // 100000/1000 * 0.075 = 7.5 output
    expect(reportedCost!.input).toBeCloseTo(1.5)
    expect(reportedCost!.output).toBeCloseTo(7.5)
    expect(reportedCost!.total).toBeCloseTo(9.0)
  })
})
