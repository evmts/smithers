// Step component with automatic sequential execution within phases
// Steps execute one after another unless wrapped in <Parallel>

import { createContext, useContext, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { jjSnapshot, jjCommit } from '../utils/vcs.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { ExecutionScopeProvider, useExecutionScope } from './ExecutionScope.js'
import { StepContext } from './StepContext.js'
import { useEffectOnValueChange, useUnmount } from '../reconciler/hooks.js'
import { createLogger, withErrorLogging, type Logger } from '../debug/index.js'

// ============================================================================
// STEP REGISTRY CONTEXT (for sequential execution within a phase)
// ============================================================================

const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, '\\$&')

interface StepRegistryContextValue {
  registerStep: (name: string) => number
  currentStepIndex: number
  advanceStep: () => void
  isStepActive: (index: number) => boolean
  isStepCompleted: (index: number) => boolean
  markStepComplete: (index: number) => void
  getCompletionKey: (index: number) => string | null
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
  registryId?: string
  enabled?: boolean
}

export function StepRegistryProvider(props: StepRegistryProviderProps): ReactNode {
  const { db, reactiveDb, executionEnabled, executionId, ralphCount } = useSmithers()
  const isParallel = props.isParallel ?? false
  const registryEnabled = props.enabled ?? true
  const completionEnabled = executionEnabled && registryEnabled
  const registryKey = props.registryId ?? props.phaseId ?? 'default'
  const stateKey = `stepIndex_${props.phaseId ?? 'default'}`
  const completionKeyPrefix = isParallel ? `stepComplete:${registryKey}` : null

  // Track registered steps using ref for synchronous updates during render
  // This avoids race conditions when multiple Step components mount simultaneously
  const stepsRef = useRef<string[]>([])

  // For tracking direct child tasks when no Steps are registered (e.g., Claude directly in Phase)
  const hasSeenTasksRef = useRef(false)
  const taskTrackingEnabledRef = useRef(false)

  // Read current step index from SQLite (for sequential mode)
  const { data: dbStepIndex } = useQueryValue<number>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = ?`,
    [stateKey],
    { skip: isParallel }
  )

  const currentStepIndex = isParallel ? -1 : (dbStepIndex ?? 0)
  const completionPattern = completionKeyPrefix
    ? `${escapeLikePattern(completionKeyPrefix)}:%`
    : ''

  const { data: completedCountRaw } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM state WHERE key LIKE ? ESCAPE '\\' AND value = '1'`,
    [completionPattern],
    { skip: !isParallel }
  )

  const completedCount = completedCountRaw ?? 0

  // Track direct child tasks (for phases with Claude but no Step wrappers)
  // Only query if no steps have been registered yet
  const shouldTrackTasks = completionEnabled && stepsRef.current.length === 0

  const { data: runningTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count
     FROM tasks
     WHERE execution_id = ? AND iteration = ? AND status = 'running' AND component_type NOT IN ('step', 'phase')`,
    [executionId, ralphCount],
    { skip: !shouldTrackTasks }
  )

  const { data: totalTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count
     FROM tasks
     WHERE execution_id = ? AND iteration = ? AND component_type NOT IN ('step', 'phase')`,
    [executionId, ralphCount],
    { skip: !shouldTrackTasks }
  )

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
  const completedStepsRef = useRef<Set<number>>(new Set())
  const hasInitializedRef = useRef(false)
  const hasNotifiedAllCompleteRef = useRef(false)
  const initToken = completionEnabled ? (dbStepIndex ?? -1) : -2

  useEffectOnValueChange(initToken, () => {
    if (!completionEnabled || isParallel) return
    if (hasInitializedRef.current) return
    if (dbStepIndex !== null && dbStepIndex !== undefined) {
      hasInitializedRef.current = true
      return
    }
    if (db.state.has(stateKey)) {
      hasInitializedRef.current = true
      return
    }
    db.state.set(stateKey, 0, 'step_registry_init')
    hasInitializedRef.current = true
  }, [db, dbStepIndex, completionEnabled, isParallel, stateKey])

  const maybeNotifyAllComplete = useCallback((completedOverride?: number) => {
    if (!completionEnabled) return
    if (hasNotifiedAllCompleteRef.current) return
    const totalSteps = stepsRef.current.length

    // Handle case when no Steps are registered but there are direct child tasks (e.g., Claude in Phase)
    if (totalSteps === 0) {
      // Track if we've seen any tasks
      const currentTotalTasks = totalTaskCount ?? 0
      const currentRunningTasks = runningTaskCount ?? 0

      if (currentTotalTasks > 0) {
        hasSeenTasksRef.current = true
        taskTrackingEnabledRef.current = true
      }

      // Only complete if we've seen tasks and they're all done running
      if (taskTrackingEnabledRef.current && hasSeenTasksRef.current && currentRunningTasks === 0) {
        hasNotifiedAllCompleteRef.current = true
        props.onAllStepsComplete?.()
      }
      return
    }

    const completedCountValue = completedOverride ?? (isParallel ? completedCount : completedStepsRef.current.size)
    const sequentialDone = !isParallel && currentStepIndex >= totalSteps
    if (sequentialDone || completedCountValue >= totalSteps) {
      hasNotifiedAllCompleteRef.current = true
      props.onAllStepsComplete?.()
    }
  }, [completionEnabled, completedCount, currentStepIndex, isParallel, props.onAllStepsComplete, runningTaskCount, totalTaskCount])

  const sequentialCompletionToken = completionEnabled && !isParallel
    ? `${currentStepIndex}/${registeredStepCount}`
    : 'disabled'
  const parallelCompletionToken = completionEnabled && isParallel
    ? `${completedCount}/${registeredStepCount}`
    : 'disabled'
  // Token for tracking direct child tasks when no Steps are registered
  const taskCompletionToken = completionEnabled && registeredStepCount === 0
    ? `${runningTaskCount ?? 0}/${totalTaskCount ?? 0}`
    : 'disabled'

  useEffectOnValueChange(sequentialCompletionToken, () => {
    if (isParallel) return
    maybeNotifyAllComplete()
  }, [isParallel, maybeNotifyAllComplete, sequentialCompletionToken])

  useEffectOnValueChange(parallelCompletionToken, () => {
    if (!isParallel) return
    maybeNotifyAllComplete(completedCount)
  }, [completedCount, isParallel, maybeNotifyAllComplete, parallelCompletionToken])

  // Effect for direct task tracking when no Steps are registered
  useEffectOnValueChange(taskCompletionToken, () => {
    if (registeredStepCount > 0) return  // Steps are registered, use step-based completion
    maybeNotifyAllComplete()
  }, [maybeNotifyAllComplete, registeredStepCount, taskCompletionToken])

  const advanceStep = useCallback(() => {
    if (isParallel) return
    const nextIndex = currentStepIndex + 1
    const totalSteps = stepsRef.current.length
    if (totalSteps === 0 || nextIndex <= totalSteps) {
      db.state.set(stateKey, nextIndex, 'step_advance')
    }
  }, [db, stateKey, currentStepIndex, isParallel])

  const isStepActive = useCallback((index: number): boolean => {
    if (isParallel) return true // All steps active in parallel mode
    if (currentStepIndex >= stepsRef.current.length) return false
    return index === currentStepIndex
  }, [currentStepIndex, isParallel])

  const isStepCompleted = useCallback((index: number): boolean => {
    if (completedStepsRef.current.has(index)) return true
    if (isParallel) return false
    return index < currentStepIndex
  }, [currentStepIndex, isParallel])

  const getCompletionKey = useCallback((index: number): string | null => {
    if (!isParallel || !completionKeyPrefix) return null
    return `${completionKeyPrefix}:${index}`
  }, [completionKeyPrefix, isParallel])

  const markStepComplete = useCallback((index: number) => {
    if (completedStepsRef.current.has(index)) return
    completedStepsRef.current.add(index)
    const completionKey = getCompletionKey(index)
    if (completionKey && !db.db.isClosed) {
      db.state.set(completionKey, 1, 'parallel_step_complete')
    }
    maybeNotifyAllComplete(completedStepsRef.current.size)
  }, [db, getCompletionKey, maybeNotifyAllComplete])

  const value = useMemo((): StepRegistryContextValue => ({
    registerStep,
    currentStepIndex,
    advanceStep,
    isStepActive,
    isStepCompleted,
    markStepComplete,
    getCompletionKey,
    isParallel,
  }), [registerStep, currentStepIndex, advanceStep, isStepActive, isStepCompleted, markStepComplete, getCompletionKey, isParallel])

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

  const stepScopeRef = useRef<{ iteration: number; scopeId: string }>({
    iteration: ralphCount,
    scopeId: crypto.randomUUID(),
  })
  if (stepScopeRef.current.iteration !== ralphCount) {
    stepScopeRef.current = { iteration: ralphCount, scopeId: crypto.randomUUID() }
  }
  const stepScopeId = stepScopeRef.current.scopeId

  const stepIdRef = useRef<string | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const hasStartedRef = useRef(false)
  const hasCompletedRef = useRef(false)
  const baselineTotalTaskCountRef = useRef<number | null>(null)
  const hasSeenChildTasksRef = useRef(false)
  const allowEmptyCompletionRef = useRef(false)
  const observedRunningAfterStartRef = useRef(false)
  const observedTotalAfterStartRef = useRef(false)
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
  const hasError = stepErrorRef.current !== null
  const isDbClosed = () => db.db.isClosed

  const completionKey = registry?.getCompletionKey?.(myIndex) ?? null
  const { data: completionValue } = useQueryValue<string>(
    reactiveDb,
    completionKey ? `SELECT value FROM state WHERE key = ?` : `SELECT 1 WHERE 0`,
    completionKey ? [completionKey] : []
  )
  const isRecordedComplete = completionValue === '1'

  useEffectOnValueChange(isRecordedComplete, () => {
    if (isRecordedComplete) {
      hasCompletedRef.current = true
    }
  }, [isRecordedComplete])

  const isCompleted = registry ? registry.isStepCompleted(myIndex) : false
  const hasCompleted = hasCompletedRef.current || isRecordedComplete || isCompleted
  const canExecute = executionScope.enabled && isActive && !hasError && !hasCompleted
  const status = hasError ? 'error' : hasCompleted ? 'completed' : canExecute ? 'active' : 'pending'

  const { data: runningTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count
     FROM tasks
     WHERE execution_id = ? AND iteration = ? AND scope_id = ? AND status = 'running' AND component_type != ?`,
    [executionId, ralphCount, stepScopeId, 'step']
  )

  const { data: totalTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count
     FROM tasks
     WHERE execution_id = ? AND iteration = ? AND scope_id = ? AND component_type != ?`,
    [executionId, ralphCount, stepScopeId, 'step']
  )

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
      registry?.markStepComplete(myIndex)
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
  }, [db, log, myIndex, props.commitAfter, props.commitMessage, props.name, props.onComplete, props.onError, props.snapshotAfter, registry])

  const maybeCompleteStep = useCallback((runningCount: number, totalCount: number) => {
    if (!hasStartedRef.current || hasCompletedRef.current) return
    if (stepErrorRef.current) return
    if (!executionScope.enabled || !isActive) return

    const baselineTotal = baselineTotalTaskCountRef.current
    if (baselineTotal !== null && totalCount > baselineTotal) {
      hasSeenChildTasksRef.current = true
    }

    const canComplete = runningCount === 0 && (hasSeenChildTasksRef.current || allowEmptyCompletionRef.current)
    if (!canComplete) return

    hasCompletedRef.current = true
    completeStep()
  }, [completeStep, executionScope.enabled, isActive])

  // Helper: Start step with proper error handling and logging
  const startStep = useCallback(async () => {
    if (isDbClosed()) return
    const endTiming = log.time('step_start')
    taskIdRef.current = db.tasks.start('step', props.name, { scopeId: stepScopeId })
    baselineTotalTaskCountRef.current = db.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM tasks
       WHERE execution_id = ? AND iteration = ? AND scope_id = ? AND component_type != ?`,
      [executionId, ralphCount, stepScopeId, 'step']
    )?.count ?? 0
    hasSeenChildTasksRef.current = false
    allowEmptyCompletionRef.current = false
    observedRunningAfterStartRef.current = false
    observedTotalAfterStartRef.current = false

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
  }, [db, executionId, log, maybeCompleteStep, props.name, props.onError, props.onStart, props.snapshotBefore, ralphCount, stepScopeId])

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
    if (hasStartedRef.current) {
      observedRunningAfterStartRef.current = true
      if (observedTotalAfterStartRef.current) {
        allowEmptyCompletionRef.current = true
      }
    }
    maybeCompleteStep(nextRunningCount, totalTaskCountRef.current)
  }, [maybeCompleteStep, runningTaskCount])

  useEffectOnValueChange(totalTaskCount ?? 0, () => {
    const nextTotalCount = totalTaskCount ?? 0
    totalTaskCountRef.current = nextTotalCount
    if (hasStartedRef.current) {
      observedTotalAfterStartRef.current = true
      if (observedRunningAfterStartRef.current) {
        allowEmptyCompletionRef.current = true
      }
    }
    maybeCompleteStep(runningTaskCountRef.current, nextTotalCount)
  }, [maybeCompleteStep, totalTaskCount])

  // Cleanup on unmount - complete step if it was started but not completed
  useUnmount(() => {
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
      
      registry?.markStepComplete(myIndex)
      props.onComplete?.()
    }
  })

  return (
    <step 
      {...(props.name ? { name: props.name } : {})} 
      status={status}
      {...(stepErrorRef.current ? { error: stepErrorRef.current.message } : {})}
    >
      {canExecute && (
        <StepContext.Provider value={{ isActive: canExecute }}>
          <ExecutionScopeProvider enabled={canExecute} scopeId={stepScopeId}>
            {props.children}
          </ExecutionScopeProvider>
        </StepContext.Provider>
      )}
    </step>
  )
}
