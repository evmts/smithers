import type { ReactElement, ReactNode } from 'react'

/**
 * Internal node representation for the Plue renderer
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
}

/**
 * Tool definition for Claude agents
 */
export interface Tool {
  name: string
  description: string
  parameters?: Record<string, unknown>
  execute?: (args: unknown) => Promise<unknown>
}

/**
 * Props for the Claude component
 */
export interface ClaudeProps {
  tools?: Tool[]
  onFinished?: (output: unknown) => void
  onError?: (error: Error) => void
  children?: ReactNode
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
 * Plue root container for React reconciler
 */
export interface PluRoot {
  render(element: ReactElement): PluNode
  unmount(): void
  getTree(): PluNode | null
}
