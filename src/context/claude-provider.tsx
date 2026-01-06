import React, { createContext, useContext, useMemo, useRef, useEffect } from 'react'
import type { ZodType } from 'zod'
import type {
  ClaudeProviderProps,
  ClaudeContextValue,
  ClaudeDefaultProps,
  UsageStats,
  TokenEstimate,
} from './types.js'
import type { ClaudeProps, ClaudeApiProps } from '../core/types.js'
import type { MCPServerConfig } from '../mcp/types.js'
import { TokenBucketRateLimiter, RateLimitError } from './rate-limiter.js'
import { UsageTracker } from './usage-tracker.js'

/**
 * React Context for ClaudeProvider
 */
export const ClaudeContext = createContext<ClaudeContextValue | null>(null)

/**
 * Default token estimation function
 * Uses simple heuristics: ~4 chars per token for input, fixed estimate for output
 */
function defaultEstimateTokens(prompt: string): TokenEstimate {
  return {
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: 1000, // Conservative estimate
  }
}

/**
 * Merge default props with component props
 * Component props always take precedence
 */
function mergeClaudeProps<T extends ZodType>(
  defaults: ClaudeDefaultProps,
  componentProps: ClaudeProps<T>
): ClaudeProps<T> {
  const merged: ClaudeProps<T> = { ...componentProps }

  // Only set defaults for props not explicitly provided
  const keysToMerge: Array<keyof ClaudeDefaultProps> = [
    'model',
    'allowedTools',
    'disallowedTools',
    'tools',
    'maxTurns',
    'maxBudgetUsd',
    'maxThinkingTokens',
    'systemPrompt',
    'permissionMode',
    'cwd',
    'schema',
    'additionalDirectories',
  ]

  for (const key of keysToMerge) {
    if (componentProps[key] === undefined && defaults[key] !== undefined) {
      ;(merged as Record<string, unknown>)[key] = defaults[key]
    }
  }

  // Special handling for mcpServers: merge both provider and component servers
  if (defaults.mcpServers && componentProps.mcpServers) {
    // Both are objects (Record<string, MCPServerConfig>) for Claude
    merged.mcpServers = {
      ...(defaults.mcpServers as Record<string, MCPServerConfig>),
      ...componentProps.mcpServers,
    }
  } else if (defaults.mcpServers && !componentProps.mcpServers) {
    merged.mcpServers = defaults.mcpServers as Record<string, MCPServerConfig>
  }

  // agents: merge both provider and component agents
  if (defaults.agents && componentProps.agents) {
    merged.agents = { ...defaults.agents, ...componentProps.agents }
  } else if (defaults.agents && !componentProps.agents) {
    merged.agents = defaults.agents
  }

  return merged
}

function mergeClaudeApiProps<T extends ZodType>(
  defaults: ClaudeDefaultProps,
  componentProps: ClaudeApiProps<T>
): ClaudeApiProps<T> {
  const merged: ClaudeApiProps<T> = { ...componentProps }

  // Map defaults to ClaudeApiProps structure
  if (componentProps.system === undefined) {
    if (defaults.system !== undefined) {
      merged.system = defaults.system
    } else if (defaults.systemPrompt !== undefined) {
      // Fall back to systemPrompt if system not set
      merged.system =
        typeof defaults.systemPrompt === 'string' ? defaults.systemPrompt : undefined
    }
  }

  // Direct mappings
  const directMappings: Array<keyof ClaudeApiProps & keyof ClaudeDefaultProps> = [
    'maxToolIterations',
    'stream',
    'retries',
    'toolRetry',
    'schema',
  ]

  for (const key of directMappings) {
    if (componentProps[key] === undefined && defaults[key] !== undefined) {
      ;(merged as Record<string, unknown>)[key] = defaults[key]
    }
  }

  // mcpServers: ClaudeApiProps uses array format
  if (defaults.mcpServers && !componentProps.mcpServers) {
    if (Array.isArray(defaults.mcpServers)) {
      merged.mcpServers = defaults.mcpServers
    } else {
      // Convert Record to array
      merged.mcpServers = Object.values(defaults.mcpServers)
    }
  }

  return merged
}

/**
 * Create empty usage stats
 */
function createEmptyStats(): UsageStats {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    requestCount: 0,
    windowStart: new Date(),
    windowEnd: new Date(),
  }
}

/**
 * ClaudeProvider component
 *
 * Provides default props, rate limiting, and usage tracking to all
 * nested Claude and ClaudeApi components.
 *
 * @example
 * ```tsx
 * <ClaudeProvider
 *   defaults={{
 *     model: 'claude-sonnet-4-5-20250929',
 *     permissionMode: 'acceptEdits',
 *   }}
 *   rateLimit={{ rpm: 60, itpm: 100000 }}
 *   usageLimit={{ maxCostUsd: 10, window: 'day' }}
 *   events={{
 *     onBudgetPaused: ({ reason, resume }) => {
 *       console.log('Budget paused:', reason)
 *       // User can call resume() after increasing limit
 *     },
 *   }}
 * >
 *   <MyAgentWorkflow />
 * </ClaudeProvider>
 * ```
 */
export function ClaudeProvider({
  children,
  defaults = {},
  rateLimit,
  usageLimit,
  events,
  persistence,
  apiKey,
  estimateTokens,
  debug = false,
}: ClaudeProviderProps): React.ReactElement {
  // Create rate limiter instance (lazy initialization)
  const rateLimiterRef = useRef<TokenBucketRateLimiter | null>(null)
  if (!rateLimiterRef.current && rateLimit) {
    rateLimiterRef.current = new TokenBucketRateLimiter(rateLimit)
  }

  // Create usage tracker instance (lazy initialization)
  const usageTrackerRef = useRef<UsageTracker | null>(null)
  if (!usageTrackerRef.current && usageLimit) {
    usageTrackerRef.current = new UsageTracker(
      usageLimit,
      persistence?.enabled ? persistence.storage : undefined,
      persistence?.keyPrefix
    )

    // Set up pause callback
    if (events?.onBudgetPaused) {
      usageTrackerRef.current.setOnPausedCallback(events.onBudgetPaused)
    }
  }

  // Load persisted usage on mount
  useEffect(() => {
    if (usageTrackerRef.current && persistence?.enabled) {
      usageTrackerRef.current.load()
    }
  }, [persistence?.enabled])

  // Update rate limiter config when rateLimit prop changes
  useEffect(() => {
    if (rateLimiterRef.current && rateLimit) {
      rateLimiterRef.current.updateConfig(rateLimit)
    }
  }, [rateLimit])

  // Update usage tracker limits when usageLimit prop changes
  useEffect(() => {
    if (usageTrackerRef.current && usageLimit) {
      usageTrackerRef.current.updateLimits(usageLimit)
    }
  }, [usageLimit])

  // Create context value with memoization
  const contextValue = useMemo<ClaudeContextValue>(() => {
    const tokenEstimator = estimateTokens ?? defaultEstimateTokens

    return {
      getClaudeProps: <T extends ZodType>(componentProps: ClaudeProps<T>) => {
        return mergeClaudeProps(defaults, componentProps)
      },

      getClaudeApiProps: <T extends ZodType>(componentProps: ClaudeApiProps<T>) => {
        return mergeClaudeApiProps(defaults, componentProps)
      },

      acquireRateLimit: async (estimate: TokenEstimate) => {
        if (!rateLimiterRef.current) return

        try {
          await rateLimiterRef.current.acquire(estimate)
        } catch (error) {
          if (events?.onRateLimited && error instanceof RateLimitError) {
            // Only call onRateLimited for actual rate limit types, not queue_full or timeout
            if (
              error.limitType === 'rpm' ||
              error.limitType === 'itpm' ||
              error.limitType === 'otpm'
            ) {
              events.onRateLimited({
                type: error.limitType,
                waitMs: error.retryAfterMs,
                queuePosition: rateLimiterRef.current.getQueueLength(),
              })
            }
          }
          throw error
        }
      },

      reportUsage: (usage) => {
        if (!usageTrackerRef.current) return

        usageTrackerRef.current.reportUsage(usage)

        // Emit usage update event
        if (events?.onUsageUpdate) {
          events.onUsageUpdate(usageTrackerRef.current.getStats())
        }

        // Check for budget warnings (at 80% usage)
        if (events?.onBudgetWarning) {
          const percentages = usageTrackerRef.current.getUsagePercentages()
          const stats = usageTrackerRef.current.getStats()

          if (percentages.cost >= 80 && percentages.cost < 100) {
            events.onBudgetWarning({
              metric: 'cost',
              current: stats.costUsd,
              limit: usageLimit?.maxCostUsd ?? Infinity,
              percentUsed: percentages.cost,
            })
          }
          if (percentages.totalTokens >= 80 && percentages.totalTokens < 100) {
            events.onBudgetWarning({
              metric: 'totalTokens',
              current: stats.totalTokens,
              limit: usageLimit?.maxTotalTokens ?? Infinity,
              percentUsed: percentages.totalTokens,
            })
          }
          if (percentages.inputTokens >= 80 && percentages.inputTokens < 100) {
            events.onBudgetWarning({
              metric: 'inputTokens',
              current: stats.inputTokens,
              limit: usageLimit?.maxInputTokens ?? Infinity,
              percentUsed: percentages.inputTokens,
            })
          }
          if (percentages.outputTokens >= 80 && percentages.outputTokens < 100) {
            events.onBudgetWarning({
              metric: 'outputTokens',
              current: stats.outputTokens,
              limit: usageLimit?.maxOutputTokens ?? Infinity,
              percentUsed: percentages.outputTokens,
            })
          }
        }
      },

      checkBudget: () => {
        if (!usageTrackerRef.current) {
          return { allowed: true }
        }
        return usageTrackerRef.current.checkBudget()
      },

      waitForBudget: async () => {
        if (!usageTrackerRef.current) return
        return usageTrackerRef.current.waitForBudget()
      },

      getUsageStats: () => {
        if (!usageTrackerRef.current) {
          return createEmptyStats()
        }
        return usageTrackerRef.current.getStats()
      },

      resetUsage: () => {
        if (usageTrackerRef.current) {
          usageTrackerRef.current.reset()
        }
      },

      apiKey,
      estimateTokens: tokenEstimator,
      rateLimitEnabled: !!rateLimit,
      usageTrackingEnabled: !!usageLimit,
    }
  }, [defaults, rateLimit, usageLimit, events, apiKey, estimateTokens])

  return (
    <ClaudeContext.Provider value={contextValue}>{children}</ClaudeContext.Provider>
  )
}

/**
 * Hook to access Claude context
 * Throws if used outside of ClaudeProvider
 */
export function useClaudeContext(): ClaudeContextValue {
  const context = useContext(ClaudeContext)
  if (!context) {
    throw new Error(
      'useClaudeContext must be used within a ClaudeProvider. ' +
        'Wrap your component tree with <ClaudeProvider>.'
    )
  }
  return context
}

/**
 * Hook to access Claude context if available (returns null if not in provider)
 */
export function useClaudeContextOptional(): ClaudeContextValue | null {
  return useContext(ClaudeContext)
}
