import { describe, test, expect } from 'bun:test'
import { createOpenAIClient } from './openai.js'

describe('OpenAIClient', () => {
  test('parseHeaders extracts rate limit info', () => {
    const client = createOpenAIClient({ apiKey: 'test' })
    const headers = new Headers({
      'x-ratelimit-limit-requests': '10000',
      'x-ratelimit-remaining-requests': '9500',
      'x-ratelimit-limit-tokens': '2000000',
      'x-ratelimit-remaining-tokens': '1900000',
      'x-ratelimit-reset-requests': '2025-01-18T12:00:00Z',
      'x-ratelimit-reset-tokens': '2025-01-18T12:00:00Z',
    })

    const status = client.parseHeaders(headers, 'gpt-4o')

    expect(status.requests.limit).toBe(10000)
    expect(status.requests.remaining).toBe(9500)
    expect(status.inputTokens.limit).toBe(2000000)
    expect(status.inputTokens.remaining).toBe(1900000)
    expect(status.model).toBe('gpt-4o')
    expect(status.provider).toBe('openai')
  })

  test('parseHeaders handles relative reset times', () => {
    const client = createOpenAIClient({ apiKey: 'test' })
    const before = Date.now()
    
    const headers = new Headers({
      'x-ratelimit-reset-requests': '30s',
      'x-ratelimit-reset-tokens': '1m',
    })

    const status = client.parseHeaders(headers, 'gpt-4o')
    const after = Date.now()

    expect(status.requests.resetsAt.getTime()).toBeGreaterThanOrEqual(before + 30000)
    expect(status.requests.resetsAt.getTime()).toBeLessThanOrEqual(after + 30000)
    expect(status.inputTokens.resetsAt.getTime()).toBeGreaterThanOrEqual(before + 60000)
  })

  test('parseHeaders handles millisecond reset times', () => {
    const client = createOpenAIClient({ apiKey: 'test' })
    const before = Date.now()
    
    const headers = new Headers({
      'x-ratelimit-reset-requests': '500ms',
    })

    const status = client.parseHeaders(headers, 'gpt-4o')

    expect(status.requests.resetsAt.getTime()).toBeGreaterThanOrEqual(before + 500)
    expect(status.requests.resetsAt.getTime()).toBeLessThanOrEqual(before + 600)
  })

  test('estimateCost returns input/output totals', () => {
    const client = createOpenAIClient({ apiKey: 'test' })
    const cost = client.estimateCost('gpt-4o', { input: 1000, output: 500 })

    expect(cost.input).toBeCloseTo(0.005, 6)
    expect(cost.output).toBeCloseTo(0.0075, 6)
    expect(cost.total).toBeCloseTo(0.0125, 6)
  })

  test('estimateCost falls back to gpt-4o for unknown models', () => {
    const client = createOpenAIClient({ apiKey: 'test' })
    const cost = client.estimateCost('unknown-model', { input: 1000, output: 500 })

    expect(cost.total).toBeCloseTo(0.0125, 6)
  })

  test('parseHeaders handles missing headers gracefully', () => {
    const client = createOpenAIClient({ apiKey: 'test' })
    const status = client.parseHeaders(undefined, 'gpt-4o')

    expect(status.requests.limit).toBe(0)
    expect(status.requests.remaining).toBe(0)
    expect(status.model).toBe('gpt-4o')
  })
})
