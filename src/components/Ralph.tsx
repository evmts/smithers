import { createContext, useState, useEffect, useMemo, type ReactNode } from 'react'
import type { ReactiveDatabase } from '../reactive-sqlite'
import { useQueryValue } from '../reactive-sqlite'

/**
 * Ralph context for task tracking.
 * Components like Claude register with Ralph when they mount.
 */
export interface RalphContextType {
  registerTask: () => void
  completeTask: () => void
  /**
   * Current ralph iteration count - components can use this to restart execution
   */
  ralphCount: number
  /**
   * Database instance for reactive queries
   */
  db: ReactiveDatabase | null
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
  /**
   * Database instance for storing ralphCount reactively
   * When provided, ralphCount is stored in DB and components can subscribe to changes
   */
  db?: ReactiveDatabase
}

/**
 * Ralph component - manages the iteration loop.
 *
 * The Ralph Wiggum loop:
 * 1. Render children (which may contain Claude components)
 * 2. Claude components execute when ralphCount changes
 * 3. When tasks complete, increment ralphCount in database
 * 4. Components react to ralphCount change and restart explicitly (no remount)
 * 5. Repeat until no more tasks or maxIterations reached
 *
 * This avoids the key remounting hack by storing ralphCount in SQLite
 * and letting components subscribe to changes reactively.
 */
export function Ralph(props: RalphProps): ReactNode {
  const [pendingTasks, setPendingTasks] = useState(0)
  const [hasStartedTasks, setHasStartedTasks] = useState(false)

  const maxIterations = props.maxIterations || 100
  const db = props.db ?? null

  // Read ralphCount from database reactively, or use local state as fallback
  const { data: dbRalphCount } = db
    ? useQueryValue<number>(db, "SELECT CAST(value AS INTEGER) as count FROM state WHERE key = 'ralphCount'")
    : { data: null }

  // Local state fallback when no DB provided
  const [localRalphCount, setLocalRalphCount] = useState(0)

  // Use DB value if available, otherwise local state
  const ralphCount = dbRalphCount ?? localRalphCount

  // Initialize ralphCount in DB if needed
  useEffect(() => {
    if (db && dbRalphCount === null) {
      db.run(
        "INSERT OR IGNORE INTO state (key, value, updated_at) VALUES ('ralphCount', '0', datetime('now'))"
      )
    }
  }, [db, dbRalphCount])

  console.log('[Ralph] Component created, maxIterations:', maxIterations, 'ralphCount:', ralphCount)

  // Increment ralphCount - either in DB or local state
  const incrementRalphCount = useMemo(() => () => {
    const nextCount = ralphCount + 1
    if (db) {
      db.run(
        "UPDATE state SET value = ?, updated_at = datetime('now') WHERE key = 'ralphCount'",
        [String(nextCount)]
      )
    } else {
      setLocalRalphCount(nextCount)
    }
    return nextCount
  }, [db, ralphCount])

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
    ralphCount,
    db,
  }), [ralphCount, db])

  useEffect(() => {
    console.log('[Ralph] useEffect fired! ralphCount:', ralphCount)
    // Monitor pending tasks and trigger next iteration when all complete
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
      if (ralphCount >= maxIterations - 1) {
        // Max iterations reached
        if (checkInterval) clearInterval(checkInterval)
        signalOrchestrationComplete()
        props.onComplete?.()
        return
      }

      // Trigger next iteration by incrementing ralphCount
      const nextIteration = incrementRalphCount()
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
  }, [pendingTasks, hasStartedTasks, ralphCount, maxIterations, props, incrementRalphCount])

  return (
    <RalphContext.Provider value={contextValue}>
      <ralph
        iteration={ralphCount}
        pending={pendingTasks}
        maxIterations={maxIterations}
      >
        {props.children}
      </ralph>
    </RalphContext.Provider>
  )
}
