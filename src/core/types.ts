import type { ReactElement, ReactNode } from 'react'

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
  onError?: (error: Error) => void
  children?: ReactNode
  /** System prompt for the conversation */
  system?: string
  /** Maximum number of tool execution iterations (default: 10) */
  maxToolIterations?: number
  /** Enable streaming mode */
  stream?: boolean
  /** Callback for streaming chunks */
  onStream?: (chunk: StreamChunk) => void
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
 * Options for executing a plan
 */
export interface ExecuteOptions {
  autoApprove?: boolean
  maxFrames?: number
  timeout?: number
  verbose?: boolean
  onPlan?: (xml: string, frame: number) => void
  onFrame?: (frame: FrameResult) => void
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
