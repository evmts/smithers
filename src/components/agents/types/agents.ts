// Agent props type definitions for Smithers orchestrator

import type { ReactNode } from 'react'
import type { z } from 'zod'
import type { Tool, MCPServer } from './tools.js'
import type { SmithersStreamPart } from '../../../streaming/types.js'
import type { AgentResult, StopConditionType } from './execution.js'
import type { SmithersMiddleware } from '../../../middleware/types.js'

// ============================================================================
// Stop Condition (defined here to avoid circular dependency)
// ============================================================================

export interface StopCondition {
  /**
   * Type of stop condition
   */
  type: StopConditionType

  /**
   * Value for the condition (interpretation depends on type)
   * - token_limit: max tokens
   * - time_limit: max milliseconds
   * - turn_limit: max turns
   * - pattern: regex pattern to match in output
   */
  value?: number | string | RegExp

  /**
   * Custom function for 'custom' type
   */
  fn?: (result: AgentResult) => boolean

  /**
   * Human-readable message when condition triggers
   */
  message?: string
}

// ============================================================================
// Base Agent Props
// ============================================================================

export interface BaseAgentProps {
  /**
   * The prompt to send to the agent (usually as children)
   */
  children: ReactNode

  /**
   * Tools available to the agent
   * Can be:
   * - string: built-in tool name
   * - Tool: custom tool definition
   * - MCPServer: MCP server to connect to
   */
  tools?: (string | Tool | MCPServer)[]

  /**
   * Conditions that will stop the agent
   */
  stopConditions?: StopCondition[]

  /**
   * Maximum number of turns (agentic loops)
   */
  maxTurns?: number

  /**
   * Maximum tokens for output
   */
  maxTokens?: number

  /**
   * Timeout in milliseconds
   */
  timeout?: number

  /**
   * Working directory for CLI execution
   */
  cwd?: string

  /**
   * Called when agent finishes successfully
   */
  onFinished?: (result: AgentResult) => void

  /**
   * Called when agent encounters an error
   */
  onError?: (error: Error) => void

  /**
   * Called when agent makes a tool call
   */
  onToolCall?: (tool: string, input: any) => void

  /**
   * Called for progress updates
   */
  onProgress?: (message: string) => void

  /**
   * Called for typed stream events (when enabled)
   */
  onStreamPart?: (part: SmithersStreamPart) => void

  /**
   * Enable database reporting for this agent
   */
  reportingEnabled?: boolean

  /**
   * Validate the result before accepting
   */
  validate?: (result: AgentResult) => boolean | Promise<boolean>

  /**
   * Retry if validation fails
   */
  retryOnValidationFailure?: boolean

  /**
   * Maximum retry attempts
   */
  maxRetries?: number

  /**
   * System prompt for the agent
   */
  systemPrompt?: string
}

// ============================================================================
// Claude-Specific Props
// ============================================================================

export type ClaudeModel = 'opus' | 'sonnet' | 'haiku' | string

export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'

export type ClaudeOutputFormat = 'text' | 'json' | 'stream-json'

export interface ClaudeProps<TSchema extends z.ZodType = z.ZodType> extends BaseAgentProps {
  /**
   * Claude model to use
   * - 'opus': Claude Opus (most capable)
   * - 'sonnet': Claude Sonnet (balanced)
   * - 'haiku': Claude Haiku (fastest)
   * - string: custom model ID
   */
  model?: ClaudeModel

  /**
   * Permission mode for file operations
   * - 'default': ask for permission
   * - 'acceptEdits': auto-accept edits
   * - 'bypassPermissions': skip all permission checks
   */
  permissionMode?: ClaudePermissionMode

  /**
   * Path to MCP configuration file
   */
  mcpConfig?: string

  /**
   * Output format
   * - 'text': plain text output
   * - 'json': structured JSON output
   * - 'stream-json': streaming JSON output
   */
  outputFormat?: ClaudeOutputFormat

  /**
   * Specific tools to allow (whitelist)
   */
  allowedTools?: string[]

  /**
   * Specific tools to disallow (blacklist)
   */
  disallowedTools?: string[]

  /**
   * Continue from previous conversation
   */
  continueConversation?: boolean

  /**
   * Resume a specific session
   */
  resumeSession?: string

  /**
   * Zod schema for structured output validation.
   * When provided, the output will be parsed and validated against this schema.
   * If validation fails, the session will be resumed with error feedback.
   */
  schema?: TSchema

  /**
   * Maximum retries for schema validation failures.
   * @default 2
   */
  schemaRetries?: number

  /**
   * Number of tail log entries to display during execution.
   * @default 10
   */
  tailLogCount?: number

  /**
   * Number of lines to show per tail log entry.
   * @default 10
   */
  tailLogLines?: number

  /**
   * Working directory for the agent.
   */
  cwd?: string

  /**
   * Use Claude subscription credits instead of API credits.
   * When true, excludes ANTHROPIC_API_KEY from environment.
   * @default true
   */
  useSubscription?: boolean

  /**
   * Middleware applied to this Claude execution.
   * Provider middleware are prepended automatically.
   */
  middleware?: SmithersMiddleware[]

  /**
   * Enable typed stream parts for Claude CLI output.
   * @default false
   */
  experimentalTypedStreaming?: boolean

  /**
   * Write legacy raw text logs alongside NDJSON logs.
   * @default false
   */
  legacyLogFormat?: boolean

  /**
   * Record stream events to the database.
   * @default true when reportingEnabled is true
   */
  recordStreamEvents?: boolean
}
