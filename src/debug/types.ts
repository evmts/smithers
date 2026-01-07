import type { SmithersNode } from '../core/types.js'

/**
 * Execution status for nodes
 */
export type ExecutionStatus = 'pending' | 'running' | 'complete' | 'error'

/**
 * Base event structure for all debug events
 */
export interface BaseDebugEvent {
  timestamp: number
  frameNumber: number
}

/**
 * Frame lifecycle events
 */
export interface FrameStartEvent extends BaseDebugEvent {
  type: 'frame:start'
}

export interface FrameEndEvent extends BaseDebugEvent {
  type: 'frame:end'
  duration: number
  stateChanged: boolean
  executedNodes: string[]
}

export interface FrameRenderEvent extends BaseDebugEvent {
  type: 'frame:render'
  treeSnapshot?: SmithersNodeSnapshot
}

/**
 * Node lifecycle events
 */
export interface NodeFoundEvent extends BaseDebugEvent {
  type: 'node:found'
  nodePath: string
  nodeType: string
  contentHash: string
  status: ExecutionStatus
}

export interface NodeExecuteStartEvent extends BaseDebugEvent {
  type: 'node:execute:start'
  nodePath: string
  nodeType: string
  contentHash: string
}

export interface NodeExecuteEndEvent extends BaseDebugEvent {
  type: 'node:execute:end'
  nodePath: string
  nodeType: string
  duration: number
  status: 'complete' | 'error'
  result?: unknown
  error?: string
}

/**
 * Callback events
 */
export interface CallbackInvokedEvent extends BaseDebugEvent {
  type: 'callback:invoked'
  callbackName: 'onFinished' | 'onError' | 'onToolError' | 'onApprove' | 'onReject'
  nodePath: string
}

/**
 * State events
 */
export interface StateChangeEvent extends BaseDebugEvent {
  type: 'state:change'
  source: 'callback' | 'human'
  nodePath: string
  callbackName?: string
}

/**
 * Control flow events
 */
export interface StopNodeDetectedEvent extends BaseDebugEvent {
  type: 'control:stop'
  reason?: string
}

export interface HumanNodeDetectedEvent extends BaseDebugEvent {
  type: 'control:human'
  message: string
  nodePath: string
  approved?: boolean
}

export interface LoopTerminatedEvent extends BaseDebugEvent {
  type: 'loop:terminated'
  reason: 'no_pending_nodes' | 'stop_node' | 'human_rejected' | 'max_frames' | 'timeout' | 'aborted'
}

/**
 * Interactive command control events
 */
export interface PauseEvent extends BaseDebugEvent {
  type: 'control:pause'
  reason?: string
}

export interface ResumeEvent extends BaseDebugEvent {
  type: 'control:resume'
  reason?: string
}

export interface SkipEvent extends BaseDebugEvent {
  type: 'control:skip'
  nodePath: string
  reason?: string
}

export interface AbortEvent extends BaseDebugEvent {
  type: 'control:abort'
  reason?: string
}

/**
 * Union type of all debug events
 */
export type SmithersDebugEvent =
  | FrameStartEvent
  | FrameEndEvent
  | FrameRenderEvent
  | NodeFoundEvent
  | NodeExecuteStartEvent
  | NodeExecuteEndEvent
  | CallbackInvokedEvent
  | StateChangeEvent
  | StopNodeDetectedEvent
  | HumanNodeDetectedEvent
  | LoopTerminatedEvent
  | PauseEvent
  | ResumeEvent
  | SkipEvent
  | AbortEvent

/**
 * All possible event type strings
 */
export type SmithersDebugEventType = SmithersDebugEvent['type']

/**
 * Lightweight node snapshot for tree visualization
 * Excludes functions and non-serializable data
 */
export interface SmithersNodeSnapshot {
  type: string
  path: string
  props: Record<string, unknown>
  executionStatus?: ExecutionStatus
  contentHash?: string
  children: SmithersNodeSnapshot[]
}

/**
 * @deprecated Use SmithersNodeSnapshot instead
 */
export type PluNodeSnapshot = SmithersNodeSnapshot

/**
 * Debug configuration options
 */
export interface DebugOptions {
  /**
   * Enable debug event collection
   */
  enabled?: boolean

  /**
   * Event listener called for each debug event
   */
  onEvent?: (event: SmithersDebugEvent) => void

  /**
   * Include tree snapshots in frame:render events
   * Warning: Can be expensive for large trees
   */
  includeTreeSnapshots?: boolean

  /**
   * Filter which event types to emit
   * If not specified, all events are emitted
   */
  eventFilter?: SmithersDebugEventType[]
}

/**
 * Compact summary of debug events for test assertions
 */
export interface DebugSummary {
  frameCount: number
  executedNodes: string[]
  callbacksInvoked: string[]
  stateChanges: number
  terminationReason: string | null
}

/**
 * Timeline entry with relative timing
 */
export type TimelineEntry = SmithersDebugEvent & {
  relativeTime: number
}
