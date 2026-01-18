import { createContext, useState, useEffect, useMemo, useReducer, type ReactNode } from 'react'

/**
 * Ralph context for task tracking.
 * Components like Claude register with Ralph when they mount.
 */
export interface RalphContextType {
  registerTask: () => void
  completeTask: () => void
}

export const RalphContext = createContext<RalphContextType | undefined>(undefined)

// Global completion tracking for the root to await
let _orchestrationResolve: (() => void) | null = null
let _orchestrationReject: ((err: Error) => void) | null = null

/**
 * Create a promise that resolves when orchestration completes.
 * Called by createSmithersRoot before mounting.
 */
export function createOrchestrationPromise(): Promise<void> {
  return new Promise((resolve, reject) => {
    _orchestrationResolve = resolve
    _orchestrationReject = reject
  })
}

/**
 * Signal that orchestration is complete (called internally by Ralph)
 */
export function signalOrchestrationComplete(): void {
  if (_orchestrationResolve) {
    _orchestrationResolve()
    _orchestrationResolve = null
    _orchestrationReject = null
  }
}

/**
 * Signal that orchestration failed (called internally by Ralph)
 */
export function signalOrchestrationError(err: Error): void {
  if (_orchestrationReject) {
    _orchestrationReject(err)
    _orchestrationResolve = null
    _orchestrationReject = null
  }
}

export interface RalphProps {
  maxIterations?: number
  onIteration?: (iteration: number) => void
  onComplete?: () => void
  children?: ReactNode
}

/**
 * Ralph component - manages the remount loop.
 *
 * The Ralph Wiggum loop:
 * 1. Render children (which may contain Claude components)
 * 2. Claude components execute on mount
 * 3. When tasks complete, increment key to force remount
 * 4. Repeat until no more tasks or maxIterations reached
 *
 * This is the core orchestration pattern.
 */
export function Ralph(props: RalphProps): ReactNode {
  const [iteration, setIteration] = useState(0)
  const [pendingTasks, setPendingTasks] = useState(0)
  const [key, incrementKey] = useReducer((k: number) => k + 1, 0)
  const [hasStartedTasks, setHasStartedTasks] = useState(false)

  const maxIterations = props.maxIterations || 100

  console.log('[Ralph] Component created, maxIterations:', maxIterations)

  const contextValue: RalphContextType = useMemo(() => ({
    registerTask: () => {
      console.log('[Ralph] registerTask called')
      setHasStartedTasks(true)
      setPendingTasks((p: number) => p + 1)
    },
    completeTask: () => {
      console.log('[Ralph] completeTask called')
      setPendingTasks((p: number) => p - 1)
    },
  }), [])

  useEffect(() => {
    console.log('[Ralph] useEffect fired!')
    // Monitor pending tasks and trigger remount when all complete
    let checkInterval: NodeJS.Timeout | null = null
    let stableCount = 0 // Count consecutive stable checks (no tasks running)

    checkInterval = setInterval(() => {
      // If tasks are running, reset stable counter
      if (pendingTasks > 0) {
        stableCount = 0
        return
      }

      // If no tasks have ever started and we've waited a bit, complete
      if (!hasStartedTasks) {
        stableCount++
        // Wait 500ms (50 checks) before declaring no work to do
        if (stableCount > 50) {
          if (checkInterval) clearInterval(checkInterval)
          signalOrchestrationComplete()
          props.onComplete?.()
        }
        return
      }

      // Tasks have completed - check if we should continue or finish
      stableCount++

      // Wait at least 100ms (10 checks) for any new tasks to register
      if (stableCount < 10) {
        return
      }

      // All tasks complete
      if (iteration >= maxIterations - 1) {
        // Max iterations reached
        if (checkInterval) clearInterval(checkInterval)
        signalOrchestrationComplete()
        props.onComplete?.()
        return
      }

      // Trigger remount for next iteration
      const nextIteration = iteration + 1
      setIteration(nextIteration)
      incrementKey()
      setHasStartedTasks(false) // Reset for next iteration
      stableCount = 0

      if (props.onIteration) {
        props.onIteration(nextIteration)
      }
    }, 10) // Check every 10ms

    // Cleanup on unmount
    return () => {
      if (checkInterval) clearInterval(checkInterval)
    }
  }, [pendingTasks, hasStartedTasks, iteration, maxIterations, props])

  return (
    <RalphContext.Provider value={contextValue}>
      <ralph
        key={key}
        iteration={iteration}
        pending={pendingTasks}
        maxIterations={maxIterations}
      >
        {props.children}
      </ralph>
    </RalphContext.Provider>
  )
}
