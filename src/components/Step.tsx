import { useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { ExecutionScopeProvider, useExecutionScope } from './ExecutionScope.js'
import { StepContext } from './StepContext.js'
import { useEffectOnValueChange, useUnmount } from '../reconciler/hooks.js'
import { createLogger, type Logger } from '../debug/index.js'
import { useRequireRalph } from './While.js'
import { isJJRepo, jjSnapshot, jjCommit, getJJStatus, getJJDiffStats } from '../utils/vcs.js'
import { useStepRegistry, useStepIndex } from './StepRegistryProvider.js'

export { 
  StepRegistryProvider, 
  useStepRegistry, 
  useStepIndex,
  StepRegistryContext,
  type StepRegistryContextValue,
  type StepRegistryProviderProps 
} from './StepRegistryProvider.js'

export interface StepProps {
  name?: string
  children: ReactNode
  snapshotBefore?: boolean
  snapshotAfter?: boolean
  commitAfter?: boolean
  commitMessage?: string
  onStart?: () => void
  onComplete?: () => void
  onError?: (error: Error) => void
}

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

    if (runningCount === 0 && totalCount > 0) {
      hasCompletedRef.current = true
      completeStep()
    }
  }, [completeStep, executionScope.enabled, isActive])

  const startStep = useCallback(async () => {
    if (isDbClosed()) return
    taskIdRef.current = db.tasks.start('step', props.name, { scopeId: stepScopeId })

    try {
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
