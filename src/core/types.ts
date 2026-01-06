import type { ReactElement, ReactNode } from 'react'
import type { MCPServerConfig } from '../mcp/types.js'

/**
 * Internal node representation for the Smithers renderer
 */
export interface PluNode {
  type: string
  props: Record<string, unknown>
  children: PluNode[]
  parent: PluNode | null
  _execution?: ExecutionState
}

export interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown
  error?: Error
  contentHash?: string // Hash of node content for change detection
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
 * Props for the Claude component
 */
export interface ClaudeProps {
  tools?: Tool[]
  onFinished?: (output: unknown) => void
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
  children?: ReactNode
}

/**
 * Props for the Step component
 */
export interface StepProps {
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
 * Props for the OutputFormat component
 */
export interface OutputFormatProps {
  schema?: Record<string, unknown>
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
 * after all currently running agents complete.
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
   * @param message - The message to display to the user
   * @param content - The content from the Human component's children
   * @returns Promise<boolean> - true if approved, false if rejected
   */
  onHumanPrompt?: (message: string, content: string) => Promise<boolean>
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
export interface PluRoot {
  render(element: ReactElement): Promise<PluNode>
  unmount(): void
  getTree(): PluNode | null
}
