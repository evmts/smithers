import type { SmithersDB } from '../db/index.js'

export type Provider = 'anthropic' | 'openai'

export interface RateLimitBucket {
  limit: number
  remaining: number
  resetsAt: Date
}

export interface RateLimitStatus {
  provider: Provider
  model: string
  requests: RateLimitBucket
  inputTokens: RateLimitBucket
  outputTokens: RateLimitBucket
  tokensPerDay?: RateLimitBucket
  tier?: string
  lastQueried: Date
  stale: boolean
}

export interface UsageStats {
  executionId: string
  tokens: {
    input: number
    output: number
    total: number
  }
  requestCount: number
  costEstimate: {
    input: number
    output: number
    total: number
  }
  byIteration: Map<number, { input: number; output: number }>
  byModel: Map<string, { input: number; output: number; requests: number }>
}

export interface ThrottleConfig {
  targetUtilization: number
  minDelayMs: number
  maxDelayMs: number
  backoffStrategy: 'linear' | 'exponential'
  blockOnLimit: boolean
}

export interface RateLimitMonitorConfig {
  anthropic?: {
    apiKey: string
    baseUrl?: string
  }
  openai?: {
    apiKey: string
    organization?: string
    baseUrl?: string
  }
  refreshIntervalMs?: number
  cacheTtlMs?: number
  db?: SmithersDB
}

export interface ProviderClient {
  readonly provider: Provider
  queryStatus: (model: string) => Promise<RateLimitStatus>
  parseHeaders: (headers: Headers | undefined, model?: string) => RateLimitStatus
  estimateCost: (model: string, tokens: { input: number; output: number }) => {
    input: number
    output: number
    total: number
  }
}
