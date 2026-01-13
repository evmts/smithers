import type { ZodType } from 'zod'
import type { MCPServerConfig } from '../mcp/types.js'
import type { DebugOptions } from '../debug/types.js'

// Re-export DebugOptions for convenience
export type { DebugOptions } from '../debug/types.js'

/**
 * Internal node representation for the Smithers renderer.
 * This is renderer-agnostic and works with both React and Solid.js.
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
 * Controller interface for interactive execution.
 * Allows pause/resume, skip, inject, and abort during execution.
 * Used by interactive CLI commands (/pause, /resume, etc.)
 */
export interface ExecutionController {
  paused: boolean
  skipNextNode: boolean
  skipNodePath?: string
  injectedPrompt?: string
  aborted: boolean
  abortReason?: string
  pause(): void
  resume(): void
  skip(nodePath?: string): void
  inject(prompt: string): void
  abort(reason?: string): void
  _updateState(frame: number, tree: SmithersNode): void
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
  children?: unknown

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
 * Human prompt response for workflow outputs
 */
export interface HumanPromptResponse {
  /** Whether the user approved */
  approved: boolean
  /** Optional workflow output values */
  values?: Record<string, unknown>
}

/**
 * Information about a human prompt including workflow context
 */
export interface HumanPromptInfo {
  /** The message to display */
  message: string
  /** The full content/prompt */
  content: string
  /** Available workflow output definitions */
  outputs: Array<{
    name: string
    description?: string
    schema?: unknown
  }>
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
  controller?: ExecutionController
  /**
   * Optional rerender callback for triggering framework-specific re-renders.
   * This enables the Ralph Wiggum loop to work with different rendering frameworks.
   *
   * The callback should trigger a re-render and return the updated SmithersNode tree.
   * Used by both React (via RenderFrame) and Solid.js (via root.mount()).
   */
  rerender?: () => Promise<SmithersNode>
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
