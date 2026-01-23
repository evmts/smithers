import type { z } from 'zod'

/**
 * Core types for XML-driven dynamic phase system
 */

export interface PhaseStep {
  id: string
  name: string
  type: 'action' | 'condition' | 'parallel' | 'sequence'
  config?: Record<string, any>
  agents?: AgentConfig[]
  onSuccess?: string // next step id
  onFailure?: string // next step id
  timeout?: number
  retries?: number
}

export interface AgentConfig {
  model: string
  systemPrompt?: string
  tools?: string[]
  maxTokens?: number
  temperature?: number
  outputSchema?: z.ZodSchema
}

export interface PhaseTransition {
  from: string
  to: string
  condition?: TransitionCondition
  trigger?: TransitionTrigger
  action?: TransitionAction
}

export interface TransitionCondition {
  type: 'result' | 'state' | 'timeout' | 'manual' | 'expression'
  expression?: string
  value?: any
  operator?: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'matches'
}

export interface TransitionTrigger {
  type: 'automatic' | 'manual' | 'event' | 'timer'
  delay?: number
  eventType?: string
}

export interface TransitionAction {
  type: 'set_state' | 'run_agent' | 'emit_event' | 'save_artifact'
  config?: Record<string, any>
}

export interface PhaseDefinition {
  id: string
  name: string
  description?: string
  version: string
  author?: string
  steps: PhaseStep[]
  transitions: PhaseTransition[]
  initialStep: string
  finalSteps: string[]
  variables?: Record<string, any>
  config?: PhaseConfig
}

export interface PhaseConfig {
  maxDuration?: number
  retryPolicy?: RetryPolicy
  errorHandling?: ErrorHandlingConfig
  logging?: LoggingConfig
  parallelism?: ParallelismConfig
}

export interface RetryPolicy {
  maxRetries: number
  backoffStrategy: 'linear' | 'exponential' | 'fixed'
  baseDelay: number
  maxDelay?: number
  retryConditions?: string[]
}

export interface ErrorHandlingConfig {
  strategy: 'fail_fast' | 'continue' | 'rollback'
  fallbackStep?: string
  errorCallback?: string
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error'
  includeSteps?: boolean
  includeTransitions?: boolean
  includeAgentOutputs?: boolean
}

export interface ParallelismConfig {
  maxConcurrentSteps: number
  maxConcurrentAgents: number
  resourceLimits?: ResourceLimits
}

export interface ResourceLimits {
  maxMemoryMB?: number
  maxCpuPercent?: number
  maxDiskMB?: number
}

/**
 * Runtime execution types
 */

export interface PhaseExecution {
  id: string
  phaseDefinitionId: string
  status: PhaseExecutionStatus
  currentStepId: string | null
  startedAt: string
  completedAt?: string
  error?: string
  context: PhaseContext
  stepExecutions: StepExecution[]
  artifacts: ExecutionArtifact[]
}

export type PhaseExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'

export interface StepExecution {
  id: string
  stepId: string
  phaseExecutionId: string
  status: StepExecutionStatus
  startedAt?: string
  completedAt?: string
  error?: string
  input?: any
  output?: any
  agentExecutions: AgentExecution[]
  retryCount: number
}

export type StepExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'retrying'

export interface AgentExecution {
  id: string
  stepExecutionId: string
  agentConfig: AgentConfig
  status: AgentExecutionStatus
  startedAt?: string
  completedAt?: string
  error?: string
  input: any
  output?: any
  structured_output?: any
  tokenUsage?: TokenUsage
}

export type AgentExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface PhaseContext {
  variables: Record<string, any>
  state: Record<string, any>
  artifacts: Record<string, string>
  metadata: Record<string, any>
}

export interface ExecutionArtifact {
  id: string
  name: string
  type: string
  content: string
  metadata?: Record<string, any>
  createdAt: string
}

/**
 * XML parsing types
 */

export interface ParsedXMLPhase {
  definition: PhaseDefinition
  errors: XMLParseError[]
  warnings: XMLParseWarning[]
}

export interface XMLParseError {
  type: 'syntax' | 'schema' | 'reference' | 'validation'
  message: string
  line?: number
  column?: number
  element?: string
}

export interface XMLParseWarning {
  type: 'deprecated' | 'missing_optional' | 'performance' | 'best_practice'
  message: string
  line?: number
  element?: string
}

/**
 * Phase engine types
 */

export interface PhaseEngine {
  loadDefinition: (xml: string) => Promise<PhaseDefinition>
  executePhase: (definition: PhaseDefinition, context?: Partial<PhaseContext>) => Promise<PhaseExecution>
  pauseExecution: (executionId: string) => Promise<void>
  resumeExecution: (executionId: string) => Promise<void>
  cancelExecution: (executionId: string) => Promise<void>
  getExecution: (executionId: string) => Promise<PhaseExecution | null>
  listExecutions: (filters?: ExecutionFilters) => Promise<PhaseExecution[]>
}

export interface ExecutionFilters {
  status?: PhaseExecutionStatus[]
  phaseDefinitionId?: string
  startedAfter?: string
  startedBefore?: string
  limit?: number
  offset?: number
}

/**
 * Transition manager types
 */

export interface TransitionManager {
  evaluateTransitions: (execution: PhaseExecution, stepResult: any, phaseDefinition: PhaseDefinition) => Promise<string | null>
  canTransition: (fromStepId: string, toStepId: string, context: PhaseContext, phaseDefinition: PhaseDefinition) => boolean
  executeTransition: (execution: PhaseExecution, transition: PhaseTransition) => Promise<void>
  getAvailableTransitions: (stepId: string, context: PhaseContext, phaseDefinition: PhaseDefinition) => PhaseTransition[]
  evaluateCondition: (condition: TransitionCondition, stepResult: any, context: PhaseContext) => boolean
}

/**
 * Event types for phase system
 */

export interface PhaseEvent {
  type: PhaseEventType
  executionId: string
  stepId?: string
  data?: any
  timestamp: string
}

export type PhaseEventType =
  | 'phase_started'
  | 'phase_completed'
  | 'phase_failed'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'step_retrying'
  | 'transition_executed'
  | 'agent_started'
  | 'agent_completed'
  | 'agent_failed'
  | 'artifact_created'
  | 'variable_updated'
  | 'error_occurred'