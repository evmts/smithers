/**
 * ClaudeProvider module
 *
 * Provides React context for default props, rate limiting, and usage tracking
 * for Claude and ClaudeApi components.
 *
 * @example
 * ```tsx
 * import { ClaudeProvider, useClaudeContext } from '@evmts/smithers'
 *
 * function MyWorkflow() {
 *   return (
 *     <ClaudeProvider
 *       defaults={{ model: 'claude-sonnet-4-5-20250929' }}
 *       rateLimit={{ rpm: 60, itpm: 100000 }}
 *       usageLimit={{ maxCostUsd: 10, window: 'day' }}
 *     >
 *       <Claude>Do something</Claude>
 *     </ClaudeProvider>
 *   )
 * }
 * ```
 */

// Main provider component and context
export {
  ClaudeProvider,
  ClaudeContext,
  useClaudeContext,
  useClaudeContextOptional,
} from './claude-provider.js'

// Rate limiter
export { TokenBucketRateLimiter, RateLimitError } from './rate-limiter.js'

// Usage tracker
export { UsageTracker, BudgetExceededError } from './usage-tracker.js'

// Types
export type {
  // Provider props
  ClaudeProviderProps,
  ClaudeDefaultProps,
  ClaudeProviderEvents,

  // Context value
  ClaudeContextValue,

  // Rate limiting
  RateLimitConfig,
  TokenBucketState,

  // Usage tracking
  UsageLimitConfig,
  UsageStats,
  UsageReport,
  TokenEstimate,
  BudgetCheckResult,

  // Persistence
  StorageAdapter,
} from './types.js'
