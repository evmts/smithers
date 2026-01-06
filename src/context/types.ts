import type { ReactNode } from 'react'
import type { ZodType } from 'zod'
import type {
  ClaudeProps,
  ClaudeApiProps,
  PermissionMode,
  AgentDefinition,
  ToolRetryOptions,
} from '../core/types.js'
import type { MCPServerConfig } from '../mcp/types.js'

/**
 * Rate limit configuration matching Anthropic's limits
 * Uses token bucket algorithm with continuous replenishment
 */
export interface RateLimitConfig {
  /** Requests per minute (RPM) - default: 60 */
  rpm?: number
  /** Input tokens per minute (ITPM) - default: 100000 */
  itpm?: number
  /** Output tokens per minute (OTPM) - default: 20000 */
  otpm?: number
  /** Whether to queue requests when rate limited (vs reject immediately) - default: true */
  queueWhenLimited?: boolean
  /** Maximum queue size before rejecting new requests - default: 100 */
  maxQueueSize?: number
  /** Maximum time to wait in queue (ms) before timing out - default: 60000 */
  queueTimeoutMs?: number
}

/**
 * Budget/usage limit configuration
 */
export interface UsageLimitConfig {
  /** Maximum input tokens allowed in the window */
  maxInputTokens?: number
  /** Maximum output tokens allowed in the window */
  maxOutputTokens?: number
  /** Maximum total tokens (input + output) allowed in the window */
  maxTotalTokens?: number
  /** Maximum cost in USD allowed in the window */
  maxCostUsd?: number
  /** Time window for limits - default: 'all-time' */
  window?: 'hour' | 'day' | 'week' | 'month' | 'all-time'
}

/**
 * Current usage statistics
 */
export interface UsageStats {
  /** Total input tokens consumed */
  inputTokens: number
  /** Total output tokens consumed */
  outputTokens: number
  /** Total tokens (input + output) */
  totalTokens: number
  /** Tokens read from cache (don't count against ITPM) */
  cacheReadTokens: number
  /** Tokens used to create cache entries */
  cacheCreationTokens: number
  /** Total cost in USD */
  costUsd: number
  /** Number of API requests made */
  requestCount: number
  /** Start of current tracking window */
  windowStart: Date
  /** End of current tracking window */
  windowEnd: Date
}

/**
 * Token bucket state for rate limiting
 */
export interface TokenBucketState {
  rpm: { tokens: number; lastRefill: number }
  itpm: { tokens: number; lastRefill: number }
  otpm: { tokens: number; lastRefill: number }
}

/**
 * Token estimation for rate limiting
 */
export interface TokenEstimate {
  inputTokens: number
  outputTokens: number
}

/**
 * Usage report after a request completes
 */
export interface UsageReport {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  costUsd?: number
  model?: string
}

/**
 * Events emitted by the provider
 */
export interface ClaudeProviderEvents {
  /** Called when a request is rate limited */
  onRateLimited?: (info: {
    type: 'rpm' | 'itpm' | 'otpm'
    waitMs: number
    queuePosition?: number
  }) => void
  /** Called when usage stats are updated */
  onUsageUpdate?: (stats: UsageStats) => void
  /** Called when usage approaches limit (80% threshold) */
  onBudgetWarning?: (info: {
    metric: 'inputTokens' | 'outputTokens' | 'totalTokens' | 'cost'
    current: number
    limit: number
    percentUsed: number
  }) => void
  /** Called when budget limit is exceeded and execution is paused */
  onBudgetPaused?: (info: {
    reason: string
    resume: () => void
  }) => void
  /** Called when a request is queued due to rate limiting */
  onRequestQueued?: (info: { position: number; estimatedWaitMs: number }) => void
  /** Called when a request is dequeued and proceeds */
  onRequestDequeued?: (info: { waitedMs: number }) => void
}

/**
 * Default props that can be set at provider level
 * These are shared between Claude and ClaudeApi where applicable
 */
export interface ClaudeDefaultProps {
  // Common to both
  /** Claude model to use */
  model?: string
  /** MCP server configurations */
  mcpServers?: Record<string, MCPServerConfig> | MCPServerConfig[]
  /** Zod schema for structured output */
  schema?: ZodType

  // Claude (Agent SDK) specific
  /** List of tool names that are auto-allowed */
  allowedTools?: string[]
  /** List of tool names that are disallowed */
  disallowedTools?: string[]
  /** Specify the base set of available built-in tools */
  tools?: string[] | { type: 'preset'; preset: 'claude_code' }
  /** Maximum number of conversation turns */
  maxTurns?: number
  /** Maximum budget in USD for a single query */
  maxBudgetUsd?: number
  /** Maximum tokens for thinking/reasoning */
  maxThinkingTokens?: number
  /** System prompt configuration */
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string }
  /** Permission mode for the session */
  permissionMode?: PermissionMode
  /** Working directory for the session */
  cwd?: string
  /** Custom subagent definitions */
  agents?: Record<string, AgentDefinition>
  /** Additional directories Claude can access */
  additionalDirectories?: string[]

  // ClaudeApi (API SDK) specific
  /** System prompt for API calls */
  system?: string
  /** Maximum number of tool execution iterations */
  maxToolIterations?: number
  /** Enable streaming mode */
  stream?: boolean
  /** Number of retries for API calls */
  retries?: number
  /** Tool retry configuration */
  toolRetry?: ToolRetryOptions
}

/**
 * Storage adapter interface for persistence
 */
export interface StorageAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * Props for ClaudeProvider component
 */
export interface ClaudeProviderProps {
  children: ReactNode

  /** Default props for nested Claude/ClaudeApi components */
  defaults?: ClaudeDefaultProps

  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig

  /** Usage/budget limits */
  usageLimit?: UsageLimitConfig

  /** Event callbacks */
  events?: ClaudeProviderEvents

  /** Persistence configuration for usage tracking */
  persistence?: {
    /** Enable persistence across restarts */
    enabled?: boolean
    /** Storage key prefix - default: 'smithers_usage' */
    keyPrefix?: string
    /** Custom storage adapter (no default - must be provided if enabled) */
    storage?: StorageAdapter
  }

  /** API key to use (overrides ANTHROPIC_API_KEY env var) */
  apiKey?: string

  /**
   * Custom token estimation function for rate limiting
   * Called before each request to estimate token usage
   */
  estimateTokens?: (prompt: string) => TokenEstimate

  /** Enable debug logging */
  debug?: boolean
}

/**
 * Context value exposed to descendants
 */
export interface ClaudeContextValue {
  /** Get merged props for a Claude component */
  getClaudeProps: <T extends ZodType>(componentProps: ClaudeProps<T>) => ClaudeProps<T>

  /** Get merged props for a ClaudeApi component */
  getClaudeApiProps: <T extends ZodType>(componentProps: ClaudeApiProps<T>) => ClaudeApiProps<T>

  /** Acquire rate limit permission before making a request */
  acquireRateLimit: (estimate: TokenEstimate) => Promise<void>

  /** Report actual usage after a request completes */
  reportUsage: (usage: UsageReport) => void

  /** Check if within budget limits */
  checkBudget: () => { allowed: boolean; reason?: string }

  /** Wait for budget to become available (pause-and-wait behavior) */
  waitForBudget: () => Promise<void>

  /** Get current usage stats */
  getUsageStats: () => UsageStats

  /** Reset usage stats (e.g., for new billing period) */
  resetUsage: () => void

  /** API key from provider */
  apiKey?: string

  /** Custom token estimation function */
  estimateTokens?: (prompt: string) => TokenEstimate

  /** Whether rate limiting is enabled */
  rateLimitEnabled: boolean

  /** Whether usage tracking is enabled */
  usageTrackingEnabled: boolean
}

/**
 * Budget check result
 */
export interface BudgetCheckResult {
  allowed: boolean
  reason?: string
}
