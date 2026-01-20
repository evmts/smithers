export interface ScriptInfo {
  path: string
  name: string
  dbPath: string
  hasIncomplete: boolean
}

export interface ExecutionStatus {
  executionId: string
  script: string
  state: 'pending' | 'running' | 'complete' | 'failed'
  iteration: number
  tree: PhaseTree
  lastOutput?: string | undefined
  error?: string | undefined
}

export interface PhaseTree {
  phases: PhaseNode[]
}

export interface PhaseNode {
  id: string
  name: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  children: StepNode[]
}

export interface StepNode {
  id: string
  name: string
  status: 'pending' | 'running' | 'complete' | 'failed'
}

export interface Frame {
  id: string
  timestamp: number
  type: string
  data: unknown
}

export interface CreateWorkflowResult {
  path: string
  created: boolean
  errors?: string[]
}

export interface RunResult {
  executionId: string
  dbPath: string
  pid: number
}
