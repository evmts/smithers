import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { RateLimitMonitor } from './monitor.js'

describe('RateLimitMonitor', () => {
  let db: SmithersDB

  beforeAll(async () => {
    db = await createSmithersDB({ reset: true })
  })

  afterAll(() => {
    db.close()
  })

  test('getUsage returns execution-scoped stats', async () => {
    const executionId = db.execution.start('Test', './test.tsx')

    const agentA = db.agents.start('Prompt A', 'claude-sonnet-4')
    db.agents.complete(agentA, 'Result A', undefined, { input: 100, output: 50 })

    const agentB = db.agents.start('Prompt B', 'claude-haiku-3-5')
    db.agents.complete(agentB, 'Result B', undefined, { input: 25, output: 10 })

    const monitor = new RateLimitMonitor({
      db,
      anthropic: { apiKey: 'test' },
    })

    const usage = await monitor.getUsage(executionId)

    expect(usage.tokens.input).toBe(125)
    expect(usage.tokens.output).toBe(60)
    expect(usage.tokens.total).toBe(185)
    expect(usage.requestCount).toBe(2)
    expect(usage.byModel.get('claude-sonnet-4')?.requests).toBe(1)
  })
})
