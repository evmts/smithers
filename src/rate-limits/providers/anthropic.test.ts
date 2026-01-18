import { describe, test, expect } from 'bun:test'
import { createAnthropicClient } from './anthropic.js'

describe('AnthropicClient', () => {
  test('parseHeaders extracts rate limit info', () => {
    const client = createAnthropicClient({ apiKey: 'test' })
    const headers = new Headers({
      'anthropic-ratelimit-requests-limit': '1000',
      'anthropic-ratelimit-requests-remaining': '950',
      'anthropic-ratelimit-requests-reset': '2025-01-18T12:00:00Z',
      'anthropic-ratelimit-input-tokens-limit': '450000',
      'anthropic-ratelimit-input-tokens-remaining': '400000',
      'anthropic-ratelimit-input-tokens-reset': '2025-01-18T12:00:00Z',
      'anthropic-ratelimit-output-tokens-limit': '90000',
      'anthropic-ratelimit-output-tokens-remaining': '85000',
      'anthropic-ratelimit-output-tokens-reset': '2025-01-18T12:00:00Z',
    })

    const status = client.parseHeaders(headers, 'claude-sonnet-4')

    expect(status.requests.limit).toBe(1000)
    expect(status.requests.remaining).toBe(950)
    expect(status.inputTokens.limit).toBe(450000)
    expect(status.outputTokens.remaining).toBe(85000)
    expect(status.model).toBe('claude-sonnet-4')
  })

  test('estimateCost returns input/output totals', () => {
    const client = createAnthropicClient({ apiKey: 'test' })
    const cost = client.estimateCost('claude-sonnet-4', { input: 1000, output: 500 })

    expect(cost.input).toBeCloseTo(0.003, 6)
    expect(cost.output).toBeCloseTo(0.0075, 6)
    expect(cost.total).toBeCloseTo(0.0105, 6)
  })
})
