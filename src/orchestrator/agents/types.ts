/**
 * Types for agent tool system - enables invoking AI agents as tools within Smithers orchestration
 */

import type { JSONSchema } from '../../components/agents/types/schema.js'
import type { ToolSpec } from '../../tools/types.js'

/**
 * Supported AI providers for agent tools
 */
export type AgentProvider = 'claude' | 'gemini' | 'codex'

/**
 * Token usage statistics for agent execution
 */
export interface AgentUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/**
 * Configuration for an agent tool
 */
export interface AgentToolConfig {
  /** AI provider to use */
  provider: AgentProvider

  /** Model to use for the provider */
  model: string

  /** Optional system prompt */
  systemPrompt?: string

  /** Maximum tokens for output */
  maxTokens?: number

  /** Timeout in milliseconds */
  timeout?: number

  /** Maximum number of turns */
  maxTurns?: number

  /** Tools available to the agent */
  tools?: ToolSpec[]

  /** Temperature for randomness */
  temperature?: number

  /** Provider-specific options */
  providerOptions?: Record<string, any>
}

/**
 * Input for invoking an agent
 */
export interface AgentInvocation {
  /** The prompt to send to the agent */
  prompt: string

  /** Configuration for the agent */
  config: AgentToolConfig

  /** Optional context data */
  context?: Record<string, any> | undefined
}

/**
 * Result from agent execution
 */
export interface AgentToolResult {
  /** Whether the execution was successful */
  success: boolean

  /** Content output from the agent (on success) */
  content?: string | undefined

  /** Error message (on failure) */
  error?: string | undefined

  /** Token usage statistics */
  usage?: AgentUsage | undefined

  /** Execution time in milliseconds */
  executionTime?: number | undefined

  /** Number of turns taken */
  turns?: number | undefined

  /** Reason for stopping */
  stopReason?: 'completed' | 'max_turns' | 'timeout' | 'error' | undefined

  /** Raw response data */
  raw?: any
}

/**
 * Options for creating an agent tool
 */
export interface CreateAgentToolOptions {
  /** Tool name */
  name: string

  /** Tool description */
  description: string

  /** Agent configuration */
  config: AgentToolConfig

  /** Input schema for validation */
  inputSchema?: JSONSchema

  /** Output schema for validation */
  outputSchema?: JSONSchema

  /** Whether tool needs approval before execution */
  needsApproval?: boolean
}

/**
 * Interface for agent execution context
 */
export interface AgentExecutionContext {
  /** Current working directory */
  cwd: string

  /** Environment variables */
  env: Record<string, string>

  /** Agent execution ID */
  agentId: string

  /** Execution ID */
  executionId: string

  /** Abort signal for cancellation */
  abortSignal?: AbortSignal | undefined

  /** Logging function */
  log: (message: string) => void
}

/**
 * Base interface for all agent implementations
 */
export interface AgentExecutor {
  /** Execute the agent with given invocation */
  execute(
    invocation: AgentInvocation,
    context: AgentExecutionContext
  ): Promise<AgentToolResult>

  /** Get default configuration for this agent type */
  getDefaultConfig(): Partial<AgentToolConfig>

  /** Validate configuration for this agent type */
  validateConfig(config: AgentToolConfig): void | Promise<void>
}

/**
 * Registry for agent executors
 */
export interface AgentRegistry {
  /** Register an agent executor */
  register(provider: AgentProvider, executor: AgentExecutor): void

  /** Get an agent executor */
  get(provider: AgentProvider): AgentExecutor | undefined

  /** List all registered providers */
  list(): AgentProvider[]
}