// SmithersProvider - Unified context provider for Smithers orchestration
// Consolidates SmithersProvider, RalphContext, and DatabaseProvider into one
// Gives all child components access to database, executionId, Ralph loop, and global controls

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import type { SmithersDB } from '../db/index.js'
import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { DatabaseProvider } from '../reactive-sqlite/hooks/context.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { PhaseRegistryProvider } from './PhaseRegistry.js'
import { useMount, useUnmount, useEffectOnValueChange } from '../reconciler/hooks.js'
import { useCaptureRenderFrame } from '../hooks/useCaptureRenderFrame.js'
import { jjSnapshot } from '../utils/vcs.js'
import type { SmithersMiddleware } from '../middleware/types.js'

// ============================================================================
// ORCHESTRATION COMPLETION SIGNALS (per-root via token)
// ============================================================================

type OrchestrationController = {
  resolve: () => void
  reject: (err: Error) => void
}

// Tokenized map for per-root orchestration - concurrency-safe
const orchestrationControllers = new Map<string, OrchestrationController>()

// Cleanup stale entries after 1 hour (prevents memory leak if orchestration errors without cleanup)
const ORCHESTRATION_CLEANUP_TIMEOUT_MS = 3600000

// Track cleanup timeouts for each token
const cleanupTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleOrchestrationCleanup(token: string): void {
  const timeoutId = setTimeout(() => {
    orchestrationControllers.delete(token)
    cleanupTimeouts.delete(token)
  }, ORCHESTRATION_CLEANUP_TIMEOUT_MS)
  cleanupTimeouts.set(token, timeoutId)
}

function cancelOrchestrationCleanup(token: string): void {
  const timeoutId = cleanupTimeouts.get(token)
  if (timeoutId) {
    clearTimeout(timeoutId)
    cleanupTimeouts.delete(token)
  }
}

// Context for per-provider orchestration token (replaces global _activeOrchestrationToken)
const OrchestrationTokenContext = createContext<string | null>(null)

/**
 * Create a promise that resolves when orchestration completes.
 * Returns a token that can be used to signal completion.
 * Called by createSmithersRoot before mounting.
 */
export function createOrchestrationPromise(): { promise: Promise<void>; token: string } {
  const token = crypto.randomUUID()
  const promise = new Promise<void>((resolve, reject) => {
    orchestrationControllers.set(token, { resolve, reject })
    scheduleOrchestrationCleanup(token)
  })
  return { promise, token }
}



/**
 * Signal completion for a specific orchestration token.
 * Used by reconciler root.ts for direct control.
 */
export function signalOrchestrationCompleteByToken(token: string): void {
  cancelOrchestrationCleanup(token)
  const controller = orchestrationControllers.get(token)
  if (controller) {
    controller.resolve()
    orchestrationControllers.delete(token)
  }
}

/**
 * Signal error for a specific orchestration token.
 * Used by reconciler root.ts for direct control.
 */
export function signalOrchestrationErrorByToken(token: string, err: Error): void {
  cancelOrchestrationCleanup(token)
  const controller = orchestrationControllers.get(token)
  if (controller) {
    controller.reject(err)
    orchestrationControllers.delete(token)
  }
}

/**
 * Hook to get the current orchestration token from context.
 * Returns null if not within a SmithersProvider.
 */
export function useOrchestrationToken(): string | null {
  return useContext(OrchestrationTokenContext)
}

/**
 * Signal that orchestration is complete.
 * Use within a SmithersProvider context - reads token from context.
 * @deprecated Use signalOrchestrationCompleteByToken with an explicit token for concurrency safety.
 */
export function signalOrchestrationComplete(): void {
  console.warn('[SmithersProvider] signalOrchestrationComplete() without token is deprecated. Use signalOrchestrationCompleteByToken(token) for concurrency safety.')
}

/**
 * Signal that orchestration failed.
 * @deprecated Use signalOrchestrationErrorByToken with an explicit token for concurrency safety.
 */
export function signalOrchestrationError(err: Error): void {
  console.warn('[SmithersProvider] signalOrchestrationError() without token is deprecated. Use signalOrchestrationErrorByToken(token, err) for concurrency safety.')
  void err
}

/**
 * Set the active orchestration token.
 * @deprecated No longer needed - tokens are managed via React context.
 */
export function setActiveOrchestrationToken(_token: string | null): void {
  // No-op for backwards compatibility - token is now stored in React context
}

// ============================================================================
// TYPES
// ============================================================================

export interface GlobalStopCondition {
  type: 'total_tokens' | 'total_agents' | 'total_time' | 'report_severity' | 'ci_failure' | 'custom'
  value?: number | string
  fn?: (context: OrchestrationContext) => boolean | Promise<boolean>
  message?: string
}

export interface OrchestrationContext {
  executionId: string
  totalTokens: number
  totalAgents: number
  totalToolCalls: number
  elapsedTimeMs: number
}

export interface OrchestrationResult {
  executionId: string
  status: 'completed' | 'stopped' | 'failed' | 'cancelled'
  totalAgents: number
  totalToolCalls: number
  totalTokens: number
  durationMs: number
}

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
   * Additional configuration for extensibility
   */
  extra?: Record<string, unknown>
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
   * Global middleware applied to all Claude executions.
   */
  middleware?: SmithersMiddleware[]

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

  /**
   * Whether execution is enabled for this subtree
   */
  executionEnabled: boolean
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

  throw new Error('useSmithers must be used within SmithersProvider')
}

export interface ExecutionBoundaryProps {
  enabled: boolean
  children: ReactNode
}

export function ExecutionBoundary(props: ExecutionBoundaryProps): ReactNode {
  const parent = useSmithers()

  const scopedValue = useMemo(() => ({
    ...parent,
    executionEnabled: parent.executionEnabled && props.enabled,
  }), [parent, props.enabled])

  return (
    <SmithersContext.Provider value={scopedValue}>
      {props.children}
    </SmithersContext.Provider>
  )
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
   * Optional tree serialization callback for frame capture.
   * Prefer passing root.toXML() from createSmithersRoot().
   */
  getTreeXML?: () => string | null

  /**
   * Global middleware applied to all Claude executions.
   */
  middleware?: SmithersMiddleware[]

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
   * Global timeout in milliseconds
   */
  globalTimeout?: number

  /**
   * Global stop conditions
   */
  stopConditions?: GlobalStopCondition[]

  /**
   * Create JJ snapshot before starting
   */
  snapshotBeforeStart?: boolean

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void

  /**
   * Callback when stop is requested
   */
  onStopRequested?: (reason: string) => void

  /**
   * Cleanup on complete (close DB, etc.)
   */
  cleanupOnComplete?: boolean

  /**
   * Explicitly stop the Ralph loop when true.
   * Use this to control orchestration flow declaratively.
   */
  stopped?: boolean

  /**
   * Orchestration token for signaling completion.
   * Created by createOrchestrationPromise() in root.ts.
   * Required for concurrency-safe multi-root execution.
   */
  orchestrationToken?: string

  /**
   * Children components
   */
  children: ReactNode
}

/**
 * SmithersProvider - Unified root context provider
 *
 * Consolidates SmithersProvider, RalphContext, DatabaseProvider, and Orchestration into one.
 * Task tracking is fully database-backed via the tasks table.
 * Provides global timeouts, stop conditions, VCS snapshots, and cleanup.
 *
 * Usage:
 * ```tsx
 * const db = await createSmithersDB({ path: '.smithers/data' })
 * const executionId = await db.execution.start('My Orchestration', './main.tsx')
 *
 * <SmithersProvider
 *   db={db}
 *   executionId={executionId}
 *   maxIterations={10}
 *   globalTimeout={3600000}
 *   stopConditions={[
 *     { type: 'total_tokens', value: 500000, message: 'Token budget exceeded' }
 *   ]}
 *   snapshotBeforeStart
 * >
 *   <Claude>Do something</Claude>
 * </SmithersProvider>
 * ```
 */
export function SmithersProvider(props: SmithersProviderProps): ReactNode {
  const maxIterations = props.maxIterations ?? props.config?.maxIterations ?? 100
  const reactiveDb = props.db.db

  // Orchestration refs for timers and start time
  const startTimeRef = useRef(Date.now())
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const checkIntervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
  
  // Track stable state for debouncing completion checks
  const stableCountRef = useRef(0)
  const completionCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get orchestration token from props for signaling completion
  const orchestrationToken = props.orchestrationToken ?? null

  // Helper to signal completion using the token
  const signalComplete = useMemo(() => () => {
    if (orchestrationToken) {
      signalOrchestrationCompleteByToken(orchestrationToken)
    }
  }, [orchestrationToken])

  // Initialize ralphCount in DB if needed
  useMount(() => {
    if (dbRalphCount == null && !reactiveDb.isClosed) {
      reactiveDb.run(
        "INSERT OR IGNORE INTO state (key, value, updated_at) VALUES ('ralphCount', '0', datetime('now'))"
      )
    }
  })

  // Orchestration setup (timeout, snapshots, stop conditions)
  useMount(() => {
    const startTime = startTimeRef.current

    ;(async () => {
      try {
        // Create snapshot if requested
        if (props.snapshotBeforeStart) {
          try {
            const { changeId, description } = await jjSnapshot('Before orchestration start')
            await props.db.vcs.logSnapshot({
              change_id: changeId,
              description,
            })
            console.log(`[SmithersProvider] Created initial snapshot: ${changeId}`)
          } catch (error) {
            // JJ might not be available, that's okay
            console.warn('[SmithersProvider] Could not create JJ snapshot:', error)
          }
        }

        // Set up global timeout
        if (props.globalTimeout) {
          timeoutIdRef.current = setTimeout(() => {
            const currentStopRequested = props.db.state.get('stop_requested')
            if (!currentStopRequested) {
              const message = `Global timeout of ${props.globalTimeout}ms exceeded`
              props.db.state.set('stop_requested', {
                reason: message,
                timestamp: Date.now(),
                executionId: props.executionId,
              })
              props.onStopRequested?.(message)
            }
          }, props.globalTimeout)
        }

        // Set up stop condition checking
        if (props.stopConditions && props.stopConditions.length > 0) {
          checkIntervalIdRef.current = setInterval(async () => {
            const currentStopRequested = props.db.state.get('stop_requested')
            if (currentStopRequested) {
              if (checkIntervalIdRef.current) clearInterval(checkIntervalIdRef.current)
              return
            }

            const execution = await props.db.execution.current()
            if (!execution) return

            const context: OrchestrationContext = {
              executionId: props.executionId,
              totalTokens: execution.total_tokens_used,
              totalAgents: execution.total_agents,
              totalToolCalls: execution.total_tool_calls,
              elapsedTimeMs: Date.now() - startTime,
            }

            for (const condition of props.stopConditions!) {
              let shouldStop = false
              let message = condition.message ?? 'Stop condition met'

              switch (condition.type) {
                case 'total_tokens':
                  if (typeof condition.value === 'number') {
                    shouldStop = context.totalTokens >= condition.value
                    message = message || `Token limit ${condition.value} exceeded`
                  }
                  break

                case 'total_agents':
                  if (typeof condition.value === 'number') {
                    shouldStop = context.totalAgents >= condition.value
                    message = message || `Agent limit ${condition.value} exceeded`
                  }
                  break

                case 'total_time':
                  if (typeof condition.value === 'number') {
                    shouldStop = context.elapsedTimeMs >= condition.value
                    message = message || `Time limit ${condition.value}ms exceeded`
                  }
                  break

                case 'report_severity':
                  const criticalReports = await props.db.vcs.getCriticalReports()
                  shouldStop = criticalReports.length > 0
                  message = message || `Critical report(s) found: ${criticalReports.length}`
                  break

                case 'ci_failure':
                  const ciFailure = await props.db.state.get<{ message?: string }>('last_ci_failure')
                  shouldStop = ciFailure !== null
                  message = message || `CI failure detected: ${ciFailure?.message ?? 'unknown'}`
                  break

                case 'custom':
                  if (condition.fn) {
                    shouldStop = await condition.fn(context)
                  }
                  break
              }

              if (shouldStop) {
                console.log(`[SmithersProvider] Stop condition met: ${message}`)
                props.db.state.set('stop_requested', {
                  reason: message,
                  timestamp: Date.now(),
                  executionId: props.executionId,
                })
                props.onStopRequested?.(message)

                if (checkIntervalIdRef.current) clearInterval(checkIntervalIdRef.current)
                break
              }
            }
          }, 1000) // Check every second
        }
      } catch (error) {
        console.error('[SmithersProvider] Setup error:', error)
        props.onError?.(error as Error)
      }
    })()
  })

  // Increment ralphCount in DB
  const incrementRalphCount = useMemo(() => () => {
    if (reactiveDb.isClosed) return ralphCount  // Guard against closed DB
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
  useCaptureRenderFrame(props.db, ralphCount, props.getTreeXML)

  // React to task count changes instead of polling
  useEffectOnValueChange(pendingTasks, () => {
    // Clear any pending completion check
    if (completionCheckTimeoutRef.current) {
      clearTimeout(completionCheckTimeoutRef.current)
      completionCheckTimeoutRef.current = null
    }

    // Check if explicitly stopped via prop
    if (props.stopped && !hasCompletedRef.current) {
      hasCompletedRef.current = true
      signalComplete()
      props.onComplete?.()
      return
    }

    // If tasks are running, reset stable counter
    if (pendingTasks > 0) {
      stableCountRef.current = 0
      return
    }

    // If no tasks have ever started, wait a bit then complete
    if (!hasStartedTasks) {
      stableCountRef.current++
      // Debounce - wait 500ms before declaring no work
      completionCheckTimeoutRef.current = setTimeout(() => {
        if (!hasCompletedRef.current && stableCountRef.current > 0) {
          hasCompletedRef.current = true
          signalComplete()
          props.onComplete?.()
        }
      }, 500)
      return
    }

    // Tasks have completed - debounce before advancing
    stableCountRef.current++
    completionCheckTimeoutRef.current = setTimeout(() => {
      if (reactiveDb.isClosed) return

      // Check if stop was requested
      if (stopRequested && !hasCompletedRef.current) {
        hasCompletedRef.current = true
        signalComplete()
        props.onComplete?.()
        return
      }

      // Check max iterations
      if (ralphCount >= maxIterations - 1) {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true
          signalComplete()
          props.onComplete?.()
        }
        return
      }

      // Trigger next iteration
      const nextIteration = incrementRalphCount()
      stableCountRef.current = 0
      props.onIteration?.(nextIteration)
    }, 100) // 100ms debounce

    // Cleanup timeout on effect re-run
    return () => {
      if (completionCheckTimeoutRef.current) {
        clearTimeout(completionCheckTimeoutRef.current)
        completionCheckTimeoutRef.current = null
      }
    }
  }, [hasStartedTasks, ralphCount, maxIterations, props, incrementRalphCount, stopRequested, reactiveDb, signalComplete])

  // Cleanup on unmount
  useUnmount(() => {
    if (completionCheckTimeoutRef.current) {
      clearTimeout(completionCheckTimeoutRef.current)
    }
  })

  const value: SmithersContextValue = useMemo(() => ({
    db: props.db,
    executionId: props.executionId,
    config: props.config ?? {},
    ...(props.middleware !== undefined ? { middleware: props.middleware } : {}),

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
    executionEnabled: true,
  }), [props.db, props.executionId, props.config, props.middleware, stopRequested, rebaseRequested, registerTask, completeTask, ralphCount, reactiveDb])

  // Cleanup orchestration on unmount
  useUnmount(() => {
    // Clear timers
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
    if (checkIntervalIdRef.current) clearInterval(checkIntervalIdRef.current)

    // Generate completion result
    ;(async () => {
      try {
        const execution = await props.db.execution.current()
        if (execution && !hasCompletedRef.current) {
          hasCompletedRef.current = true
          props.onComplete?.()
        }

        // Cleanup if requested
        if (props.cleanupOnComplete) {
          await props.db.close()
        }
      } catch (error) {
        console.error('[SmithersProvider] Cleanup error:', error)
        props.onError?.(error as Error)
      }
    })().catch((err) => {
      console.error('[SmithersProvider] Unexpected cleanup error:', err)
    })
  })

  return (
    <OrchestrationTokenContext.Provider value={orchestrationToken}>
      <SmithersContext.Provider value={value}>
        <DatabaseProvider db={reactiveDb}>
          <PhaseRegistryProvider>
            {props.children}
          </PhaseRegistryProvider>
        </DatabaseProvider>
      </SmithersContext.Provider>
    </OrchestrationTokenContext.Provider>
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
