/**
 * Core type definitions for Smithers reconciler.
 * These types define the SmithersNode tree structure that the reconciler creates.
 *
 * Key architectural principle: Components execute themselves via onMount,
 * not via external orchestrators. State changes (via React signals) trigger
 * re-renders, which trigger re-execution. This is the "Ralph Wiggum loop"
 * pattern - change the key prop to force unmount/remount.
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
  /**
   * Unique key for reconciliation.
   * CRITICAL for the "Ralph Wiggum loop" - changing this forces unmount/remount,
   * which triggers re-execution of onMount handlers.
   */
  key?: string | number
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
