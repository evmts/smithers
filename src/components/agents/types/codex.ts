import type { ReactNode } from 'react'
import type { z } from 'zod'
import type { AgentResult } from './execution.js'
import type { StopCondition } from './agents.js'
import type { SmithersMiddleware } from '../../../middleware/types.js'
import type { SmithersStreamPart } from '../../../streaming/types.js'

// ============================================================================
// Codex-Specific Types
// ============================================================================

export type CodexModel = 'o3' | 'o4-mini' | 'gpt-4o' | 'gpt-4' | 'codex-5.2' | 'codex-5.3' | string

export type CodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never'

// ============================================================================
// Codex Props
// ============================================================================

export interface CodexProps<TSchema extends z.ZodType = z.ZodType> {
  /**
   * The prompt to send to Codex (usually as children)
   */
  children: ReactNode

  /**
   * Codex model to use
   * - 'codex-5.2': Codex 5.2 (default)
   * - 'codex-5.3': Codex 5.3
   * - 'o3': OpenAI o3
   * - 'o4-mini': OpenAI o4-mini
   * - 'gpt-4o': GPT-4o
   * - string: custom model ID
   */
  model?: CodexModel

  /**
   * Reasoning effort level for extended thinking
   * - 'low': Minimal reasoning
   * - 'medium': Moderate reasoning
   * - 'high': High reasoning
   * - 'xhigh': Maximum reasoning (default for codex-5.x)
   */
  reasoningEffort?: CodexReasoningEffort

  /**
   * Sandbox mode for command execution
   * - 'read-only': Read-only access
   * - 'workspace-write': Write access to workspace
   * - 'danger-full-access': Full system access (dangerous)
   */
  sandboxMode?: CodexSandboxMode

  /**
   * Approval policy for commands
   * - 'untrusted': Only run trusted commands without approval
   * - 'on-failure': Ask approval only on failure
   * - 'on-request': Model decides when to ask
   * - 'never': Never ask for approval
   */
  approvalPolicy?: CodexApprovalPolicy

  /**
   * Enable full-auto mode (--full-auto)
   * Convenience alias for -a on-request, --sandbox workspace-write
   */
  fullAuto?: boolean

  /**
   * Bypass all approvals and sandbox (EXTREMELY DANGEROUS)
   */
  bypassSandbox?: boolean

  /**
   * Working directory for the agent
   */
  cwd?: string

  /**
   * Skip git repository check
   */
  skipGitRepoCheck?: boolean

  /**
   * Additional directories that should be writable
   */
  addDirs?: string[]

  /**
   * Images to attach to the prompt
   */
  images?: string[]

  /**
   * Configuration profile from config.toml
   */
  profile?: string

  /**
   * Configuration overrides (key=value pairs)
   */
  configOverrides?: Record<string, unknown>

  /**
   * Conditions that will stop the agent
   */
  stopConditions?: StopCondition[]

  /**
   * Timeout in milliseconds
   */
  timeout?: number

  /**
   * Called when agent finishes successfully
   */
  onFinished?: (result: AgentResult<TSchema extends z.ZodType<infer T> ? T : unknown>) => void

  /**
   * Called when agent encounters an error
   */
  onError?: (error: Error) => void

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
   * Zod schema for structured output validation
   */
  schema?: TSchema

  /**
   * Maximum retries for schema validation failures
   * @default 2
   */
  schemaRetries?: number

  /**
   * Number of tail log entries to display during execution
   * @default 10
   */
  tailLogCount?: number

  /**
   * Number of lines to show per tail log entry
   * @default 10
   */
  tailLogLines?: number

  /**
   * Middleware applied to this Codex execution
   */
  middleware?: SmithersMiddleware[]

  /**
   * Enable JSON output mode
   */
  jsonOutput?: boolean
}

// ============================================================================
// Codex CLI Execution Options
// ============================================================================

export interface CodexCLIExecutionOptions {
  /**
   * The prompt to send
   */
  prompt: string

  /**
   * Model to use (default: codex-5.2)
   */
  model?: CodexModel

  /**
   * Reasoning effort level (default: xhigh for codex-5.x)
   */
  reasoningEffort?: CodexReasoningEffort

  /**
   * Sandbox mode
   */
  sandboxMode?: CodexSandboxMode

  /**
   * Approval policy
   */
  approvalPolicy?: CodexApprovalPolicy

  /**
   * Enable full-auto mode
   */
  fullAuto?: boolean

  /**
   * Bypass sandbox (dangerous)
   */
  bypassSandbox?: boolean

  /**
   * Working directory
   */
  cwd?: string

  /**
   * Skip git repo check
   */
  skipGitRepoCheck?: boolean

  /**
   * Additional writable directories
   */
  addDirs?: string[]

  /**
   * Path to JSON schema file for output
   */
  outputSchema?: string

  /**
   * Output JSON events
   */
  json?: boolean

  /**
   * Write last message to file
   */
  outputLastMessage?: string

  /**
   * Images to attach
   */
  images?: string[]

  /**
   * Config profile
   */
  profile?: string

  /**
   * Config overrides
   */
  configOverrides?: Record<string, unknown>

  /**
   * Timeout in milliseconds
   */
  timeout?: number

  /**
   * Stop conditions to monitor
   */
  stopConditions?: StopCondition[]

  /**
   * Progress callback
   */
  onProgress?: (message: string) => void

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
