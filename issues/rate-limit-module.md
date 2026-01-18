# Rate Limiting & Token Usage Tracking Module

<issue-summary>
Create a module for Smithers that enables proactive rate limit monitoring via direct provider API calls, execution-scoped token usage tracking, and intelligent throttling/scaling of requests based on rate limit headroom.
</issue-summary>

---

## Background

<context>
<smithers-current-state>
Smithers currently tracks token usage at the agent and execution level:

```typescript
// src/db/agents.ts:51-61
complete: (id: string, result: string, structuredResult?: Record<string, any>, tokens?: { input: number; output: number }) => {
  // ... update agent record
  if (tokens && startRow) {
    rdb.run('UPDATE executions SET total_tokens_used = total_tokens_used + ? WHERE id = ?',
      [(tokens.input ?? 0) + (tokens.output ?? 0), startRow.execution_id])
  }
}
```

**Current Capabilities:**
- Token counts stored per agent (`tokens_input`, `tokens_output` in `agents` table)
- Aggregated tokens per execution (`total_tokens_used` in `executions` table)
- Reactive queries via `ReactiveDatabase` for real-time updates

**Current Limitations:**
- No awareness of provider rate limits
- No proactive throttling based on remaining capacity
- No way to query rate limit status without hitting limits
- CLI subprocess doesn't expose rate limit headers
</smithers-current-state>

<architecture-constraints>
**CRITICAL: CLI Subprocess Architecture**

Smithers uses the Claude Code CLI as a black-box subprocess:

```typescript
// src/components/agents/claude-cli/executor.ts:34-38
proc = Bun.spawn(['claude', ...args], {
  cwd: options.cwd ?? process.cwd(),
  stdout: 'pipe',
  stderr: 'pipe',
})
```

**Implications:**
- No access to API response headers (rate limit info)
- Cannot intercept individual API calls
- Must use separate API calls to query rate limits
- Token usage only available after CLI completes (via output parsing)
</architecture-constraints>
</context>

---

## Provider Rate Limit APIs

<provider-apis>

### Anthropic API Rate Limits

Anthropic provides comprehensive rate limit headers on every API response:

| Header | Description |
|--------|-------------|
| `anthropic-ratelimit-requests-limit` | Maximum requests per minute |
| `anthropic-ratelimit-requests-remaining` | Requests remaining before limit |
| `anthropic-ratelimit-requests-reset` | RFC 3339 time when limit resets |
| `anthropic-ratelimit-input-tokens-limit` | Maximum input tokens per minute |
| `anthropic-ratelimit-input-tokens-remaining` | Input tokens remaining |
| `anthropic-ratelimit-input-tokens-reset` | Time when input token limit resets |
| `anthropic-ratelimit-output-tokens-limit` | Maximum output tokens per minute |
| `anthropic-ratelimit-output-tokens-remaining` | Output tokens remaining |
| `anthropic-ratelimit-output-tokens-reset` | Time when output token limit resets |

**Token Bucket Algorithm:** Anthropic uses continuous replenishment rather than fixed intervals. Capacity refills at a steady rate up to the maximum.

**Tier Limits (Example - Claude Sonnet 4.x):**
| Tier | RPM | ITPM | OTPM |
|------|-----|------|------|
| Tier 1 | 50 | 30,000 | 8,000 |
| Tier 2 | 1,000 | 450,000 | 90,000 |
| Tier 3 | 2,000 | 800,000 | 160,000 |
| Tier 4 | 4,000 | 2,000,000 | 400,000 |

**Cache Optimization:** Cached input tokens (`cache_read_input_tokens`) do NOT count toward ITPM limits for most models.

### OpenAI API Rate Limits

OpenAI provides similar headers:

| Header | Description |
|--------|-------------|
| `x-ratelimit-limit-requests` | Maximum requests per minute |
| `x-ratelimit-limit-tokens` | Maximum tokens per minute |
| `x-ratelimit-remaining-requests` | Requests remaining |
| `x-ratelimit-remaining-tokens` | Tokens remaining |
| `x-ratelimit-reset-requests` | Time until request limit resets |
| `x-ratelimit-reset-tokens` | Time until token limit resets |

**Important Limitation:** There is no lightweight endpoint to query rate limits without making an API call. Headers are only returned with actual API requests.

### Query Strategy

Since neither provider offers a dedicated rate-limit-check endpoint, we must:
1. Make a minimal API call to get current limits (e.g., short message with `max_tokens=1`)
2. Parse response headers
3. Cache results with TTL (token bucket refills continuously)

```typescript
// Anthropic: Minimal query to get rate limit status
const response = await anthropic.messages.create({
  model: 'claude-haiku-3',  // Use cheapest model
  max_tokens: 1,
  messages: [{ role: 'user', content: 'Hi' }],
})
// Extract headers from response
```

</provider-apis>

---

## Proposed Architecture

<architecture>

### Module Structure

```
src/rate-limits/
├── index.ts                    # Public API exports
├── types.ts                    # TypeScript interfaces
├── monitor.ts                  # RateLimitMonitor class
├── providers/
│   ├── base.ts                 # Abstract provider interface
│   ├── anthropic.ts            # Anthropic API integration
│   └── openai.ts               # OpenAI API integration
├── store.ts                    # In-memory cache + DB persistence
├── throttle.ts                 # Throttle controller
└── middleware.ts               # SmithersMiddleware integration
```

### Core Types

```typescript
// src/rate-limits/types.ts

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
  tokensPerDay?: RateLimitBucket  // OpenAI only
  tier?: string
  lastQueried: Date
  stale: boolean  // True if data is older than TTL
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
  /** Target utilization of rate limit (0.0-1.0). Default: 0.8 */
  targetUtilization: number
  /** Minimum delay between requests in ms. Default: 0 */
  minDelayMs: number
  /** Maximum delay between requests in ms. Default: 60000 */
  maxDelayMs: number
  /** Backoff strategy when approaching limits */
  backoffStrategy: 'linear' | 'exponential'
  /** Whether to block when at capacity or throw error */
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
  /** How often to refresh rate limit status (ms). Default: 30000 */
  refreshIntervalMs?: number
  /** How long cached data is considered fresh (ms). Default: 10000 */
  cacheTtlMs?: number
  /** Database for persistence (optional) */
  db?: SmithersDB
}
```

### Provider Client Interface

```typescript
// src/rate-limits/providers/base.ts

export interface ProviderClient {
  /** Provider identifier */
  readonly provider: Provider

  /** Query current rate limit status for a model */
  queryStatus(model: string): Promise<RateLimitStatus>

  /** Parse rate limit headers from a response */
  parseHeaders(headers: Headers): Partial<RateLimitStatus>

  /** Estimate cost for token usage */
  estimateCost(model: string, tokens: { input: number; output: number }): number
}
```

### Anthropic Provider Implementation

```typescript
// src/rate-limits/providers/anthropic.ts

import Anthropic from '@anthropic-ai/sdk'
import type { ProviderClient, RateLimitStatus } from '../types'

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  'claude-sonnet-4': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-haiku-3-5': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
}

export function createAnthropicClient(config: { apiKey: string; baseUrl?: string }): ProviderClient {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  })

  return {
    provider: 'anthropic',

    async queryStatus(model: string): Promise<RateLimitStatus> {
      // Make minimal request to get headers
      const response = await client.messages.create({
        model: 'claude-haiku-3-5',  // Use cheapest model
        max_tokens: 1,
        messages: [{ role: 'user', content: '.' }],
      })

      // Access headers via raw response
      // Note: Anthropic SDK exposes headers on response._response
      const headers = (response as any)._response?.headers

      return this.parseHeaders(headers, model)
    },

    parseHeaders(headers: Headers, model?: string): RateLimitStatus {
      const parseDate = (val: string | null) => val ? new Date(val) : new Date()
      const parseInt = (val: string | null) => val ? Number(val) : 0

      return {
        provider: 'anthropic',
        model: model ?? 'unknown',
        requests: {
          limit: parseInt(headers.get('anthropic-ratelimit-requests-limit')),
          remaining: parseInt(headers.get('anthropic-ratelimit-requests-remaining')),
          resetsAt: parseDate(headers.get('anthropic-ratelimit-requests-reset')),
        },
        inputTokens: {
          limit: parseInt(headers.get('anthropic-ratelimit-input-tokens-limit')),
          remaining: parseInt(headers.get('anthropic-ratelimit-input-tokens-remaining')),
          resetsAt: parseDate(headers.get('anthropic-ratelimit-input-tokens-reset')),
        },
        outputTokens: {
          limit: parseInt(headers.get('anthropic-ratelimit-output-tokens-limit')),
          remaining: parseInt(headers.get('anthropic-ratelimit-output-tokens-remaining')),
          resetsAt: parseDate(headers.get('anthropic-ratelimit-output-tokens-reset')),
        },
        lastQueried: new Date(),
        stale: false,
      }
    },

    estimateCost(model: string, tokens: { input: number; output: number }): number {
      const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['claude-sonnet-4']
      return tokens.input * pricing.input + tokens.output * pricing.output
    },
  }
}
```

### Rate Limit Monitor

```typescript
// src/rate-limits/monitor.ts

import type { RateLimitMonitorConfig, RateLimitStatus, UsageStats, Provider } from './types'
import { createAnthropicClient } from './providers/anthropic'
import { createOpenAIClient } from './providers/openai'
import { RateLimitStore } from './store'

export class RateLimitMonitor {
  private providers: Map<Provider, ProviderClient>
  private store: RateLimitStore
  private config: Required<RateLimitMonitorConfig>

  constructor(config: RateLimitMonitorConfig) {
    this.config = {
      refreshIntervalMs: 30000,
      cacheTtlMs: 10000,
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
      db: this.config.db,
    })
  }

  /**
   * Get current rate limit status for a provider/model.
   * Returns cached data if fresh, otherwise queries the API.
   */
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

  /**
   * Get execution-scoped usage statistics.
   * Queries the Smithers database for token usage.
   */
  async getUsage(executionId: string): Promise<UsageStats> {
    if (!this.config.db) {
      throw new Error('Database not configured for usage tracking')
    }

    const agents = this.config.db.agents.list(executionId)
    const execution = this.config.db.execution.get(executionId)

    let totalInput = 0
    let totalOutput = 0
    const byIteration = new Map<number, { input: number; output: number }>()
    const byModel = new Map<string, { input: number; output: number; requests: number }>()

    for (const agent of agents) {
      const input = agent.tokens_input ?? 0
      const output = agent.tokens_output ?? 0
      totalInput += input
      totalOutput += output

      // Group by iteration (from phase)
      // Note: Would need to join with phases table for iteration info

      // Group by model
      const modelStats = byModel.get(agent.model) ?? { input: 0, output: 0, requests: 0 }
      modelStats.input += input
      modelStats.output += output
      modelStats.requests += 1
      byModel.set(agent.model, modelStats)
    }

    // Estimate costs
    const anthropicClient = this.providers.get('anthropic')
    let costEstimate = { input: 0, output: 0, total: 0 }
    if (anthropicClient) {
      for (const [model, stats] of byModel) {
        const cost = anthropicClient.estimateCost(model, stats)
        costEstimate.total += cost
      }
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

  /**
   * Calculate remaining capacity as a percentage.
   */
  async getRemainingCapacity(provider: Provider, model: string): Promise<{
    requests: number  // 0.0-1.0
    inputTokens: number
    outputTokens: number
    overall: number  // Minimum of all
  }> {
    const status = await this.getStatus(provider, model)

    const requests = status.requests.limit > 0
      ? status.requests.remaining / status.requests.limit
      : 1

    const inputTokens = status.inputTokens.limit > 0
      ? status.inputTokens.remaining / status.inputTokens.limit
      : 1

    const outputTokens = status.outputTokens.limit > 0
      ? status.outputTokens.remaining / status.outputTokens.limit
      : 1

    return {
      requests,
      inputTokens,
      outputTokens,
      overall: Math.min(requests, inputTokens, outputTokens),
    }
  }

  /**
   * Update rate limit status from response headers.
   * Call this after each API request to keep cache fresh.
   */
  updateFromHeaders(provider: Provider, model: string, headers: Headers): void {
    const client = this.providers.get(provider)
    if (!client) return

    const status = client.parseHeaders(headers)
    status.model = model
    this.store.set(status as RateLimitStatus)
  }
}
```

### Throttle Controller

```typescript
// src/rate-limits/throttle.ts

import type { RateLimitMonitor, ThrottleConfig, Provider } from './types'

export class ThrottleController {
  private monitor: RateLimitMonitor
  private config: ThrottleConfig
  private lastRequestTime: number = 0

  constructor(monitor: RateLimitMonitor, config: Partial<ThrottleConfig> = {}) {
    this.monitor = monitor
    this.config = {
      targetUtilization: 0.8,
      minDelayMs: 0,
      maxDelayMs: 60000,
      backoffStrategy: 'exponential',
      blockOnLimit: true,
      ...config,
    }
  }

  /**
   * Acquire permission to make a request.
   * Returns the delay in ms that was applied.
   * Throws if blockOnLimit is false and at capacity.
   */
  async acquire(provider: Provider, model: string): Promise<number> {
    const capacity = await this.monitor.getRemainingCapacity(provider, model)

    // Calculate delay based on remaining capacity
    let delay = 0

    if (capacity.overall <= 0) {
      // At or over limit
      if (!this.config.blockOnLimit) {
        throw new Error(`Rate limit exceeded for ${provider}/${model}`)
      }
      // Wait for reset
      const status = await this.monitor.getStatus(provider, model)
      const resetTime = Math.min(
        status.requests.resetsAt.getTime(),
        status.inputTokens.resetsAt.getTime(),
        status.outputTokens.resetsAt.getTime()
      )
      delay = Math.max(0, resetTime - Date.now())
    } else if (capacity.overall < (1 - this.config.targetUtilization)) {
      // Approaching limit, apply backoff
      const utilizationRatio = 1 - capacity.overall
      const targetRatio = 1 - this.config.targetUtilization

      if (this.config.backoffStrategy === 'exponential') {
        // Exponential backoff as we approach limit
        const factor = Math.pow(utilizationRatio / targetRatio, 2)
        delay = this.config.minDelayMs + factor * (this.config.maxDelayMs - this.config.minDelayMs)
      } else {
        // Linear backoff
        const factor = utilizationRatio / targetRatio
        delay = this.config.minDelayMs + factor * (this.config.maxDelayMs - this.config.minDelayMs)
      }
    }

    // Enforce minimum delay
    delay = Math.max(delay, this.config.minDelayMs)

    // Enforce time since last request
    const timeSinceLastRequest = Date.now() - this.lastRequestTime
    if (timeSinceLastRequest < delay) {
      delay = delay - timeSinceLastRequest
    } else {
      delay = 0
    }

    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    this.lastRequestTime = Date.now()
    return delay
  }
}
```

### Middleware Integration

```typescript
// src/rate-limits/middleware.ts

import type { SmithersMiddleware } from '../middleware/types'
import type { RateLimitMonitor, ThrottleConfig, Provider } from './types'
import { ThrottleController } from './throttle'

export interface RateLimitMiddlewareOptions {
  monitor: RateLimitMonitor
  throttle?: Partial<ThrottleConfig>
  /** Map model names to providers. Default: all models → anthropic */
  modelToProvider?: (model: string) => Provider
}

export function rateLimitingMiddleware(options: RateLimitMiddlewareOptions): SmithersMiddleware {
  const controller = new ThrottleController(options.monitor, options.throttle)
  const getProvider = options.modelToProvider ?? (() => 'anthropic' as Provider)

  return {
    name: 'rate-limiting',

    wrapExecute: async (doExecute, execOptions) => {
      const provider = getProvider(execOptions.model ?? 'sonnet')
      const model = execOptions.model ?? 'sonnet'

      // Wait for rate limit capacity
      const delayMs = await controller.acquire(provider, model)
      if (delayMs > 0) {
        console.log(`[rate-limit] Delayed ${delayMs}ms for ${provider}/${model}`)
      }

      return doExecute()
    },
  }
}
```

### Database Schema Additions

```sql
-- Rate limit snapshots for historical analysis and debugging
CREATE TABLE IF NOT EXISTS rate_limit_snapshots (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,               -- 'anthropic' | 'openai'
  model TEXT NOT NULL,

  -- Request limits
  requests_limit INTEGER,
  requests_remaining INTEGER,
  requests_reset_at TEXT,               -- ISO8601

  -- Input token limits
  input_tokens_limit INTEGER,
  input_tokens_remaining INTEGER,
  input_tokens_reset_at TEXT,

  -- Output token limits
  output_tokens_limit INTEGER,
  output_tokens_remaining INTEGER,
  output_tokens_reset_at TEXT,

  -- Metadata
  tier TEXT,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_snapshots_provider_model
  ON rate_limit_snapshots(provider, model, captured_at DESC);

-- Add index for efficient execution-scoped token queries
CREATE INDEX IF NOT EXISTS idx_agents_execution_tokens
  ON agents(execution_id, tokens_input, tokens_output);
```

</architecture>

---

## Usage Examples

<examples>

### Basic Rate Limit Monitoring

```typescript
import { createRateLimitMonitor } from 'smithers/rate-limits'

const monitor = createRateLimitMonitor({
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
})

// Query current rate limit status
const status = await monitor.getStatus('anthropic', 'claude-sonnet-4')
console.log(`Requests remaining: ${status.requests.remaining}/${status.requests.limit}`)
console.log(`Input tokens remaining: ${status.inputTokens.remaining}/${status.inputTokens.limit}`)
console.log(`Resets at: ${status.requests.resetsAt.toISOString()}`)

// Get remaining capacity as percentage
const capacity = await monitor.getRemainingCapacity('anthropic', 'claude-sonnet-4')
console.log(`Overall capacity: ${(capacity.overall * 100).toFixed(1)}%`)
```

### Execution-Scoped Usage Tracking

```typescript
import { createSmithersDB } from 'smithers/db'
import { createRateLimitMonitor } from 'smithers/rate-limits'

const db = await createSmithersDB('./smithers.db')
const monitor = createRateLimitMonitor({
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  db,
})

// Start execution
const executionId = db.execution.start('My Task', './task.tsx')

// ... run ralph loop with multiple agents ...

// Get usage stats for this execution only
const usage = await monitor.getUsage(executionId)
console.log(`Execution ${executionId}:`)
console.log(`  Total tokens: ${usage.tokens.total}`)
console.log(`  Estimated cost: $${usage.costEstimate.total.toFixed(4)}`)
console.log(`  Requests: ${usage.requestCount}`)

// Breakdown by model
for (const [model, stats] of usage.byModel) {
  console.log(`  ${model}: ${stats.input + stats.output} tokens, ${stats.requests} requests`)
}
```

### Middleware Integration

```tsx
import { SmithersProvider, Claude } from 'smithers'
import { createRateLimitMonitor, rateLimitingMiddleware } from 'smithers/rate-limits'

const monitor = createRateLimitMonitor({
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  db,
})

const middleware = rateLimitingMiddleware({
  monitor,
  throttle: {
    targetUtilization: 0.8,  // Stay under 80% of limits
    backoffStrategy: 'exponential',
  },
})

function App() {
  return (
    <SmithersProvider
      db={db}
      executionId={executionId}
      middleware={[middleware]}
    >
      <Orchestration>
        <Phase name="Analysis">
          <Claude model="sonnet">
            Analyze the codebase
          </Claude>
        </Phase>
      </Orchestration>
    </SmithersProvider>
  )
}
```

### Real-Time Capacity Dashboard

```typescript
// Poll for rate limit status
setInterval(async () => {
  const status = await monitor.getStatus('anthropic', 'claude-sonnet-4')
  const usage = await monitor.getUsage(currentExecutionId)

  console.clear()
  console.log('=== Rate Limit Status ===')
  console.log(`Requests: ${status.requests.remaining}/${status.requests.limit}`)
  console.log(`Input tokens: ${status.inputTokens.remaining}/${status.inputTokens.limit}`)
  console.log(`Output tokens: ${status.outputTokens.remaining}/${status.outputTokens.limit}`)
  console.log('')
  console.log('=== Execution Usage ===')
  console.log(`Tokens used: ${usage.tokens.total}`)
  console.log(`Cost: $${usage.costEstimate.total.toFixed(4)}`)
}, 5000)
```

</examples>

---

## Implementation Plan

<implementation>

### Phase 1: Core Types & Provider Clients

**Files to create:**
- `src/rate-limits/types.ts` - All TypeScript interfaces
- `src/rate-limits/providers/base.ts` - Provider interface
- `src/rate-limits/providers/anthropic.ts` - Anthropic implementation

**Dependencies to add:**
- `@anthropic-ai/sdk` - For direct API calls

**Tasks:**
1. Define all TypeScript interfaces
2. Implement Anthropic provider client with header parsing
3. Add minimal request method for querying limits
4. Write unit tests for header parsing

### Phase 2: Storage & Monitor

**Files to create:**
- `src/rate-limits/store.ts` - In-memory cache with TTL
- `src/rate-limits/monitor.ts` - Main RateLimitMonitor class

**Schema changes:**
- Add `rate_limit_snapshots` table
- Add index on `agents(execution_id, tokens_input, tokens_output)`

**Tasks:**
1. Implement RateLimitStore with LRU cache
2. Implement RateLimitMonitor class
3. Add execution-scoped usage queries
4. Write integration tests with mock database

### Phase 3: Throttle Controller & Middleware

**Files to create:**
- `src/rate-limits/throttle.ts` - ThrottleController class
- `src/rate-limits/middleware.ts` - SmithersMiddleware integration

**Tasks:**
1. Implement throttle delay calculation
2. Implement exponential/linear backoff
3. Create rateLimitingMiddleware
4. Integrate with SmithersProvider context

### Phase 4: OpenAI Provider (Optional)

**Files to create:**
- `src/rate-limits/providers/openai.ts` - OpenAI implementation

**Dependencies to add:**
- `openai` - OpenAI SDK

**Tasks:**
1. Implement OpenAI provider client
2. Handle different header format
3. Add pricing data for cost estimation

### Phase 5: Public API & Documentation

**Files to create:**
- `src/rate-limits/index.ts` - Public exports
- Update `src/index.ts` - Re-export rate-limits module

**Tasks:**
1. Export all public APIs
2. Add JSDoc comments
3. Create usage examples
4. Update README if needed

</implementation>

---

## Testing Strategy

<testing>

### Unit Tests

```typescript
// src/rate-limits/providers/anthropic.test.ts
import { describe, test, expect } from 'bun:test'
import { createAnthropicClient } from './anthropic'

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
  })

  test('estimateCost calculates correctly', () => {
    const client = createAnthropicClient({ apiKey: 'test' })
    const cost = client.estimateCost('claude-sonnet-4', { input: 1000, output: 500 })

    // $3/M input + $15/M output
    expect(cost).toBeCloseTo(0.003 + 0.0075, 6)
  })
})
```

### Integration Tests

```typescript
// src/rate-limits/monitor.test.ts
import { describe, test, expect, beforeEach } from 'bun:test'
import { createSmithersDB } from '../db'
import { RateLimitMonitor } from './monitor'

describe('RateLimitMonitor', () => {
  let db: SmithersDB

  beforeEach(async () => {
    db = await createSmithersDB(':memory:')
  })

  test('getUsage returns execution-scoped stats', async () => {
    // Create execution with agents
    const execId = db.execution.start('Test', './test.tsx')
    const agentId = db.agents.start('Test prompt', 'sonnet')
    db.agents.complete(agentId, 'Result', undefined, { input: 100, output: 50 })

    const monitor = new RateLimitMonitor({ db })
    const usage = await monitor.getUsage(execId)

    expect(usage.tokens.input).toBe(100)
    expect(usage.tokens.output).toBe(50)
    expect(usage.requestCount).toBe(1)
  })
})
```

</testing>

---

## Success Criteria

<success-criteria>

1. **Rate Limit Visibility** - Can query current rate limit status at any time without guessing
2. **Execution Isolation** - Token usage for ralph loop is clearly separated from other processes
3. **Proactive Throttling** - System slows down before hitting limits, not after
4. **Cost Tracking** - Real-time cost estimates per execution
5. **Middleware Integration** - Works seamlessly with existing SmithersMiddleware pattern
6. **Minimal Overhead** - Rate limit queries use cheapest model/minimal tokens
7. **Database Persistence** - Rate limit snapshots stored for debugging/analysis

</success-criteria>

---

## References

<references>

**Smithers Components:**
- `src/db/agents.ts` - Existing token tracking
- `src/db/schema.sql` - Database schema
- `src/components/Claude.tsx` - Claude component
- `issues/middleware-integration-revised.md` - Middleware pattern

**Provider Documentation:**
- [Anthropic Rate Limits](https://platform.claude.com/docs/en/api/rate-limits) - Headers, tiers, token bucket algorithm
- [OpenAI Rate Limits](https://platform.openai.com/docs/guides/rate-limits) - Headers, limits

**API SDKs:**
- `@anthropic-ai/sdk` - Anthropic TypeScript SDK
- `openai` - OpenAI TypeScript SDK

</references>
