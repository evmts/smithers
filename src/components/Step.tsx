import { createContext, useContext, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { ExecutionScopeProvider, useExecutionScope } from './ExecutionScope.js'
import { StepContext } from './StepContext.js'
import { useEffectOnValueChange, useUnmount } from '../reconciler/hooks.js'
import { createLogger, type Logger } from '../debug/index.js'
import { useRequireRalph } from './While.js'
import { isJJRepo, jjSnapshot, jjCommit, getJJStatus, getJJDiffStats } from '../utils/vcs.js'

// ============================================================================
// STEP REGISTRY CONTEXT (for sequential execution within a phase)
// ============================================================================

interface StepRegistryContextValue {
  registerStep: (name: string) => number
  currentStepIndex: number
  advanceStep: () => void
  isStepActive: (index: number) => boolean
  isStepCompleted: (index: number) => boolean
  markStepComplete: (index: number) => void
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
  useRequireRalph('StepRegistryProvider')
  const { db, reactiveDb, executionEnabled } = useSmithers()
  const isParallel = props.isParallel ?? false
  const registryEnabled = props.enabled ?? true
  const completionEnabled = executionEnabled && registryEnabled
  const stateKey = `stepIndex_${props.phaseId ?? 'default'}`

  const stepsRef = useRef<string[]>([])
  const completedStepsRef = useRef<Set<number>>(new Set())
  const hasInitializedRef = useRef(false)
  const hasNotifiedAllCompleteRef = useRef(false)
  const hasWarnedNoStepsRef = useRef(false)

  const log = useMemo(() => createLogger('StepRegistryProvider', { phaseId: props.phaseId }), [props.phaseId])

  const { data: dbStepIndex } = useQueryValue<number>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = ?`,
    [stateKey],
    { skip: isParallel }
  )

  const currentStepIndex = isParallel ? -1 : (dbStepIndex ?? 0)
  const registeredStepCount = stepsRef.current.length

  const registerStep = useCallback((name: string): number => {
    const existingIndex = stepsRef.current.indexOf(name)
    if (existingIndex >= 0) return existingIndex
    const index = stepsRef.current.length
    stepsRef.current.push(name)
    return index
  }, [])

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
    if (!completionEnabled || hasNotifiedAllCompleteRef.current) return
    const totalSteps = stepsRef.current.length

    if (totalSteps === 0) {
      if (!hasWarnedNoStepsRef.current) {
        hasWarnedNoStepsRef.current = true
        log.warn('Phase has no Steps - wrap children in <Step>')
      }
      return
    }

    const completedCountValue = completedOverride ?? completedStepsRef.current.size
    const sequentialDone = !isParallel && currentStepIndex >= totalSteps
    if (sequentialDone || completedCountValue >= totalSteps) {
      hasNotifiedAllCompleteRef.current = true
      props.onAllStepsComplete?.()
    }
  }, [completionEnabled, currentStepIndex, isParallel, log, props.onAllStepsComplete])

  const sequentialCompletionToken = completionEnabled && !isParallel
    ? `${currentStepIndex}/${registeredStepCount}`
    : 'disabled'
  const parallelCompletionToken = completionEnabled && isParallel
    ? `${completedStepsRef.current.size}/${registeredStepCount}`
    : 'disabled'

  useEffectOnValueChange(sequentialCompletionToken, () => {
    if (isParallel) return
    maybeNotifyAllComplete()
  }, [isParallel, maybeNotifyAllComplete, sequentialCompletionToken])

  useEffectOnValueChange(parallelCompletionToken, () => {
    if (!isParallel) return
    maybeNotifyAllComplete(completedStepsRef.current.size)
  }, [isParallel, maybeNotifyAllComplete, parallelCompletionToken])

  const advanceStep = useCallback(() => {
    if (isParallel) return
    const nextIndex = currentStepIndex + 1
    const totalSteps = stepsRef.current.length
    if (totalSteps === 0 || nextIndex <= totalSteps) {
      db.state.set(stateKey, nextIndex, 'step_advance')
    }
  }, [db, stateKey, currentStepIndex, isParallel])

  const isStepActive = useCallback((index: number): boolean => {
    if (isParallel) return true
    if (currentStepIndex >= stepsRef.current.length) return false
    return index === currentStepIndex
  }, [currentStepIndex, isParallel])

  const isStepCompleted = useCallback((index: number): boolean => {
    if (completedStepsRef.current.has(index)) return true
    if (isParallel) return false
    return index < currentStepIndex
  }, [currentStepIndex, isParallel])

  const markStepComplete = useCallback((index: number) => {
    if (completedStepsRef.current.has(index)) return
    completedStepsRef.current.add(index)
    maybeNotifyAllComplete(completedStepsRef.current.size)
  }, [maybeNotifyAllComplete])

  const value = useMemo((): StepRegistryContextValue => ({
    registerStep,
    currentStepIndex,
    advanceStep,
    isStepActive,
    isStepCompleted,
    markStepComplete,
    isParallel,
  }), [registerStep, currentStepIndex, advanceStep, isStepActive, isStepCompleted, markStepComplete, isParallel])

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
  name?: string
  children: ReactNode
  /** Create a JJ snapshot before step execution. Useful for rollback if step fails. */
  snapshotBefore?: boolean
  /** Create a JJ snapshot after step completes successfully. */
  snapshotAfter?: boolean
  /** Create a JJ commit after step completes. Logged to db.vcs.logCommit(). */
  commitAfter?: boolean
  /** Custom commit message when commitAfter is true. Defaults to "Step: {step-name}". */
  commitMessage?: string
  onStart?: () => void
  onComplete?: () => void
  onError?: (error: Error) => void
}

/**
 * Step component with automatic sequential execution
 *
 * Steps within a Phase execute sequentially by default.
 * Wrap in <Parallel> for concurrent execution.
 */
export function Step(props: StepProps): ReactNode {
  const ralphCtx = useRequireRalph('Step')
  const { db, reactiveDb, executionId } = useSmithers()
  const ralphCount = ralphCtx.iteration
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
  const stepErrorRef = useRef<Error | null>(null)

  const log: Logger = useMemo(
    () => createLogger('Step', { name: props.name ?? 'unnamed' }),
    [props.name]
  )

  const isActive = registry ? registry.isStepActive(myIndex) : true
  const hasError = stepErrorRef.current !== null
  const isDbClosed = () => db.db.isClosed

  const isCompleted = registry ? registry.isStepCompleted(myIndex) : false
  const hasCompleted = hasCompletedRef.current || isCompleted
  const canExecute = executionScope.enabled && isActive && !hasError && !hasCompleted
  const status = hasError ? 'error' : hasCompleted ? 'completed' : canExecute ? 'active' : 'pending'

  const { data: runningTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ? AND scope_id = ? AND status = 'running' AND component_type != ?`,
    [executionId, ralphCount, stepScopeId, 'step']
  )

  const { data: totalTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ? AND scope_id = ? AND component_type != ?`,
    [executionId, ralphCount, stepScopeId, 'step']
  )

  // VCS helper: create snapshot before step
  const doSnapshotBefore = useCallback(async () => {
    if (!props.snapshotBefore) return
    try {
      const isJJ = await isJJRepo()
      if (!isJJ) {
        log.warn('snapshotBefore: JJ not available, skipping')
        return
      }
      const snapshotResult = await jjSnapshot(`Before step: ${props.name ?? 'unnamed'}`)
      const fileStatus = await getJJStatus()
      db.vcs.logSnapshot({
        change_id: snapshotResult.changeId,
        description: snapshotResult.description,
        files_modified: fileStatus.modified,
        files_added: fileStatus.added,
        files_deleted: fileStatus.deleted,
      })
      log.info('Snapshot before', { changeId: snapshotResult.changeId })
    } catch (err) {
      log.warn('snapshotBefore failed (continuing)', { error: err instanceof Error ? err.message : String(err) })
    }
  }, [db, log, props.name, props.snapshotBefore])

  // VCS helper: create snapshot after step
  const doSnapshotAfter = useCallback(async () => {
    if (!props.snapshotAfter) return
    try {
      const isJJ = await isJJRepo()
      if (!isJJ) {
        log.warn('snapshotAfter: JJ not available, skipping')
        return
      }
      const snapshotResult = await jjSnapshot(`After step: ${props.name ?? 'unnamed'}`)
      const fileStatus = await getJJStatus()
      db.vcs.logSnapshot({
        change_id: snapshotResult.changeId,
        description: snapshotResult.description,
        files_modified: fileStatus.modified,
        files_added: fileStatus.added,
        files_deleted: fileStatus.deleted,
      })
      log.info('Snapshot after', { changeId: snapshotResult.changeId })
    } catch (err) {
      log.warn('snapshotAfter failed (continuing)', { error: err instanceof Error ? err.message : String(err) })
    }
  }, [db, log, props.name, props.snapshotAfter])

  // VCS helper: commit after step
  const doCommitAfter = useCallback(async () => {
    if (!props.commitAfter) return
    try {
      const isJJ = await isJJRepo()
      if (!isJJ) {
        log.warn('commitAfter: JJ not available, skipping')
        return
      }
      const message = props.commitMessage ?? `Step: ${props.name ?? 'unnamed'}`
      const commitResult = await jjCommit(message)
      const stats = await getJJDiffStats()
      db.vcs.logCommit({
        vcs_type: 'jj',
        commit_hash: commitResult.commitHash,
        change_id: commitResult.changeId,
        message,
        files_changed: stats.files,
        insertions: stats.insertions,
        deletions: stats.deletions,
      })
      log.info('Commit after', { commitHash: commitResult.commitHash, changeId: commitResult.changeId })
    } catch (err) {
      log.warn('commitAfter failed (continuing)', { error: err instanceof Error ? err.message : String(err) })
    }
  }, [db, log, props.commitAfter, props.commitMessage, props.name])

  const completeStep = useCallback(async () => {
    const id = stepIdRef.current
    if (!id) return

    try {
      // Run VCS operations before marking complete
      await doSnapshotAfter()
      await doCommitAfter()

      db.steps.complete(id)
      log.info('Completed', { stepId: id })
      registry?.markStepComplete(myIndex)
      props.onComplete?.()
      registry?.advanceStep()
    } catch (error) {
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
  }, [db, doCommitAfter, doSnapshotAfter, log, myIndex, props.onComplete, props.onError, registry])

  const maybeCompleteStep = useCallback((runningCount: number, totalCount: number) => {
    if (!hasStartedRef.current || hasCompletedRef.current) return
    if (stepErrorRef.current) return
    if (!executionScope.enabled || !isActive) return

    // Simple rule: complete when no running tasks and we've seen at least one task
    if (runningCount === 0 && totalCount > 0) {
      hasCompletedRef.current = true
      completeStep()
    }
  }, [completeStep, executionScope.enabled, isActive])

  const startStep = useCallback(async () => {
    if (isDbClosed()) return
    taskIdRef.current = db.tasks.start('step', props.name, { scopeId: stepScopeId })

    try {
      // Run snapshotBefore VCS operation
      await doSnapshotBefore()

      const id = db.steps.start(props.name)
      stepIdRef.current = id
      log.info('Started', { stepId: id })
      props.onStart?.()
    } catch (error) {
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
  }, [db, doSnapshotBefore, log, props.name, props.onError, props.onStart, stepScopeId])

  useEffectOnValueChange(canExecute, () => {
    if (!canExecute || hasStartedRef.current) return
    if (isDbClosed()) return
    hasStartedRef.current = true
    startStep()
  }, [canExecute, startStep])

  useEffectOnValueChange(runningTaskCount ?? 0, () => {
    maybeCompleteStep(runningTaskCount ?? 0, totalTaskCount ?? 0)
  }, [maybeCompleteStep, runningTaskCount, totalTaskCount])

  useEffectOnValueChange(totalTaskCount ?? 0, () => {
    maybeCompleteStep(runningTaskCount ?? 0, totalTaskCount ?? 0)
  }, [maybeCompleteStep, runningTaskCount, totalTaskCount])

  useUnmount(() => {
    if (hasStartedRef.current && !hasCompletedRef.current) {
      hasCompletedRef.current = true
      log.debug('Unmount cleanup - completing step')
      
      const id = stepIdRef.current
      if (id && !db.db.isClosed) {
        db.steps.complete(id)
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
