// Step component with automatic sequential execution within phases
// Steps execute one after another unless wrapped in <Parallel>

import { createContext, useContext, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { jjSnapshot, jjCommit } from '../utils/vcs.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { ExecutionScopeProvider, useExecutionScope } from './ExecutionScope.js'
import { useEffectOnValueChange, useUnmount } from '../reconciler/hooks.js'
import { createLogger, withErrorLogging, type Logger } from '../debug/index.js'

// ============================================================================
// STEP REGISTRY CONTEXT (for sequential execution within a phase)
// ============================================================================

interface StepRegistryContextValue {
  registerStep: (name: string) => number
  currentStepIndex: number
  advanceStep: () => void
  isStepActive: (index: number) => boolean
  isStepCompleted: (index: number) => boolean
  isParallel: boolean
}

const StepRegistryContext = createContext<StepRegistryContextValue | undefined>(undefined)

export function useStepRegistry(): StepRegistryContextValue | undefined {
  return useContext(StepRegistryContext)
}

export function useStepIndex(name: string | undefined): number {
  const registry = useStepRegistry()
  const indexRef = useRef<number | null>(null)
  if (indexRef.current === null) {
    indexRef.current = registry ? registry.registerStep(name ?? 'unnamed') : 0
  }
  return indexRef.current
}

// ============================================================================
// STEP REGISTRY PROVIDER (automatically wraps Phase children)
// ============================================================================

export interface StepRegistryProviderProps {
  children: ReactNode
  phaseId?: string
  isParallel?: boolean
  onAllStepsComplete?: () => void
}

export function StepRegistryProvider(props: StepRegistryProviderProps): ReactNode {
  const { db, reactiveDb, executionEnabled } = useSmithers()
  const stateKey = `stepIndex_${props.phaseId ?? 'default'}`

  // Track registered steps using ref for synchronous updates during render
  // This avoids race conditions when multiple Step components mount simultaneously
  const stepsRef = useRef<string[]>([])

  // Read current step index from SQLite (for sequential mode)
  const { data: dbStepIndex } = useQueryValue<number>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = ?`,
    [stateKey]
  )

  const currentStepIndex = props.isParallel ? -1 : (dbStepIndex ?? 0)

  const registerStep = useCallback((name: string): number => {
    const existingIndex = stepsRef.current.indexOf(name)
    if (existingIndex >= 0) {
      return existingIndex
    }
    const index = stepsRef.current.length
    stepsRef.current.push(name)
    return index
  }, [])

  const registeredStepCount = stepsRef.current.length
  const hasInitializedRef = useRef(false)
  const hasNotifiedAllCompleteRef = useRef(false)
  const initToken = executionEnabled ? (dbStepIndex ?? -1) : -2

  useEffectOnValueChange(initToken, () => {
    if (!executionEnabled || props.isParallel) return
    if (hasInitializedRef.current) return
    if (dbStepIndex !== null && dbStepIndex !== undefined) {
      hasInitializedRef.current = true
      return
    }
    db.state.set(stateKey, 0, 'step_registry_init')
    hasInitializedRef.current = true
  }, [db, dbStepIndex, executionEnabled, props.isParallel, stateKey])

  useEffectOnValueChange(executionEnabled ? currentStepIndex : -1, () => {
    if (!executionEnabled || props.isParallel || registeredStepCount === 0) return
    if (hasNotifiedAllCompleteRef.current) return
    if (currentStepIndex < registeredStepCount) return
    hasNotifiedAllCompleteRef.current = true
    props.onAllStepsComplete?.()
  }, [currentStepIndex, executionEnabled, props.isParallel, props.onAllStepsComplete, registeredStepCount])

  const advanceStep = useCallback(() => {
    if (props.isParallel) return
    const nextIndex = currentStepIndex + 1
    if (nextIndex <= stepsRef.current.length) {
      db.state.set(stateKey, nextIndex, 'step_advance')
    }
  }, [db, stateKey, currentStepIndex, props.isParallel])

  const isStepActive = useCallback((index: number): boolean => {
    if (props.isParallel) return true // All steps active in parallel mode
    if (currentStepIndex >= stepsRef.current.length) return false
    return index === currentStepIndex
  }, [currentStepIndex, props.isParallel])

  const isStepCompleted = useCallback((index: number): boolean => {
    if (props.isParallel) return false
    return index < currentStepIndex
  }, [currentStepIndex, props.isParallel])

  const value = useMemo((): StepRegistryContextValue => ({
    registerStep,
    currentStepIndex,
    advanceStep,
    isStepActive,
    isStepCompleted,
    isParallel: props.isParallel ?? false,
  }), [registerStep, currentStepIndex, advanceStep, isStepActive, isStepCompleted, props.isParallel])

  return (
    <StepRegistryContext.Provider value={value}>
      {props.children}
    </StepRegistryContext.Provider>
  )
}

// ============================================================================
// STEP COMPONENT
// ============================================================================

export interface StepProps {
  /**
   * Step name
   */
  name?: string

  /**
   * Children components
   */
  children: ReactNode

  /**
   * Create JJ snapshot before executing
   */
  snapshotBefore?: boolean

  /**
   * Create JJ snapshot after executing
   */
  snapshotAfter?: boolean

  /**
   * Create JJ commit after executing
   */
  commitAfter?: boolean

  /**
   * Commit message (if commitAfter is true)
   */
  commitMessage?: string

  /**
   * Callback when step starts
   */
  onStart?: () => void

  /**
   * Callback when step completes
   */
  onComplete?: () => void

  /**
   * Callback when step encounters an error
   */
  onError?: (error: Error) => void
}

/**
 * Step component with automatic sequential execution
 *
 * Steps within a Phase execute sequentially by default.
 * Wrap in <Parallel> for concurrent execution.
 *
 * @example
 * ```tsx
 * <Phase name="Build">
 *   <Step name="Write code">
 *     <Claude>Write the implementation</Claude>
 *   </Step>
 *   <Step name="Write tests">
 *     <Claude>Write tests for the implementation</Claude>
 *   </Step>
 * </Phase>
 * ```
 */
export function Step(props: StepProps): ReactNode {
  const { db, reactiveDb, executionId, ralphCount } = useSmithers()
  const registry = useStepRegistry()
  const myIndex = useStepIndex(props.name)
  const executionScope = useExecutionScope()

  const stepIdRef = useRef<string | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const hasStartedRef = useRef(false)
  const hasCompletedRef = useRef(false)
  const baselineTotalTaskCountRef = useRef<number | null>(null)
  const hasSeenChildTasksRef = useRef(false)
  const allowEmptyCompletionRef = useRef(false)
  const allowEmptyCompletionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runningTaskCountRef = useRef(0)
  const totalTaskCountRef = useRef(0)
  const snapshotBeforeIdRef = useRef<string | undefined>(undefined)
  const snapshotAfterIdRef = useRef<string | undefined>(undefined)
  const commitHashRef = useRef<string | undefined>(undefined)
  const stepErrorRef = useRef<Error | null>(null)

  // Create logger with step context
  const log: Logger = useMemo(
    () => createLogger('Step', { name: props.name ?? 'unnamed' }),
    [props.name]
  )

  // Determine if this step should be active
  // If no registry (not inside a Phase), always active
  const isActive = registry ? registry.isStepActive(myIndex) : true
  const isCompleted = registry ? registry.isStepCompleted(myIndex) : false
  const hasError = stepErrorRef.current !== null
  const canExecute = executionScope.enabled && isActive && !hasError
  const status = hasError ? 'error' : canExecute ? 'active' : isCompleted ? 'completed' : 'pending'
  const isDbClosed = () => db.db.isClosed

  const { data: runningTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ? AND status = 'running'`,
    [executionId, ralphCount]
  )

  const { data: totalTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ?`,
    [executionId, ralphCount]
  )

  const clearAllowEmptyCompletionTimeout = useCallback(() => {
    if (allowEmptyCompletionTimeoutRef.current) {
      clearTimeout(allowEmptyCompletionTimeoutRef.current)
      allowEmptyCompletionTimeoutRef.current = null
    }
  }, [])

  // Helper: Complete step with proper error handling and logging
  const completeStep = useCallback(async () => {
    const id = stepIdRef.current
    if (!id) return

    const endTiming = log.time('step_complete')
    try {
      // Snapshot after if requested
      if (props.snapshotAfter) {
        await withErrorLogging(log, 'snapshot_after', async () => {
          const { changeId } = await jjSnapshot(`After step: ${props.name ?? 'unnamed'}`)
          snapshotAfterIdRef.current = changeId
          log.debug('Created snapshot after', { changeId })
        })
      }

      // Commit if requested
      if (props.commitAfter) {
        await withErrorLogging(log, 'commit_after', async () => {
          const message = props.commitMessage ?? `Step: ${props.name ?? 'unnamed'}`
          const result = await jjCommit(message)
          commitHashRef.current = result.commitHash
          log.info('Created commit', { commitHash: result.commitHash, changeId: result.changeId })

          db.vcs.logCommit({
            vcs_type: 'jj',
            commit_hash: result.commitHash,
            change_id: result.changeId,
            message,
          })
        })
      }

      // Complete step in database
      db.steps.complete(id, {
        ...(snapshotBeforeIdRef.current ? { snapshot_before: snapshotBeforeIdRef.current } : {}),
        ...(snapshotAfterIdRef.current ? { snapshot_after: snapshotAfterIdRef.current } : {}),
        ...(commitHashRef.current ? { commit_created: commitHashRef.current } : {}),
      })
      endTiming()

      log.info('Completed', { stepId: id })
      props.onComplete?.()
      registry?.advanceStep()
    } catch (error) {
      endTiming()
      const errorObj = error instanceof Error ? error : new Error(String(error))
      stepErrorRef.current = errorObj
      log.error('Failed to complete step', errorObj)
      props.onError?.(errorObj)
      db.steps.fail(id)
    } finally {
      if (taskIdRef.current) {
        db.tasks.complete(taskIdRef.current)
      }
    }
  }, [db, log, props.commitAfter, props.commitMessage, props.name, props.onComplete, props.onError, props.snapshotAfter, registry])

  const maybeCompleteStep = useCallback((runningCount: number, totalCount: number) => {
    if (!hasStartedRef.current || hasCompletedRef.current) return
    if (stepErrorRef.current) return
    if (!executionScope.enabled || !isActive) return

    const baselineTotal = baselineTotalTaskCountRef.current
    if (baselineTotal !== null && totalCount > baselineTotal) {
      hasSeenChildTasksRef.current = true
    }

    const childRunningCount = Math.max(0, runningCount - 1)
    const canComplete = childRunningCount === 0 && (hasSeenChildTasksRef.current || allowEmptyCompletionRef.current)
    if (!canComplete) return

    hasCompletedRef.current = true
    clearAllowEmptyCompletionTimeout()
    completeStep()
  }, [clearAllowEmptyCompletionTimeout, completeStep, executionScope.enabled, isActive])

  // Helper: Start step with proper error handling and logging
  const startStep = useCallback(async () => {
    if (isDbClosed()) return
    const endTiming = log.time('step_start')
    taskIdRef.current = db.tasks.start('step', props.name)
    baselineTotalTaskCountRef.current = db.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ?',
      [executionId, ralphCount]
    )?.count ?? 0
    hasSeenChildTasksRef.current = false
    allowEmptyCompletionRef.current = false
    clearAllowEmptyCompletionTimeout()
    allowEmptyCompletionTimeoutRef.current = setTimeout(() => {
      allowEmptyCompletionRef.current = true
      maybeCompleteStep(runningTaskCountRef.current, totalTaskCountRef.current)
    }, 50)

    try {
      // Snapshot before if requested
      if (props.snapshotBefore) {
        await withErrorLogging(log, 'snapshot_before', async () => {
          const { changeId } = await jjSnapshot(`Before step: ${props.name ?? 'unnamed'}`)
          snapshotBeforeIdRef.current = changeId
          log.debug('Created snapshot before', { changeId })
        })
      }

      // Start step in database
      if (isDbClosed()) return
      const id = db.steps.start(props.name)
      stepIdRef.current = id
      endTiming()

      log.info('Started', { stepId: id })
      props.onStart?.()
    } catch (error) {
      endTiming()
      const errorObj = error instanceof Error ? error : new Error(String(error))
      stepErrorRef.current = errorObj
      log.error('Failed to start step', errorObj)
      props.onError?.(errorObj)

      if (stepIdRef.current && !isDbClosed()) {
        db.steps.fail(stepIdRef.current)
      }
      if (taskIdRef.current && !isDbClosed()) {
        db.tasks.complete(taskIdRef.current)
      }
    }
  }, [clearAllowEmptyCompletionTimeout, db, executionId, log, maybeCompleteStep, props.name, props.onError, props.onStart, props.snapshotBefore, ralphCount])

  // Reactive step activation - runs when canExecute becomes true
  useEffectOnValueChange(canExecute, () => {
    if (!canExecute || hasStartedRef.current) return
    if (isDbClosed()) return
    hasStartedRef.current = true
    startStep()
  }, [canExecute, startStep])

  useEffectOnValueChange(runningTaskCount ?? 0, () => {
    const nextRunningCount = runningTaskCount ?? 0
    runningTaskCountRef.current = nextRunningCount
    maybeCompleteStep(nextRunningCount, totalTaskCountRef.current)
  }, [maybeCompleteStep, runningTaskCount])

  useEffectOnValueChange(totalTaskCount ?? 0, () => {
    const nextTotalCount = totalTaskCount ?? 0
    totalTaskCountRef.current = nextTotalCount
    maybeCompleteStep(runningTaskCountRef.current, nextTotalCount)
  }, [maybeCompleteStep, totalTaskCount])

  // Cleanup on unmount - complete step if it was started but not completed
  useUnmount(() => {
    clearAllowEmptyCompletionTimeout()
    if (hasStartedRef.current && !hasCompletedRef.current) {
      hasCompletedRef.current = true
      log.debug('Unmount cleanup - completing step')
      
      const id = stepIdRef.current
      if (id && !db.db.isClosed) {
        db.steps.complete(id, {
          ...(snapshotBeforeIdRef.current ? { snapshot_before: snapshotBeforeIdRef.current } : {}),
          ...(snapshotAfterIdRef.current ? { snapshot_after: snapshotAfterIdRef.current } : {}),
          ...(commitHashRef.current ? { commit_created: commitHashRef.current } : {}),
        })
      }
      
      if (taskIdRef.current && !db.db.isClosed) {
        db.tasks.complete(taskIdRef.current)
      }
      
      props.onComplete?.()
    }
  })

  return (
    <step 
      {...(props.name ? { name: props.name } : {})} 
      status={status}
      {...(stepErrorRef.current ? { error: stepErrorRef.current.message } : {})}
    >
      <ExecutionScopeProvider enabled={canExecute}>
        {props.children}
      </ExecutionScopeProvider>
    </step>
  )
}
