// Amp agent props type definitions for Smithers orchestrator

import type { ReactNode } from 'react'
import type { SmithersStreamPart } from '../../../streaming/types.js'
import type { AgentResult } from './execution.js'
import type { SmithersMiddleware } from '../../../middleware/types.js'
import type { StopCondition } from './agents.js'

// ============================================================================
// Amp-Specific Types
// ============================================================================

/**
 * Amp agent mode
 * - 'smart': Uses SOTA models without constraints for maximum capability
 * - 'rush': Faster, cheaper, suitable for small well-defined tasks
 */
export type AmpMode = 'smart' | 'rush'

/**
 * Amp permission mode (mirrors Claude permission mode)
 */
export type AmpPermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'

// ============================================================================
// Amp Props
// ============================================================================

export interface AmpProps {
  /**
   * The prompt to send to Amp (usually as children)
   */
  children?: ReactNode

  /**
   * Agent mode
   * - 'smart': Uses SOTA models without constraints (default)
   * - 'rush': Faster, cheaper for small tasks
   */
  mode?: AmpMode

  /**
   * Maximum number of turns (agentic loops)
   */
  maxTurns?: number

  /**
   * System prompt for the agent
   */
  systemPrompt?: string

  /**
   * Permission mode for file operations
   * - 'default': ask for permission
   * - 'acceptEdits': auto-accept edits
   * - 'bypassPermissions': skip all permission checks (--dangerously-allow-all)
   */
  permissionMode?: AmpPermissionMode

  /**
   * Timeout in milliseconds
   */
  timeout?: number

  /**
   * Working directory for the agent
   */
  cwd?: string

  /**
   * Continue from previous thread
   */
  continueThread?: boolean

  /**
   * Resume a specific thread by ID
   */
  resumeThread?: string

  /**
   * Labels to attach to the thread (can be used multiple times with --label)
   */
  labels?: string[]

  /**
   * Called when agent finishes successfully
   */
  onFinished?: (result: AgentResult) => void

  /**
   * Called when agent encounters an error
   */
  onError?: (error: Error) => void

  /**
   * Called for progress updates
   */
  onProgress?: (message: string) => void

  /**
   * Called when agent makes a tool call
   */
  onToolCall?: (tool: string, input: any) => void

  /**
   * Called for typed stream events (when enabled)
   */
  onStreamPart?: (part: SmithersStreamPart) => void

  /**
   * Enable database reporting for this agent
   * @default true
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
   * @default 3
   */
  maxRetries?: number

  /**
   * Conditions that will stop the agent
   */
  stopConditions?: StopCondition[]

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
   * Middleware applied to this Amp execution.
   */
  middleware?: SmithersMiddleware[]

  /**
   * Enable typed stream parts for Amp CLI output.
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

  /**
   * Allow arbitrary additional props
   */
  [key: string]: unknown
}

// ============================================================================
// Amp CLI Execution Options
// ============================================================================

export interface AmpCLIExecutionOptions {
  /**
   * The prompt to send
   */
  prompt: string

  /**
   * Agent mode
   */
  mode?: AmpMode

  /**
   * Permission mode
   */
  permissionMode?: AmpPermissionMode

  /**
   * Maximum turns
   */
  maxTurns?: number

  /**
   * System prompt
   */
  systemPrompt?: string

  /**
   * Timeout in milliseconds
   */
  timeout?: number

  /**
   * Working directory
   */
  cwd?: string

  /**
   * Continue thread
   */
  continue?: boolean

  /**
   * Resume thread ID
   */
  resume?: string

  /**
   * Labels for the thread
   */
  labels?: string[]

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
}
