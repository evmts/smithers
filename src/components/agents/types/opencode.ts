import type { BaseAgentProps } from './agents.js'
import type { z } from 'zod'
import type { SmithersMiddleware } from '../../../middleware/types.js'

// ============================================================================
// OpenCode-Specific Props
// ============================================================================

/**
 * OpenCode model identifiers
 * Format: "provider/model" e.g., "opencode/big-pickle", "openai/gpt-5.2"
 */
export type OpenCodeModel =
  | 'opencode/big-pickle'
  | 'opencode/gpt-5.2'
  | 'opencode/gpt-5.2-codex'
  | 'opencode/gpt-5.1-codex'
  | 'opencode/claude-sonnet-4-5'
  | 'opencode/claude-opus-4-5'
  | 'opencode/gemini-3-pro'
  | 'opencode/grok-code'
  | 'opencode/kimi-k2'
  | 'opencode/qwen3-coder'
  | 'anthropic/claude-sonnet-4-20250514'
  | 'anthropic/claude-opus-4-20250514'
  | 'openai/gpt-5.2'
  | 'google/gemini-3-pro'
  | string

/**
 * OpenCode permission modes
 */
export type OpenCodePermissionMode = 'auto' | 'ask' | 'deny'

/**
 * OpenCode agent names (from .opencode/agents)
 */
export type OpenCodeAgent = 'default' | 'planner' | 'coder' | string

export interface OpenCodeProps<TSchema extends z.ZodType = z.ZodType> extends BaseAgentProps {
  /**
   * OpenCode model to use in format "provider/model"
   * Examples:
   * - 'opencode/big-pickle' (free stealth model)
   * - 'opencode/gpt-5.2-codex' (GPT-5.2 via Zen)
   * - 'anthropic/claude-sonnet-4-5' (Claude via Anthropic)
   * @default uses opencode's configured default
   */
  model?: OpenCodeModel

  /**
   * Agent to use for this session
   * Corresponds to .opencode/agents/{name}.md
   */
  agent?: OpenCodeAgent

  /**
   * Permission handling for tool calls
   * - 'auto': auto-approve based on opencode.json permissions
   * - 'ask': prompt for permission (default)
   * - 'deny': deny all permission requests
   */
  permissionMode?: OpenCodePermissionMode

  /**
   * Working directory for the session
   * Used to set the project context
   */
  cwd?: string

  /**
   * Continue from an existing session ID
   */
  resumeSession?: string

  /**
   * Custom system prompt override
   */
  systemPrompt?: string

  /**
   * Tool configuration overrides
   * Map of tool name to enabled/disabled
   * e.g., { "bash": true, "write": false }
   */
  toolConfig?: Record<string, boolean>

  /**
   * Zod schema for structured output validation.
   * When provided, the output will be parsed and validated against this schema.
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
   * OpenCode server hostname
   * @default "127.0.0.1"
   */
  hostname?: string

  /**
   * OpenCode server port
   * @default 4096
   */
  port?: number

  /**
   * Server startup timeout in milliseconds
   * @default 10000
   */
  serverTimeout?: number

  /**
   * Middleware applied to this OpenCode execution.
   * Provider middleware are prepended automatically.
   */
  middleware?: SmithersMiddleware[]

  /**
   * Record stream events to the database.
   * @default true when reportingEnabled is true
   */
  recordStreamEvents?: boolean
}

// ============================================================================
// OpenCode Execution Options
// ============================================================================

export interface OpenCodeExecutionOptions {
  prompt: string
  model?: string
  agent?: string
  permissionMode?: OpenCodePermissionMode
  cwd?: string
  resumeSession?: string
  systemPrompt?: string
  toolConfig?: Record<string, boolean>
  maxTurns?: number
  maxTokens?: number
  timeout?: number
  hostname?: string
  port?: number
  serverTimeout?: number
  onProgress?: (chunk: string) => void
  onToolCall?: (tool: string, input: unknown) => void
}
