// Execution-related type definitions for Smithers orchestrator

import type { z } from 'zod'
import type { StopCondition, ClaudeModel, ClaudePermissionMode, ClaudeOutputFormat } from './agents.js'

// ============================================================================
// Stop Conditions
// ============================================================================

export type StopConditionType =
  | 'token_limit'
  | 'time_limit'
  | 'turn_limit'
  | 'pattern'
  | 'custom'

export type StopReason = 'completed' | 'stop_condition' | 'error' | 'cancelled'

// ============================================================================
// Agent Result
// ============================================================================

export interface AgentResult<T = any> {
  /**
   * Raw text output from the agent
   */
  output: string

  /**
   * Extracted reasoning content (if middleware provides it)
   */
  reasoning?: string

  /**
   * Structured output (if JSON output was requested or schema was provided)
   * When a Zod schema is provided, this will be typed according to the schema.
   */
  structured?: T

  /**
   * Token usage
   */
  tokensUsed: {
    input: number
    output: number
  }

  /**
   * Number of turns used
   */
  turnsUsed: number

  /**
   * Reason the agent stopped
   */
  stopReason: StopReason

  /**
   * Execution duration in milliseconds
   */
  durationMs: number

  /**
   * Exit code from CLI (if applicable)
   */
  exitCode?: number

  /**
   * Session ID for resuming the conversation
   */
  sessionId?: string
}

// ============================================================================
// CLI Execution Options
// ============================================================================

export interface CLIExecutionOptions {
  /**
   * The prompt to send
   */
  prompt: string

  /**
   * Model to use
   */
  model?: ClaudeModel

  /**
   * Permission mode
   */
  permissionMode?: ClaudePermissionMode

  /**
   * Maximum turns
   */
  maxTurns?: number

  /**
   * Maximum tokens for output (wired to token_limit stop condition)
   */
  maxTokens?: number

  /**
   * System prompt
   */
  systemPrompt?: string

  /**
   * Output format
   */
  outputFormat?: ClaudeOutputFormat

  /**
   * MCP config path
   */
  mcpConfig?: string

  /**
   * Allowed tools
   */
  allowedTools?: string[]

  /**
   * Disallowed tools
   */
  disallowedTools?: string[]

  /**
   * Timeout in milliseconds
   */
  timeout?: number

  /**
   * Working directory
   */
  cwd?: string

  /**
   * Continue conversation
   */
  continue?: boolean

  /**
   * Resume session ID
   */
  resume?: string

  /**
   * Stop conditions to monitor
   */
  stopConditions?: StopCondition[]

  /**
   * Progress callback
   */
  onProgress?: (message: string) => void

  /**
   * Tool call callback
   */
  onToolCall?: (tool: string, input: any) => void

  /**
   * Zod schema for structured output validation
   */
  schema?: z.ZodType

  /**
   * Maximum retries for schema validation failures
   * @default 2
   */
  schemaRetries?: number

  /**
   * Use Claude subscription credits instead of API credits.
   * When true, excludes ANTHROPIC_API_KEY from environment.
   * @default true
   */
  useSubscription?: boolean
}
