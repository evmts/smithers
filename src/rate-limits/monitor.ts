import type {
  RateLimitMonitorConfig,
  RateLimitStatus,
  UsageStats,
  Provider,
  ProviderClient,
} from './types.js'
import { createAnthropicClient } from './providers/anthropic.js'
import { createOpenAIClient } from './providers/openai.js'
import { RateLimitStore } from './store.js'

export class RateLimitMonitor {
  private providers: Map<Provider, ProviderClient>
  private store: RateLimitStore
  private config: Required<Pick<RateLimitMonitorConfig, 'refreshIntervalMs' | 'cacheTtlMs'>> &
    RateLimitMonitorConfig

  constructor(config: RateLimitMonitorConfig) {
    this.config = {
      refreshIntervalMs: 30_000,
      cacheTtlMs: 10_000,
      ...config,
    }

    this.providers = new Map()
    if (config.anthropic) {
      this.providers.set('anthropic', createAnthropicClient(config.anthropic))
    }
    if (config.openai) {
      this.providers.set('openai', createOpenAIClient(config.openai))
    }

    this.store = new RateLimitStore({
      ttlMs: this.config.cacheTtlMs,
      ...(this.config.db ? { db: this.config.db } : {}),
    })
  }

  async getStatus(provider: Provider, model: string): Promise<RateLimitStatus> {
    const cached = this.store.get(provider, model)
    if (cached && !cached.stale) {
      return cached
    }

    const client = this.providers.get(provider)
    if (!client) {
      throw new Error(`Provider ${provider} not configured`)
    }

    const status = await client.queryStatus(model)
    this.store.set(status)
    return status
  }

  async getUsage(executionId: string): Promise<UsageStats> {
    if (!this.config.db) {
      throw new Error('Database not configured for usage tracking')
    }

    const agents = this.config.db.agents.list(executionId)
    const byIteration = new Map<number, { input: number; output: number }>()
    const byModel = new Map<string, { input: number; output: number; requests: number }>()

    let totalInput = 0
    let totalOutput = 0

    for (const agent of agents) {
      const input = agent.tokens_input ?? 0
      const output = agent.tokens_output ?? 0
      totalInput += input
      totalOutput += output

      const modelStats = byModel.get(agent.model) ?? { input: 0, output: 0, requests: 0 }
      modelStats.input += input
      modelStats.output += output
      modelStats.requests += 1
      byModel.set(agent.model, modelStats)
    }

    const costEstimate = { input: 0, output: 0, total: 0 }
    for (const [model, stats] of byModel) {
      const anthropicClient = this.providers.get('anthropic')
      const openaiClient = this.providers.get('openai')
      const client = anthropicClient ?? openaiClient
      if (!client) continue
      const cost = client.estimateCost(model, stats)
      costEstimate.total += cost.total
      costEstimate.input += cost.input
      costEstimate.output += cost.output
    }

    return {
      executionId,
      tokens: { input: totalInput, output: totalOutput, total: totalInput + totalOutput },
      requestCount: agents.length,
      costEstimate,
      byIteration,
      byModel,
    }
  }

  async getRemainingCapacity(provider: Provider, model: string): Promise<{
    requests: number
    inputTokens: number
    outputTokens: number
    overall: number
  }> {
    const status = await this.getStatus(provider, model)

    const requests = status.requests.limit > 0 ? status.requests.remaining / status.requests.limit : 1
    const inputTokens = status.inputTokens.limit > 0 ? status.inputTokens.remaining / status.inputTokens.limit : 1
    const outputTokens = status.outputTokens.limit > 0 ? status.outputTokens.remaining / status.outputTokens.limit : 1

    return {
      requests,
      inputTokens,
      outputTokens,
      overall: Math.min(requests, inputTokens, outputTokens),
    }
  }

  updateFromHeaders(provider: Provider, model: string, headers: Headers): void {
    const client = this.providers.get(provider)
    if (!client) return

    const status = client.parseHeaders(headers, model)
    this.store.set(status)
  }
}

export function createRateLimitMonitor(config: RateLimitMonitorConfig): RateLimitMonitor {
  return new RateLimitMonitor(config)
}
