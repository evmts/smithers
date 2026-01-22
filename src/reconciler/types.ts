export interface SmithersNode {
  type: string
  props: Record<string, unknown>
  children: SmithersNode[]
  parent: SmithersNode | null
  key?: string | number
  _execution?: ExecutionState
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
