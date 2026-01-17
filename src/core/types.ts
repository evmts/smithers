/**
 * Core type definitions for Smithers execution engine.
 * These types are framework-agnostic and work with any renderer.
 */

export interface SmithersNode {
  /** Node type: 'claude', 'phase', 'step', 'TEXT', etc. */
  type: string
  /** Props passed to the component */
  props: Record<string, unknown>
  /** Child nodes */
  children: SmithersNode[]
  /** Reference to parent node (null for root) */
  parent: SmithersNode | null
  /** Runtime execution state */
  _execution?: ExecutionState
}

export interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown
  error?: Error
  contentHash?: string
}

export interface ExecuteOptions {
  maxFrames?: number
  timeout?: number
  verbose?: boolean
  mockMode?: boolean
  debug?: DebugOptions
}

export interface ExecutionResult {
  output: unknown
  frames: number
  totalDuration: number
}

export interface DebugOptions {
  enabled?: boolean
  onEvent?: (event: DebugEvent) => void
}

export interface DebugEvent {
  type: string
  timestamp?: number
  [key: string]: unknown
}
