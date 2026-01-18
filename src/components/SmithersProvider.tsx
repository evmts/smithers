// SmithersProvider - Unified context provider for Smithers orchestration
// Consolidates SmithersProvider, RalphContext, and DatabaseProvider into one
// Gives all child components access to database, executionId, Ralph loop, and global controls

import { createContext, useContext, useMemo, useEffect, useRef, type ReactNode } from 'react'
import type { SmithersDB } from '../db/index.js'
import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { DatabaseProvider } from '../reactive-sqlite/hooks/context.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { PhaseRegistryProvider } from './PhaseRegistry.js'
import { useMount } from '../reconciler/hooks.js'
import { useCaptureRenderFrame } from '../hooks/useCaptureRenderFrame.js'

// ============================================================================
// GLOBAL STORE (for universal renderer compatibility)
// ============================================================================

// Module-level store for context value - used as fallback when
// React's Context API doesn't work in universal renderer mode
let globalSmithersContext: SmithersContextValue | null = null

// ============================================================================
// ORCHESTRATION COMPLETION SIGNALS
// ============================================================================

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
 * Signal that orchestration is complete (called internally)
 */
export function signalOrchestrationComplete(): void {
  if (_orchestrationResolve) {
    _orchestrationResolve()
    _orchestrationResolve = null
    _orchestrationReject = null
  }
}

/**
 * Signal that orchestration failed (called internally)
 */
export function signalOrchestrationError(err: Error): void {
  if (_orchestrationReject) {
    _orchestrationReject(err)
    _orchestrationResolve = null
    _orchestrationReject = null
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface SmithersConfig {
  /**
   * Maximum number of iterations for Ralph loops
   */
  maxIterations?: number

  /**
   * Default model to use for agents
   */
  defaultModel?: string

  /**
   * Global timeout in milliseconds
   */
  globalTimeout?: number

  /**
   * Enable verbose logging
   */
  verbose?: boolean

  /**
   * Additional configuration
   */
  [key: string]: any
}

/**
 * Ralph context type for backwards compatibility
 * @deprecated Use db.tasks.start() and db.tasks.complete() instead
 */
export interface RalphContextType {
  /** @deprecated Use db.tasks.start() instead */
  registerTask: () => void
  /** @deprecated Use db.tasks.complete() instead */
  completeTask: () => void
  ralphCount: number
  db: ReactiveDatabase | null
}

export interface SmithersContextValue {
  /**
   * Database instance (SmithersDB wrapper)
   */
  db: SmithersDB

  /**
   * Current execution ID
   */
  executionId: string

  /**
   * Configuration
   */
  config: SmithersConfig

  /**
   * Request orchestration stop
   */
  requestStop: (reason: string) => void

  /**
   * Request rebase operation
   */
  requestRebase: (reason: string) => void

  /**
   * Check if stop has been requested
   */
  isStopRequested: () => boolean

  /**
   * Check if rebase has been requested
   */
  isRebaseRequested: () => boolean

  // ---- Ralph loop fields ----

  /**
   * @deprecated Use db.tasks.start() instead. This is a no-op.
   */
  registerTask: () => void

  /**
   * @deprecated Use db.tasks.complete() instead. This is a no-op.
   */
  completeTask: () => void

  /**
   * Current Ralph iteration count
   */
  ralphCount: number

  /**
   * Raw ReactiveDatabase instance (for useQuery hooks)
   */
  reactiveDb: ReactiveDatabase
}

// ============================================================================
// CONTEXT
// ============================================================================

const SmithersContext = createContext<SmithersContextValue | undefined>(undefined)

/**
 * Hook to access Smithers context
 *
 * Uses React's Context API, but falls back to module-level store
 * for universal renderer compatibility where context propagation
 * may not work as expected.
 */
export function useSmithers() {
  // Try React's Context first
  const ctx = useContext(SmithersContext)
  if (ctx) {
    return ctx
  }

  // Fall back to global store for universal renderer
  if (globalSmithersContext) {
    return globalSmithersContext
  }

  throw new Error('useSmithers must be used within SmithersProvider')
}

// ============================================================================
// PROVIDER
// ============================================================================

export interface SmithersProviderProps {
  /**
   * Database instance
   */
  db: SmithersDB

  /**
   * Execution ID from db.execution.start()
   */
  executionId: string

  /**
   * Optional configuration
   */
  config?: SmithersConfig

  /**
   * Maximum number of Ralph iterations (default: 100)
   */
  maxIterations?: number

  /**
   * Callback fired on each Ralph iteration
   */
  onIteration?: (iteration: number) => void

  /**
   * Callback fired when orchestration completes
   */
  onComplete?: () => void

  /**
   * Children components
   */
  children: ReactNode
}

/**
 * SmithersProvider - Unified root context provider
 *
 * Consolidates SmithersProvider, RalphContext, and DatabaseProvider into one.
 * Task tracking is now fully database-backed via the tasks table.
 *
 * Usage:
 * ```tsx
 * const db = await createSmithersDB({ path: '.smithers/data' })
 * const executionId = await db.execution.start('My Orchestration', './main.tsx')
 *
 * <SmithersProvider db={db} executionId={executionId} maxIterations={10}>
 *   <Orchestration>
 *     <Claude>Do something</Claude>
 *   </Orchestration>
 * </SmithersProvider>
 * ```
 */
export function SmithersProvider(props: SmithersProviderProps): ReactNode {
  const maxIterations = props.maxIterations ?? props.config?.maxIterations ?? 100
  const reactiveDb = props.db.db

  // Read stop/rebase signals from database reactively
  const { data: stopRequested } = useQueryValue<boolean>(
    reactiveDb,
    "SELECT CASE WHEN value IS NOT NULL THEN 1 ELSE 0 END as requested FROM state WHERE key = 'stop_requested'"
  )

  const { data: rebaseRequested } = useQueryValue<boolean>(
    reactiveDb,
    "SELECT CASE WHEN value IS NOT NULL THEN 1 ELSE 0 END as requested FROM state WHERE key = 'rebase_requested'"
  )

  // Read ralphCount from database reactively
  const { data: dbRalphCount } = useQueryValue<number>(
    reactiveDb,
    "SELECT CAST(value AS INTEGER) as count FROM state WHERE key = 'ralphCount'"
  )

  // Use DB value if available, otherwise default to 0
  const ralphCount = dbRalphCount ?? 0

  // Read running task count from database reactively
  const { data: runningTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ? AND status = 'running'`,
    [props.executionId, ralphCount]
  )

  // Read total task count for this iteration (to know if tasks have started)
  const { data: totalTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND iteration = ?`,
    [props.executionId, ralphCount]
  )

  // Derive state from DB queries
  const pendingTasks = runningTaskCount ?? 0
  const hasStartedTasks = (totalTaskCount ?? 0) > 0

  // Track if we've already completed to avoid double-completion
  const hasCompletedRef = useRef(false)

  // Initialize ralphCount in DB if needed
  useMount(() => {
    if (dbRalphCount === null) {
      reactiveDb.run(
        "INSERT OR IGNORE INTO state (key, value, updated_at) VALUES ('ralphCount', '0', datetime('now'))"
      )
    }
  })

  // Increment ralphCount in DB
  const incrementRalphCount = useMemo(() => () => {
    const nextCount = ralphCount + 1
    reactiveDb.run(
      "UPDATE state SET value = ?, updated_at = datetime('now') WHERE key = 'ralphCount'",
      [String(nextCount)]
    )
    return nextCount
  }, [reactiveDb, ralphCount])

  // Deprecated no-op functions for backwards compatibility
  const registerTask = useMemo(() => () => {
    console.warn('[SmithersProvider] registerTask is deprecated. Use db.tasks.start() instead.')
  }, [])

  const completeTask = useMemo(() => () => {
    console.warn('[SmithersProvider] completeTask is deprecated. Use db.tasks.complete() instead.')
  }, [])

  // Capture render frame on each Ralph iteration
  useCaptureRenderFrame(props.db, ralphCount)

  // Ralph iteration monitoring effect - now uses DB-backed state
  useEffect(() => {
    console.log('[SmithersProvider] Ralph effect fired! ralphCount:', ralphCount, 'pendingTasks:', pendingTasks, 'hasStartedTasks:', hasStartedTasks)

    let checkInterval: NodeJS.Timeout | null = null
    let stableCount = 0 // Count consecutive stable checks (no tasks running)

    checkInterval = setInterval(() => {
      // Re-check values from database (reactive queries will have updated)
      const currentPendingTasks = pendingTasks
      const currentHasStartedTasks = hasStartedTasks

      // If tasks are running, reset stable counter
      if (currentPendingTasks > 0) {
        stableCount = 0
        return
      }

      // If no tasks have ever started and we've waited a bit, complete
      if (!currentHasStartedTasks) {
        stableCount++
        // Wait 500ms (50 checks) before declaring no work to do
        if (stableCount > 50 && !hasCompletedRef.current) {
          hasCompletedRef.current = true
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
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true
          if (checkInterval) clearInterval(checkInterval)
          signalOrchestrationComplete()
          props.onComplete?.()
        }
        return
      }

      // Trigger next iteration by incrementing ralphCount
      const nextIteration = incrementRalphCount()
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

  const value: SmithersContextValue = useMemo(() => ({
    db: props.db,
    executionId: props.executionId,
    config: props.config ?? {},

    requestStop: (reason: string) => {
      props.db.state.set('stop_requested', {
        reason,
        timestamp: Date.now(),
        executionId: props.executionId,
      })
      console.log(`[Smithers] Stop requested: ${reason}`)
    },

    requestRebase: (reason: string) => {
      props.db.state.set('rebase_requested', {
        reason,
        timestamp: Date.now(),
        executionId: props.executionId,
      })
      console.log(`[Smithers] Rebase requested: ${reason}`)
    },

    isStopRequested: () => !!stopRequested,
    isRebaseRequested: () => !!rebaseRequested,

    // Ralph fields (registerTask/completeTask are deprecated no-ops)
    registerTask,
    completeTask,
    ralphCount,
    reactiveDb,
  }), [props.db, props.executionId, props.config, stopRequested, rebaseRequested, registerTask, completeTask, ralphCount, reactiveDb])

  // Set global store BEFORE any children are evaluated
  // This is critical for universal renderer compatibility where
  // React's Context API may not propagate properly
  globalSmithersContext = value

  return (
    <SmithersContext.Provider value={value}>
      <DatabaseProvider db={reactiveDb}>
        <PhaseRegistryProvider>
          {props.children}
        </PhaseRegistryProvider>
      </DatabaseProvider>
    </SmithersContext.Provider>
  )
}

/**
 * Hook for backwards-compatible Ralph context access
 * Returns the same interface as the original RalphContext
 * @deprecated Use useSmithers() and db.tasks instead
 */
export function useRalph(): RalphContextType {
  const ctx = useSmithers()
  return {
    registerTask: ctx.registerTask,
    completeTask: ctx.completeTask,
    ralphCount: ctx.ralphCount,
    db: ctx.reactiveDb,
  }
}
