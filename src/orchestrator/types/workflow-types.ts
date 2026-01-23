/**
 * Core workflow and phase type definitions for the dynamic phase system
 */

export interface WorkflowPhase {
  id: string
  name: string
  description?: string
  type: 'agent-driven' | 'manual' | 'script-driven'
  config: PhaseConfig
  transitions: PhaseTransition[]
  timeout?: number
}

export interface PhaseConfig {
  model?: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  outputSchema?: Record<string, any>
  tools?: string[]
  [key: string]: any
}

export interface PhaseTransition {
  id: string
  targetPhase: string
  condition: TransitionCondition
  priority: number
  metadata?: Record<string, any>
}

export interface TransitionCondition {
  type: 'always' | 'never' | 'output-contains' | 'structured-field-equals' | 'exit-code' | 'composite'
  config: Record<string, any>
}

export interface WorkflowDefinition {
  id: string
  name: string
  description?: string
  version: string
  phases: WorkflowPhase[]
  initialPhase: string
  context: Record<string, any>
  metadata?: Record<string, any>
}

export interface PhaseExecution {
  id: string
  phaseId: string
  workflowId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout'
  startedAt: Date
  completedAt?: Date
  input: Record<string, any>
  output?: PhaseOutput
  error?: string
  context: WorkflowContext
  metadata?: Record<string, any>
}

export interface PhaseOutput {
  structured: Record<string, any>
  raw: string
  metadata: Record<string, any>
}

export interface WorkflowContext {
  execution_id: string
  variables: Record<string, any>
  state: Record<string, any>
  [key: string]: any
}

export interface WorkflowStatus {
  workflowId: string
  currentPhase: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt?: Date
  completedAt?: Date
  phases: PhaseStatusInfo[]
  executionHistory: PhaseExecution[]
}

export interface PhaseStatusInfo {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  executionCount: number
  lastExecutedAt?: Date
}

export interface ValidationResult<T = any> {
  valid: boolean
  data?: T
  errors?: string[]
}

export interface ProcessedOutput {
  valid: boolean
  structured: Record<string, any>
  raw: string
  metadata: Record<string, any>
  errors?: string[]
}