/**
 * React hooks for ClaudeProvider context
 *
 * These hooks provide access to the ClaudeProvider context from within
 * React components or custom hooks.
 */

// Re-export hooks from claude-provider
export { useClaudeContext, useClaudeContextOptional } from './claude-provider.js'

// Export types that are commonly needed with hooks
export type {
  ClaudeContextValue,
  UsageStats,
  TokenEstimate,
  UsageReport,
  BudgetCheckResult,
} from './types.js'
