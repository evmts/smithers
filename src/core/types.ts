import type { ReactElement, ReactNode } from 'react'
import type { ZodType } from 'zod'
import type { MCPServerConfig } from '../mcp/types.js'
import type { DebugOptions } from '../debug/types.js'
import type { HumanPromptInfo, HumanPromptResponse } from '../workflow/types.js'

// Re-export DebugOptions for convenience
export type { DebugOptions } from '../debug/types.js'

// Re-export workflow types for convenience
export type { HumanPromptInfo, HumanPromptResponse } from '../workflow/types.js'

/**
 * Internal node representation for the Smithers renderer
 */
export interface SmithersNode {
  type: string
  props: Record<string, unknown>
  children: SmithersNode[]
  parent: SmithersNode | null
  _execution?: ExecutionState
}

export interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown
  error?: Error
  contentHash?: string // Hash of node content for change detection
  /** Flag indicating this node was blocked by a failed parent worktree */
  blockedByWorktree?: boolean
}

/**
 * Detailed error information for better error recovery
 */
export interface ExecutionError extends Error {
  /** The type of node that failed */
  nodeType: string
  /** Path to the failed node in the tree */
  nodePath: string
  /** The input/prompt that was being processed */
  input?: string
  /** Tool that failed, if applicable */
  failedTool?: string
  /** Tool input that caused the failure */
  toolInput?: unknown
  /** Number of retries attempted */
  retriesAttempted?: number
  /** Original error before wrapping */
  cause?: Error
}

/**
 * Result of a single tool execution
 */
export interface ToolExecutionResult {
  toolName: string
  success: boolean
  result?: unknown
  error?: Error
  retriesAttempted: number
}

/**
 * Options for tool retry behavior
 */
export interface ToolRetryOptions {
  /** Maximum number of retries for a failed tool (default: 2) */
  maxRetries?: number
  /** Base delay in ms between retries (default: 500) */
  baseDelayMs?: number
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean
  /** Tool names to skip on failure (continue with other tools) */
  skipOnFailure?: string[]
  /** Whether to continue execution if some tools fail (default: false) */
  continueOnToolFailure?: boolean
}

/**
 * JSON Schema for tool input parameters
 */
export interface ToolInputSchema {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

/**
 * Tool definition for Claude agents
 *
 * Tools are passed to Claude and can be invoked during execution.
 * The input_schema should be a valid JSON Schema object.
 */
export interface Tool {
  name: string
  description: string
  /** JSON Schema defining the tool's input parameters */
  input_schema?: ToolInputSchema
  /** @deprecated Use input_schema instead. Kept for backward compatibility. */
  parameters?: Record<string, unknown>
  /** Optional function to execute the tool (for MCP integration) */
  execute?: (args: unknown) => Promise<unknown>
}

/**
 * Streaming chunk from Claude API
 */
export interface StreamChunk {
  type: 'text' | 'tool_use' | 'message_start' | 'message_delta' | 'content_block_start' | 'content_block_delta' | 'content_block_stop'
  text?: string
  tool_use?: {
    id: string
    name: string
    input: unknown
  }
  delta?: {
    text?: string
    stop_reason?: string
  }
}

/**
 * Permission mode for controlling how tool executions are handled.
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'

/**
 * Agent definition for custom subagents invoked via the Task tool.
 */
export interface AgentDefinition {
  /** Natural language description of when to use this agent */
  description: string
  /** Array of allowed tool names. If omitted, inherits all tools from parent */
  tools?: string[]
  /** Array of tool names to explicitly disallow for this agent */
  disallowedTools?: string[]
  /** The agent's system prompt */
  prompt: string
  /** Model to use for this agent. If omitted or 'inherit', uses the main model */
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
}

/**
 * JSON Schema output format for structured responses.
 */
export interface JsonSchemaOutputFormat {
  type: 'json_schema'
  schema: Record<string, unknown>
}

/**
 * Props for the OutputFormat component
 *
 * Specifies the expected output structure for an agent response.
 */
export interface OutputFormatProps {
  /** JSON Schema defining the expected output structure */
  schema?: Record<string, unknown>
  children?: ReactNode
}

/**
 * Props for the Claude component (uses Claude Agent SDK)
 *
 * The Claude component executes prompts using the Claude Agent SDK,
 * which provides built-in tools for file operations, bash commands,
 * web search, and more.
 *
 * @typeParam T - Zod schema type for structured output inference
 */
export interface ClaudeProps<T extends ZodType = ZodType> {
  /** Callback invoked when execution completes. Output is typed if schema is provided. */
  onFinished?: (output: T extends ZodType<infer U> ? U : unknown) => void
  /** Callback invoked if execution fails */
  onError?: (error: Error | ExecutionError) => void
  /** The prompt content */
  children?: ReactNode

  // Tool configuration
  /**
   * List of tool names that are auto-allowed without prompting for permission.
   * Built-in tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Task
   */
  allowedTools?: string[]
  /**
   * List of tool names that are disallowed. These tools will be removed
   * from the model's context and cannot be used.
   */
  disallowedTools?: string[]
  /**
   * Specify the base set of available built-in tools.
   * - `string[]` - Array of specific tool names
   * - `[]` (empty array) - Disable all built-in tools
   * - `{ type: 'preset'; preset: 'claude_code' }` - Use all default Claude Code tools
   */
  tools?: string[] | { type: 'preset'; preset: 'claude_code' }

  // Model and execution
  /** Claude model to use */
  model?: string
  /** Maximum number of conversation turns before the query stops */
  maxTurns?: number
  /** Maximum budget in USD for the query */
  maxBudgetUsd?: number
  /** Maximum tokens for thinking/reasoning process */
  maxThinkingTokens?: number

  // System prompt
  /**
   * System prompt configuration.
   * - `string` - Use a custom system prompt
   * - `{ type: 'preset', preset: 'claude_code', append?: string }` - Use default Claude Code prompt
   */
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string }

  // Permissions
  /** Permission mode for the session */
  permissionMode?: PermissionMode
  /** Must be true when using permissionMode: 'bypassPermissions' */
  allowDangerouslySkipPermissions?: boolean

  // Advanced features
  /** Working directory for the session */
  cwd?: string
  /** MCP server configurations */
  mcpServers?: Record<string, MCPServerConfig>
  /** Custom subagent definitions */
  agents?: Record<string, AgentDefinition>
  /** Zod schema for structured output. The onFinished callback will receive typed output. */
  schema?: T
  /** Session ID to resume */
  resume?: string
  /** Additional directories Claude can access */
  additionalDirectories?: string[]
  /**
   * Control which filesystem settings to load.
   * - 'user' - Global user settings
   * - 'project' - Project settings
   * - 'local' - Local settings
   */
  settingSources?: Array<'user' | 'project' | 'local'>

  [key: string]: unknown // Pass-through to SDK
}

/**
 * Props for the ClaudeApi component (uses Anthropic API SDK directly)
 *
 * The ClaudeApi component executes prompts using the Anthropic API SDK,
 * giving you direct control over API calls with per-token billing.
 *
 * @typeParam T - Zod schema type for structured output inference
 */
export interface ClaudeApiProps<T extends ZodType = ZodType> {
  tools?: Tool[]
  /** Callback invoked when execution completes. Output is typed if schema is provided. */
  onFinished?: (output: T extends ZodType<infer U> ? U : unknown) => void
  /** Enhanced error callback with detailed error context */
  onError?: (error: Error | ExecutionError) => void
  /** Callback for partial tool results when some tools fail but execution continues */
  onToolError?: (toolName: string, error: Error, input: unknown) => void
  children?: ReactNode
  /** System prompt for the conversation */
  system?: string
  /** Maximum number of tool execution iterations (default: 10) */
  maxToolIterations?: number
  /** Enable streaming mode */
  stream?: boolean
  /** Callback for streaming chunks */
  onStream?: (chunk: StreamChunk) => void
  /** MCP servers to connect to for additional tools */
  mcpServers?: MCPServerConfig[]
  /** Number of retries for Claude API calls (default: 3) */
  retries?: number
  /** Tool retry configuration for failed tool executions */
  toolRetry?: ToolRetryOptions
  /** Zod schema for structured output. The onFinished callback will receive typed output. */
  schema?: T
  [key: string]: unknown // Pass-through to SDK
}

/**
 * Props for the Subagent component
 */
export interface SubagentProps {
  name?: string
  parallel?: boolean
  children?: ReactNode
}

/**
 * Props for the Phase component
 */
export interface PhaseProps {
  name: string
  /** Mark phase as already completed (skipped by Ralph loop) */
  completed?: boolean
  children?: ReactNode
}

/**
 * Props for the Step component
 */
export interface StepProps {
  /** Mark step as already completed (skipped by Ralph loop) */
  completed?: boolean
  children?: ReactNode
}

/**
 * Props for the Persona component
 */
export interface PersonaProps {
  role: string
  children?: ReactNode
}

/**
 * Props for the Constraints component
 */
export interface ConstraintsProps {
  children?: ReactNode
}


/**
 * Props for the Task component
 */
export interface TaskProps {
  /** Whether the task is completed */
  done?: boolean
  children?: ReactNode
}

/**
 * Props for the Stop component
 *
 * The Stop component signals the Ralph Wiggum loop to halt execution
 * before starting any new agent executions.
 */
export interface StopProps {
  /** Optional reason for stopping execution */
  reason?: string
  children?: ReactNode
}

/**
 * Props for the Human component
 *
 * The Human component pauses execution and waits for human approval/input.
 * When encountered during execution, it displays a prompt to the user
 * and waits for their confirmation before continuing.
 */
export interface HumanProps {
  /** Optional message to display to the user */
  message?: string
  /** Optional callback when user approves */
  onApprove?: () => void
  /** Optional callback when user rejects */
  onReject?: () => void
  children?: ReactNode
}

/**
 * Props for the Output component
 *
 * The Output component renders content to the terminal during execution
 * or changes the final rendered output. It's useful for displaying progress,
 * results, or status messages without requiring a Claude execution.
 */
export interface OutputProps {
  /** The format of the output content */
  format?: 'text' | 'json' | 'markdown'
  /** Optional label to prefix the output */
  label?: string
  /** The content to output */
  children?: ReactNode
}

/**
 * Props for the File component
 *
 * The File component writes or updates files during agent execution.
 * It allows agents to produce file artifacts without requiring Claude tool calls,
 * making file operations explicit and declarative in agent workflows.
 */
export interface FileProps {
  /** The file path to write to. Can be absolute or relative to the working directory. */
  path: string
  /** How to write the content. 'write' overwrites, 'append' adds to end. */
  mode?: 'write' | 'append'
  /** The file encoding to use */
  encoding?: BufferEncoding
  /** Whether to create parent directories if they don't exist. Defaults to true. */
  createDirs?: boolean
  /** Callback invoked after the file is successfully written */
  onWritten?: (path: string) => void
  /** Callback invoked if writing fails */
  onError?: (error: Error) => void
  /** The content to write to the file */
  children?: ReactNode
  /** Internal: enable mock mode (no actual writes) */
  _mockMode?: boolean
}

/**
 * Props for the Worktree component
 *
 * The Worktree component enables parallel agent isolation by running agents
 * in git worktrees. Each worktree has an isolated filesystem, preventing
 * conflicts when multiple agents modify the same files.
 */
export interface WorktreeProps {
  /** Path where the worktree will be created */
  path: string
  /** Optional branch name. If provided, creates a new branch */
  branch?: string
  /** Whether to clean up worktree after execution (default: true) */
  cleanup?: boolean
  /** Optional base branch to create new branch from (default: current branch) */
  baseBranch?: string
  /** Callback invoked when worktree is created */
  onCreated?: (path: string, branch?: string) => void
  /** Callback invoked if worktree creation fails */
  onError?: (error: Error) => void
  /** Callback invoked when worktree is removed */
  onCleanup?: (path: string) => void
  /** React children (typically Claude/ClaudeApi components) */
  children?: ReactNode
}

/**
 * Props for the ClaudeCli component
 *
 * The ClaudeCli component executes prompts using the Claude CLI (`claude` command)
 * instead of the Anthropic SDK. This allows using your Claude Code subscription
 * for agent workflows, avoiding per-token API costs.
 */
export interface ClaudeCliProps {
  /** Callback invoked when CLI completes execution */
  onFinished?: (output: string) => void
  /** Callback invoked if execution fails */
  onError?: (error: Error) => void
  /** Override the Claude model to use (maps to --model flag) */
  model?: string
  /** Working directory for the CLI command */
  cwd?: string
  /** List of tools the CLI is allowed to use (maps to --allowedTools flag) */
  allowedTools?: string[]
  /** Maximum number of agentic turns (maps to --max-turns flag) */
  maxTurns?: number
  /** System prompt to use (maps to --system-prompt flag) */
  systemPrompt?: string
  /** The prompt content */
  children?: ReactNode
}

/**
 * Information about a plan and its prompt at the top level
 */
export interface PlanInfo {
  /** The serialized XML plan */
  planXml: string
  /** The text prompt (if any) */
  prompt: string
  /** Paths to executable nodes in the plan */
  executablePaths: string[]
  /** The frame number */
  frame: number
}

/**
 * Provider context for rate limiting and usage tracking
 * This is passed through from ClaudeProvider to executors
 */
export interface ProviderContext {
  /** Acquire rate limit permission before making a request */
  acquireRateLimit: (estimate: { inputTokens: number; outputTokens: number }) => Promise<void>
  /** Report actual usage after a request completes */
  reportUsage: (usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheCreationTokens?: number
    costUsd?: number
    model?: string
  }) => void
  /** Check if within budget limits */
  checkBudget: () => { allowed: boolean; reason?: string }
  /** Wait for budget to become available (pause-and-wait behavior) */
  waitForBudget: () => Promise<void>
  /** Custom token estimation function */
  estimateTokens?: (prompt: string) => { inputTokens: number; outputTokens: number }
  /** API key from provider */
  apiKey?: string
}

/**
 * Options for executing a plan
 */
export interface ExecuteOptions {
  autoApprove?: boolean
  maxFrames?: number
  timeout?: number
  verbose?: boolean
  /** Enable mock mode (no real API calls) */
  mockMode?: boolean
  /** Claude model to use */
  model?: string
  /** Maximum tokens for Claude responses */
  maxTokens?: number
  onPlan?: (xml: string, frame: number) => void
  onFrame?: (frame: FrameResult) => void
  /**
   * Custom prompt function for Human component approval.
   * If not provided, Human nodes will automatically approve in non-interactive contexts.
   *
   * Supports two signatures:
   * - Legacy: `(message: string, content: string) => Promise<boolean>`
   * - Enhanced: `(info: HumanPromptInfo) => Promise<HumanPromptResponse>`
   *
   * The enhanced signature supports workflow outputs, allowing humans to
   * provide typed values through the Human component.
   */
  onHumanPrompt?:
    | ((message: string, content: string) => Promise<boolean>)
    | ((info: HumanPromptInfo) => Promise<HumanPromptResponse>)
  /**
   * Callback invoked at the start of each frame when there's a top-level plan.
   * This is called after rendering but before executing any nodes.
   *
   * Use this to show Claude the plan and prompt before execution begins.
   * The callback receives the serialized plan and any text prompt found in the tree.
   *
   * @param info - Information about the plan and prompt
   * @returns Optional response from consulting Claude about the plan
   */
  onPlanWithPrompt?: (info: PlanInfo) => Promise<string | void>
  /**
   * Debug observability options.
   * When enabled, emits structured events throughout the Ralph Wiggum loop
   * for monitoring, testing, and debugging purposes.
   */
  debug?: DebugOptions
  /**
   * Provider context for rate limiting and usage tracking.
   * This is typically injected by ClaudeProvider.
   */
  providerContext?: ProviderContext
  /**
   * Callback invoked after each Ralph loop frame with the updated tree.
   * This is called after rendering and execution but before starting the next frame.
   * Useful for TUI updates, logging, or other real-time monitoring.
   *
   * @param tree - The updated SmithersNode tree
   * @param frame - Current frame number
   */
  onFrameUpdate?: (tree: SmithersNode, frame: number) => void | Promise<void>
  /**
   * Controller for interactive execution.
   * Allows pause/resume, skip, inject, and abort during execution.
   * Used by interactive CLI commands (/pause, /resume, etc.)
   */
  controller?: import('../cli/interactive.js').ExecutionController
}

/**
 * Result of a single execution frame
 */
export interface FrameResult {
  frame: number
  plan: string
  executedNodes: string[]
  stateChanges: boolean
  duration: number
}

/**
 * Final result of plan execution
 */
export interface ExecutionResult {
  output: unknown
  frames: number
  totalDuration: number
  history: FrameResult[]
  mcpServers?: string[] // List of MCP servers that were connected
}

/**
 * Smithers root container for React reconciler
 */
export interface SmithersRoot {
  render(element: ReactElement): Promise<SmithersNode>
  unmount(): void
  getTree(): SmithersNode | null
}
