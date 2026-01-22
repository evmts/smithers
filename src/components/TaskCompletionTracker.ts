import { useRef, useMemo } from 'react'
import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { useEffectOnValueChange } from '../reconciler/hooks.js'

export interface TaskCompletionState {
  pendingTasks: number
  hasStartedTasks: boolean
  hasCompleted: boolean
}

export interface TaskCompletionCallbacks {
  onComplete: () => void
  checkStopConditions: () => void
}

export function useTaskCompletionTracker(
  reactiveDb: ReactiveDatabase,
  executionId: string,
  callbacks: TaskCompletionCallbacks
): TaskCompletionState {
  const { data: runningTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND status = 'running'`,
    [executionId]
  )

  const { data: totalTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ?`,
    [executionId]
  )

  const pendingTasks = runningTaskCount ?? 0
  const hasStartedTasks = (totalTaskCount ?? 0) > 0

  const hasCompletedRef = useRef(false)
  const hasStartedTasksRef = useRef(false)
  const completionCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  if (hasStartedTasks && !hasStartedTasksRef.current) {
    hasStartedTasksRef.current = true
  }

  const memoizedCallbacks = useMemo(() => callbacks, [callbacks.onComplete, callbacks.checkStopConditions])

  useEffectOnValueChange(pendingTasks, () => {
    if (completionCheckTimeoutRef.current) {
      clearTimeout(completionCheckTimeoutRef.current)
      completionCheckTimeoutRef.current = null
    }

    memoizedCallbacks.checkStopConditions()

    if (pendingTasks > 0) return

    if (!hasStartedTasksRef.current) {
      completionCheckTimeoutRef.current = setTimeout(() => {
        if (!hasCompletedRef.current && !hasStartedTasksRef.current) {
          hasCompletedRef.current = true
          memoizedCallbacks.onComplete()
        }
      }, 500)
      return
    }

    completionCheckTimeoutRef.current = setTimeout(() => {
      if (reactiveDb.isClosed || hasCompletedRef.current) return
      hasCompletedRef.current = true
      memoizedCallbacks.onComplete()
    }, 50)
  }, [hasStartedTasks, reactiveDb, memoizedCallbacks])

  return {
    pendingTasks,
    hasStartedTasks,
    hasCompleted: hasCompletedRef.current,
  }
}

export function createCompletionTimeoutCleanup(
  completionCheckTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
): () => void {
  return () => {
    if (completionCheckTimeoutRef.current) {
      clearTimeout(completionCheckTimeoutRef.current)
      completionCheckTimeoutRef.current = null
    }
  }
}
