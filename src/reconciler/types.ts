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
   * Unique key for reconciliation (set by jsx-runtime, not React reconciler).
   * NOTE: React's `key` prop is NOT passed through to components/instances.
   * The jsx-runtime handles this specially, but if using React reconciler
   * directly, use `planKey` in props instead for accessible identifiers.
   */
  key?: string | number
  /** Runtime execution state */
  _execution?: ExecutionState
  /** Validation warnings (e.g., known component inside unknown element) */
  warnings?: string[]
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
