/**
 * React hook for planning execution state and result management
 * Handles plan execution, error recovery, and progress tracking
 */

import { useRef } from 'react'
import { useMount, useUnmount, useMountedState } from '../reconciler/hooks'
import type { ExecutionPlan } from './useTasks'

// Execution result interfaces
export interface PlanExecutionResult {
  id: string
  planId: string
  status: 'completed' | 'partial_success' | 'failed' | 'cancelled'
  results: TaskExecutionResult[]
  summary: string
  metrics: ExecutionMetrics
  startedAt: string
  completedAt?: string
  error?: string
}

export interface TaskExecutionResult {
  taskId: string
  status: 'completed' | 'failed' | 'skipped'
  output?: string
  error?: string
  executionTime: number
  agentId?: string
}

export interface ExecutionMetrics {
  totalDuration: number
  tasksCompleted: number
  tasksError: number
  successRate: number
  averageTaskTime?: number
}

export interface ExecutionProgress {
  total: number
  completed: number
  current: string | null
  phase?: string
  timeElapsed: number
  estimatedTimeRemaining?: number
}

export interface PlanExecutionOptions {
  agent: PlanningAgent
  timeout?: number
  retries?: number
  retryDelay?: number
  onProgress?: (progress: ExecutionProgress) => void
  onTaskStart?: (task: any) => void
  onTaskComplete?: (task: any, result: TaskExecutionResult) => void
  allowParallel?: boolean
  continueOnFailure?: boolean
  collectMetrics?: boolean
  saveToHistory?: boolean
  allowModification?: boolean
}

export interface PlanningAgent {
  executePlan(plan: ExecutionPlan): Promise<PlanExecutionResult>
}

export interface ExecutionHistoryEntry {
  id: string
  planId: string
  planTitle: string
  status: PlanExecutionResult['status']
  executedAt: string
  duration: number
  tasksCompleted: number
  successRate: number
}

export interface UsePlannerResultHook {
  // State getters
  readonly status: 'idle' | 'executing' | 'completed' | 'error' | 'cancelled'
  readonly result: PlanExecutionResult | null
  readonly error: string | null
  readonly isExecuting: boolean
  readonly progress: ExecutionProgress
  readonly retryCount: number

  // Core operations
  executePlan(plan: ExecutionPlan, options: PlanExecutionOptions): Promise<PlanExecutionResult>
  cancelExecution(): void

  // History and metrics
  getExecutionHistory(): ExecutionHistoryEntry[]
  clearHistory(): void

  // Cleanup
  cleanup?: () => void
}

/**
 * React hook for planning execution and result management
 */
export function usePlannerResult(): UsePlannerResultHook {
  // Non-reactive state using useRef (following project patterns)
  const statusRef = useRef<'idle' | 'executing' | 'completed' | 'error' | 'cancelled'>('idle')
  const resultRef = useRef<PlanExecutionResult | null>(null)
  const errorRef = useRef<string | null>(null)
  const progressRef = useRef<ExecutionProgress>({
    total: 0,
    completed: 0,
    current: null,
    timeElapsed: 0
  })
  const retryCountRef = useRef<number>(0)
  const executionHistoryRef = useRef<ExecutionHistoryEntry[]>([])

  // Execution control
  const currentExecutionRef = useRef<{
    abortController: AbortController
    startTime: number
    timeoutId?: NodeJS.Timeout
  } | null>(null)

  const isMounted = useMountedState()

  // Cleanup on unmount
  useUnmount(() => {
    if (currentExecutionRef.current) {
      currentExecutionRef.current.abortController.abort()
      if (currentExecutionRef.current.timeoutId) {
        clearTimeout(currentExecutionRef.current.timeoutId)
      }
    }
  })

  const updateState = (updates: {
    status?: typeof statusRef.current
    result?: PlanExecutionResult | null
    error?: string | null
    progress?: Partial<ExecutionProgress>
  }) => {
    if (!isMounted()) return

    if (updates.status !== undefined) statusRef.current = updates.status
    if (updates.result !== undefined) resultRef.current = updates.result
    if (updates.error !== undefined) errorRef.current = updates.error
    if (updates.progress !== undefined) {
      Object.assign(progressRef.current, updates.progress)
    }
  }

  const validatePlan = (plan: ExecutionPlan): void => {
    if (!plan.phases || plan.phases.length === 0) {
      throw new Error('Plan must contain at least one phase')
    }

    const totalTasks = plan.phases.reduce((sum, phase) => sum + phase.tasks.length, 0)
    if (totalTasks === 0) {
      throw new Error('Plan must contain at least one task')
    }

    // Validate phase dependencies
    const phaseIds = new Set(plan.phases.map(phase => phase.id))
    for (const phase of plan.phases) {
      if (phase.dependencies) {
        for (const depId of phase.dependencies) {
          if (!phaseIds.has(depId)) {
            throw new Error(`Phase dependency not found: ${depId}`)
          }
        }
      }
    }
  }

  const executePlan = async (
    plan: ExecutionPlan,
    options: PlanExecutionOptions
  ): Promise<PlanExecutionResult> => {
    // Prevent concurrent executions
    if (statusRef.current === 'executing') {
      throw new Error('Another plan execution is already in progress')
    }

    // Validate plan
    try {
      validatePlan(plan)
    } catch (error) {
      updateState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }

    // Initialize execution state
    const abortController = new AbortController()
    const startTime = Date.now()

    currentExecutionRef.current = {
      abortController,
      startTime
    }

    const totalTasks = plan.phases.reduce((sum, phase) => sum + phase.tasks.length, 0)

    updateState({
      status: 'executing',
      error: null,
      result: null,
      progress: {
        total: totalTasks,
        completed: 0,
        current: 'Starting execution...',
        timeElapsed: 0
      }
    })

    retryCountRef.current = 0

    // Setup timeout if specified
    if (options.timeout) {
      currentExecutionRef.current.timeoutId = setTimeout(() => {
        if (currentExecutionRef.current) {
          currentExecutionRef.current.abortController.abort()
          updateState({
            status: 'error',
            error: 'Plan execution timeout'
          })
        }
      }, options.timeout)
    }

    const executeWithRetry = async (attempt: number = 0): Promise<PlanExecutionResult> => {
      try {
        // Check if cancelled
        if (abortController.signal.aborted) {
          throw new Error('Execution cancelled')
        }

        // Execute the plan
        const result = await executeInternal(plan, options, abortController.signal)

        // Clear timeout
        if (currentExecutionRef.current?.timeoutId) {
          clearTimeout(currentExecutionRef.current.timeoutId)
        }

        // Update state
        updateState({
          status: result.status === 'failed' ? 'error' : 'completed',
          result,
          error: result.error || null
        })

        // Save to history if requested
        if (options.saveToHistory) {
          addToHistory(result)
        }

        currentExecutionRef.current = null
        return result

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        // Handle retry logic
        if (options.retries && attempt < options.retries && !abortController.signal.aborted) {
          retryCountRef.current = attempt + 1

          if (options.retryDelay) {
            await new Promise(resolve => setTimeout(resolve, options.retryDelay))
          }

          return executeWithRetry(attempt + 1)
        }

        // Final failure
        updateState({
          status: abortController.signal.aborted ? 'cancelled' : 'error',
          error: errorMessage
        })

        currentExecutionRef.current = null
        throw error
      }
    }

    return executeWithRetry()
  }

  const executeInternal = async (
    plan: ExecutionPlan,
    options: PlanExecutionOptions,
    signal: AbortSignal
  ): Promise<PlanExecutionResult> => {
    const startTime = Date.now()
    const allResults: TaskExecutionResult[] = []
    let completedTasks = 0

    const updateProgress = (current: string, phase?: string) => {
      if (!isMounted()) return

      const timeElapsed = Date.now() - startTime

      updateState({
        progress: {
          current,
          phase,
          timeElapsed,
          completed: completedTasks,
          estimatedTimeRemaining: completedTasks > 0
            ? (timeElapsed / completedTasks) * (progressRef.current.total - completedTasks)
            : undefined
        }
      })

      if (options.onProgress) {
        options.onProgress({
          ...progressRef.current,
          current,
          phase,
          timeElapsed
        })
      }
    }

    // Execute phases in order (respecting dependencies)
    for (const phase of plan.phases) {
      if (signal.aborted) {
        throw new Error('Execution cancelled')
      }

      updateProgress(`Executing phase: ${phase.name}`, phase.name)

      try {
        // Create a mini-plan for this phase
        const phasePlan: ExecutionPlan = {
          ...plan,
          phases: [phase]
        }

        // Execute the phase
        const phaseResult = await options.agent.executePlan(phasePlan)

        // Process results
        if (phaseResult.results) {
          for (const taskResult of phaseResult.results) {
            allResults.push(taskResult)
            completedTasks++

            updateProgress(`Completed: ${taskResult.taskId}`, phase.name)

            if (options.onTaskComplete) {
              options.onTaskComplete({ id: taskResult.taskId }, taskResult)
            }

            // Stop on failure if not configured to continue
            if (taskResult.status === 'failed' && !options.continueOnFailure) {
              throw new Error(`Task ${taskResult.taskId} failed: ${taskResult.error}`)
            }
          }
        }

      } catch (error) {
        if (!options.continueOnFailure) {
          throw error
        }

        // Log error but continue with next phase
        console.warn(`Phase ${phase.name} failed:`, error)
      }
    }

    const totalDuration = Date.now() - startTime
    const successfulTasks = allResults.filter(r => r.status === 'completed').length
    const failedTasks = allResults.filter(r => r.status === 'failed').length

    const result: PlanExecutionResult = {
      id: `execution-${startTime}`,
      planId: plan.id,
      status: failedTasks === 0 ? 'completed' : (successfulTasks > 0 ? 'partial_success' : 'failed'),
      results: allResults,
      summary: `Executed ${successfulTasks}/${allResults.length} tasks successfully`,
      metrics: {
        totalDuration,
        tasksCompleted: successfulTasks,
        tasksError: failedTasks,
        successRate: allResults.length > 0 ? successfulTasks / allResults.length : 0,
        averageTaskTime: allResults.length > 0
          ? allResults.reduce((sum, r) => sum + r.executionTime, 0) / allResults.length
          : 0
      },
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString()
    }

    return result
  }

  const cancelExecution = (): void => {
    if (currentExecutionRef.current) {
      currentExecutionRef.current.abortController.abort()

      if (currentExecutionRef.current.timeoutId) {
        clearTimeout(currentExecutionRef.current.timeoutId)
      }

      updateState({
        status: 'cancelled',
        error: 'Execution cancelled by user'
      })

      currentExecutionRef.current = null
    }
  }

  const addToHistory = (result: PlanExecutionResult): void => {
    const historyEntry: ExecutionHistoryEntry = {
      id: result.id,
      planId: result.planId,
      planTitle: result.summary, // Could be enhanced with actual plan title
      status: result.status,
      executedAt: result.startedAt,
      duration: result.metrics.totalDuration,
      tasksCompleted: result.metrics.tasksCompleted,
      successRate: result.metrics.successRate
    }

    executionHistoryRef.current.unshift(historyEntry)

    // Keep only last 50 entries
    if (executionHistoryRef.current.length > 50) {
      executionHistoryRef.current = executionHistoryRef.current.slice(0, 50)
    }
  }

  const getExecutionHistory = (): ExecutionHistoryEntry[] => {
    return [...executionHistoryRef.current]
  }

  const clearHistory = (): void => {
    executionHistoryRef.current = []
  }

  return {
    // State getters (computed on access)
    get status() { return statusRef.current },
    get result() { return resultRef.current },
    get error() { return errorRef.current },
    get isExecuting() { return statusRef.current === 'executing' },
    get progress() { return { ...progressRef.current } },
    get retryCount() { return retryCountRef.current },

    // Core operations
    executePlan,
    cancelExecution,

    // History and metrics
    getExecutionHistory,
    clearHistory,

    // Cleanup (for testing)
    cleanup: () => {
      if (currentExecutionRef.current) {
        currentExecutionRef.current.abortController.abort()
        currentExecutionRef.current = null
      }
    }
  }
}