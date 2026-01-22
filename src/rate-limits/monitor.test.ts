/**
 * Tests for RateLimitMonitor
 * Covers: getStatus, getUsage, getRemainingCapacity, updateFromHeaders
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { RateLimitMonitor, createRateLimitMonitor } from './monitor.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import type { RateLimitStatus } from './types.js'

describe('RateLimitMonitor', () => {
  describe('constructor', () => {
    test('creates monitor with default config', () => {
      const monitor = new RateLimitMonitor({})
      expect(monitor).toBeDefined()
    })

    test('creates monitor with anthropic config', () => {
      const monitor = new RateLimitMonitor({
        anthropic: { apiKey: 'test-key' },
      })
      expect(monitor).toBeDefined()
    })

    test('creates monitor with openai config', () => {
      const monitor = new RateLimitMonitor({
        openai: { apiKey: 'test-key' },
      })
      expect(monitor).toBeDefined()
    })

    test('creates monitor with both providers', () => {
      const monitor = new RateLimitMonitor({
        anthropic: { apiKey: 'test-key-1' },
        openai: { apiKey: 'test-key-2' },
      })
      expect(monitor).toBeDefined()
    })

    test('applies custom refresh and cache ttl', () => {
      const monitor = new RateLimitMonitor({
        refreshIntervalMs: 60_000,
        cacheTtlMs: 30_000,
      })
      expect(monitor).toBeDefined()
    })
  })

  describe('getStatus', () => {
    test('throws for unconfigured provider', async () => {
      const monitor = new RateLimitMonitor({})
      await expect(monitor.getStatus('anthropic', 'claude-sonnet-4')).rejects.toThrow(
        'Provider anthropic not configured'
      )
    })

    test('throws for openai when not configured', async () => {
      const monitor = new RateLimitMonitor({
        anthropic: { apiKey: 'test' },
      })
      await expect(monitor.getStatus('openai', 'gpt-4')).rejects.toThrow(
        'Provider openai not configured'
      )
    })
  })

  describe('getUsage', () => {
    let db: SmithersDB
    let executionId: string

    beforeAll(async () => {
      db = await createSmithersDB({ reset: true })
    })

    afterAll(() => {
      db.close()
    })

    beforeEach(() => {
      // Start a new execution for each test
      executionId = db.execution.start('Test Execution', '/test/path.tsx')
    })

    test('throws when database not configured', async () => {
      const monitor = new RateLimitMonitor({})
      await expect(monitor.getUsage('test-exec')).rejects.toThrow(
        'Database not configured for usage tracking'
      )
    })

    test('returns empty usage for execution with no agents', async () => {
      const monitor = new RateLimitMonitor({ db })
      const usage = await monitor.getUsage(executionId)

      expect(usage.executionId).toBe(executionId)
      expect(usage.tokens.input).toBe(0)
      expect(usage.tokens.output).toBe(0)
      expect(usage.tokens.total).toBe(0)
      expect(usage.requestCount).toBe(0)
      expect(usage.byModel.size).toBe(0)
    })

    test('aggregates token usage from agents', async () => {
      const monitor = new RateLimitMonitor({ db })

      // Create some agent records (execution is already started in beforeEach)
      const agentId1 = db.agents.start('Task 1', 'claude-sonnet-4', 'Test')
      db.agents.complete(agentId1, 'Result 1', {}, { input: 100, output: 50 })

      const agentId2 = db.agents.start('Task 2', 'claude-sonnet-4', 'Test')
      db.agents.complete(agentId2, 'Result 2', {}, { input: 200, output: 100 })

      const usage = await monitor.getUsage(executionId)

      expect(usage.tokens.input).toBe(300)
      expect(usage.tokens.output).toBe(150)
      expect(usage.tokens.total).toBe(450)
      expect(usage.requestCount).toBe(2)
    })

    test('groups usage by model', async () => {
      const monitor = new RateLimitMonitor({ db })

      const agentId1 = db.agents.start('Task 1', 'claude-sonnet-4', 'Test')
      db.agents.complete(agentId1, 'Result 1', {}, { input: 100, output: 50 })

      const agentId2 = db.agents.start('Task 2', 'claude-haiku-3-5', 'Test')
      db.agents.complete(agentId2, 'Result 2', {}, { input: 200, output: 100 })

      const agentId3 = db.agents.start('Task 3', 'claude-sonnet-4', 'Test')
      db.agents.complete(agentId3, 'Result 3', {}, { input: 50, output: 25 })

      const usage = await monitor.getUsage(executionId)

      const sonnetStats = usage.byModel.get('claude-sonnet-4')
      expect(sonnetStats).toBeDefined()
      expect(sonnetStats!.input).toBe(150)
      expect(sonnetStats!.output).toBe(75)
      expect(sonnetStats!.requests).toBe(2)

      const haikuStats = usage.byModel.get('claude-haiku-3-5')
      expect(haikuStats).toBeDefined()
      expect(haikuStats!.input).toBe(200)
      expect(haikuStats!.output).toBe(100)
      expect(haikuStats!.requests).toBe(1)
    })

    test('handles agents with null tokens', async () => {
      const monitor = new RateLimitMonitor({ db })

      const agentId1 = db.agents.start('Task 1', 'claude-sonnet-4', 'Test')
      // Complete without token data
      db.agents.complete(agentId1, 'Result 1', {})

      const agentId2 = db.agents.start('Task 2', 'claude-sonnet-4', 'Test')
      db.agents.complete(agentId2, 'Result 2', {}, { input: 100, output: 50 })

      const usage = await monitor.getUsage(executionId)

      expect(usage.tokens.input).toBe(100)
      expect(usage.tokens.output).toBe(50)
      expect(usage.requestCount).toBe(2)
    })

    test('calculates cost estimate with anthropic provider', async () => {
      const monitor = new RateLimitMonitor({ 
        db,
        anthropic: { apiKey: 'test' },
      })

      const agentId1 = db.agents.start('Task 1', 'claude-sonnet-4', 'Test')
      db.agents.complete(agentId1, 'Result 1', {}, { input: 1000, output: 500 })

      const usage = await monitor.getUsage(executionId)

      expect(usage.costEstimate).toBeDefined()
      expect(usage.costEstimate.total).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getRemainingCapacity', () => {
    test('throws for unconfigured provider', async () => {
      const monitor = new RateLimitMonitor({})
      await expect(monitor.getRemainingCapacity('anthropic', 'claude-sonnet-4')).rejects.toThrow(
        'Provider anthropic not configured'
      )
    })
  })

  describe('updateFromHeaders', () => {
    test('silently ignores unconfigured provider', () => {
      const monitor = new RateLimitMonitor({})
      // Should not throw
      monitor.updateFromHeaders('anthropic', 'claude-sonnet-4', new Headers())
    })

    test('updates cache from anthropic headers', () => {
      const monitor = new RateLimitMonitor({
        anthropic: { apiKey: 'test-key' },
      })

      const headers = new Headers({
        'anthropic-ratelimit-requests-limit': '100',
        'anthropic-ratelimit-requests-remaining': '75',
        'anthropic-ratelimit-requests-reset': new Date(Date.now() + 60000).toISOString(),
        'anthropic-ratelimit-input-tokens-limit': '1000000',
        'anthropic-ratelimit-input-tokens-remaining': '900000',
        'anthropic-ratelimit-input-tokens-reset': new Date(Date.now() + 60000).toISOString(),
        'anthropic-ratelimit-output-tokens-limit': '100000',
        'anthropic-ratelimit-output-tokens-remaining': '95000',
        'anthropic-ratelimit-output-tokens-reset': new Date(Date.now() + 60000).toISOString(),
      })

      // Should not throw
      monitor.updateFromHeaders('anthropic', 'claude-sonnet-4', headers)
    })

    test('updates cache from openai headers', () => {
      const monitor = new RateLimitMonitor({
        openai: { apiKey: 'test-key' },
      })

      const headers = new Headers({
        'x-ratelimit-limit-requests': '100',
        'x-ratelimit-remaining-requests': '75',
        'x-ratelimit-reset-requests': '1s',
        'x-ratelimit-limit-tokens': '1000000',
        'x-ratelimit-remaining-tokens': '900000',
        'x-ratelimit-reset-tokens': '1s',
      })

      // Should not throw
      monitor.updateFromHeaders('openai', 'gpt-4', headers)
    })
  })

  describe('createRateLimitMonitor factory', () => {
    test('creates monitor instance', () => {
      const monitor = createRateLimitMonitor({})
      expect(monitor).toBeInstanceOf(RateLimitMonitor)
    })

    test('creates monitor with full config', () => {
      const monitor = createRateLimitMonitor({
        anthropic: { apiKey: 'test' },
        openai: { apiKey: 'test' },
        refreshIntervalMs: 60_000,
        cacheTtlMs: 30_000,
      })
      expect(monitor).toBeInstanceOf(RateLimitMonitor)
    })
  })
})
