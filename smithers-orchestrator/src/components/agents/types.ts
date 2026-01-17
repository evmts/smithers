// Agent system types for Smithers orchestrator
// Defines interfaces for tools, MCP servers, stop conditions, and agent props

import type { JSX } from 'solid-js'
import type { z } from 'zod'

// ============================================================================
// JSON Schema type (simplified)
// ============================================================================

export interface JSONSchema {
  type?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: any[]
  description?: string
  default?: any
  [key: string]: any
}

// ============================================================================
// Tool Context
// ============================================================================

export interface ToolContext {
  /**
   * Current execution ID
   */
  executionId: string

  /**
   * Current agent ID
   */
  agentId: string

  /**
   * Working directory
   */
  cwd: string

  /**
   * Environment variables
   */
  env: Record<string, string>

  /**
   * Log a message
   */
  log: (message: string) => void
}

// ============================================================================
// Tool Definition
// ============================================================================

export interface Tool {
  /**
   * Tool name (must be unique)
   */
  name: string

  /**
   * Human-readable description
   */
  description: string

  /**
   * JSON Schema for input validation
   */
  inputSchema: JSONSchema

  /**
   * Execute the tool with given input
   */
  execute: (input: any, context: ToolContext) => Promise<any>
}

// ============================================================================
// MCP Server Definition
// ============================================================================

export interface MCPServer {
  /**
   * Server name (for identification)
   */
  name: string

  /**
   * Command to run the MCP server
   */
  command: string

  /**
   * Command arguments
   */
  args?: string[]

  /**
   * Environment variables
   */
  env?: Record<string, string>
}

// ============================================================================
// Stop Conditions
// ============================================================================

export type StopConditionType =
  | 'token_limit'
  | 'time_limit'
  | 'turn_limit'
  | 'pattern'
  | 'custom'

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
// Agent Result
// ============================================================================

export type StopReason = 'completed' | 'stop_condition' | 'error' | 'cancelled'

export interface AgentResult<T = any> {
  /**
   * Raw text output from the agent
   */
  output: string

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
// Base Agent Props
// ============================================================================

export interface BaseAgentProps {
  /**
   * The prompt to send to the agent (usually as children)
   */
  children: JSX.Element

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
}
