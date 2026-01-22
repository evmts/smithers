import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import type { SmithersDB } from '../db/index.js'
import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { DatabaseProvider } from '../reactive-sqlite/hooks/context.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { PhaseRegistryProvider } from './PhaseRegistry.js'
import { useMount, useUnmount, useEffectOnValueChange } from '../reconciler/hooks.js'
import { useCaptureRenderFrame } from '../hooks/useCaptureRenderFrame.js'
import { jjSnapshot } from '../utils/vcs.js'
import { makeStateKey } from '../utils/scope.js'
import type { SmithersMiddleware } from '../middleware/types.js'

type OrchestrationController = {
  resolve: () => void
  reject: (err: Error) => void
}

// Tokenized map for per-root orchestration - concurrency-safe
const orchestrationControllers = new Map<string, OrchestrationController>()

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
  })
  return { promise, token }
}



/**
 * Signal completion for a specific orchestration token.
 * Used by reconciler root.ts for direct control.
 */
export function signalOrchestrationCompleteByToken(token: string): void {
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

// Table-driven stop condition evaluators
type StopEvaluatorContext = {
  ctx: OrchestrationContext
  condition: GlobalStopCondition
  db: import('../db/index.js').SmithersDB
  executionId: string
}

type StopEvaluatorResult = { shouldStop: boolean; message: string }

const STOP_EVALUATORS: Record<GlobalStopCondition['type'], (args: StopEvaluatorContext) => Promise<StopEvaluatorResult>> = {
  total_tokens: async ({ ctx, condition }) => ({
    shouldStop: typeof condition.value === 'number' && ctx.totalTokens >= condition.value,
    message: condition.message ?? `Token limit ${condition.value} exceeded`,
  }),
  total_agents: async ({ ctx, condition }) => ({
    shouldStop: typeof condition.value === 'number' && ctx.totalAgents >= condition.value,
    message: condition.message ?? `Agent limit ${condition.value} exceeded`,
  }),
  total_time: async ({ ctx, condition }) => ({
    shouldStop: typeof condition.value === 'number' && ctx.elapsedTimeMs >= condition.value,
    message: condition.message ?? `Time limit ${condition.value}ms exceeded`,
  }),
  report_severity: async ({ db, condition }) => {
    const criticalReports = await db.vcs.getCriticalReports()
    return {
      shouldStop: criticalReports.length > 0,
      message: condition.message ?? `Critical report(s) found: ${criticalReports.length}`,
    }
  },
  ci_failure: async ({ db, executionId, condition }) => {
    const ciFailureKey = makeStateKey(executionId, 'hook', 'lastCIFailure')
    const ciFailure =
      await db.state.get<{ message?: string }>(ciFailureKey) ??
      await db.state.get<{ message?: string }>('last_ci_failure')
    return {
      shouldStop: ciFailure !== null,
      message: condition.message ?? `CI failure detected: ${ciFailure?.message ?? 'unknown'}`,
    }
  },
  custom: async ({ ctx, condition }) => ({
    shouldStop: condition.fn ? await condition.fn(ctx) : false,
    message: condition.message ?? 'Custom stop condition met',
  }),
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

  /**
   * Raw ReactiveDatabase instance (for useQuery hooks)
   */
  reactiveDb: ReactiveDatabase

  /**
   * Whether execution is enabled for this subtree
   */
  executionEnabled: boolean
}

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

export function SmithersProvider(props: SmithersProviderProps): ReactNode {
  const reactiveDb = props.db.db

  // Orchestration refs for timers and start time
  const startTimeRef = useRef(Date.now())
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Read stop/rebase signals from database reactively
  const { data: stopRequested } = useQueryValue<boolean>(
    reactiveDb,
    "SELECT CASE WHEN value IS NOT NULL THEN 1 ELSE 0 END as requested FROM state WHERE key = 'stop_requested'"
  )

  const { data: rebaseRequested } = useQueryValue<boolean>(
    reactiveDb,
    "SELECT CASE WHEN value IS NOT NULL THEN 1 ELSE 0 END as requested FROM state WHERE key = 'rebase_requested'"
  )

  // Read running task count from database reactively (for completion detection)
  const { data: runningTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND status = 'running'`,
    [props.executionId]
  )

  // Read total task count (to know if tasks have started)
  const { data: totalTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ?`,
    [props.executionId]
  )

  // Derive state from DB queries
  const pendingTasks = runningTaskCount ?? 0
  const hasStartedTasks = (totalTaskCount ?? 0) > 0

  // Track if we've already completed to avoid double-completion
  const hasCompletedRef = useRef(false)
  const hasStartedTasksRef = useRef(false)
  const completionCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get orchestration token from props for signaling completion
  const orchestrationToken = props.orchestrationToken ?? null

  // Helper to signal completion using the token
  const signalComplete = useMemo(() => () => {
    if (orchestrationToken) {
      signalOrchestrationCompleteByToken(orchestrationToken)
    }
  }, [orchestrationToken])

  // Helper to check stop conditions (called on task completion)
  const checkStopConditions = useMemo(() => async () => {
    if (!props.stopConditions?.length) return
    const currentStopRequested = props.db.state.get('stop_requested')
    if (currentStopRequested) return

    const execution = await props.db.execution.current()
    if (!execution) return

    const ctx: OrchestrationContext = {
      executionId: props.executionId,
      totalTokens: execution.total_tokens_used,
      totalAgents: execution.total_agents,
      totalToolCalls: execution.total_tool_calls,
      elapsedTimeMs: Date.now() - startTimeRef.current,
    }

    for (const condition of props.stopConditions) {
      const result = await STOP_EVALUATORS[condition.type]({
        ctx,
        condition,
        db: props.db,
        executionId: props.executionId,
      })
      if (result.shouldStop) {
        console.log(`[SmithersProvider] Stop condition met: ${result.message}`)
        props.db.state.set('stop_requested', {
          reason: result.message,
          timestamp: Date.now(),
          executionId: props.executionId,
        })
        props.onStopRequested?.(result.message)
        break
      }
    }
  }, [props.stopConditions, props.db, props.executionId, props.onStopRequested])

  // Orchestration setup (timeout, snapshots)
  useMount(() => {
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

        // Stop conditions are now checked reactively on task completion (see checkStopConditions)
      } catch (error) {
        console.error('[SmithersProvider] Setup error:', error)
        props.onError?.(error as Error)
      }
    })()
  })

  // Capture render frame (iteration 0 for single-run)
  useCaptureRenderFrame(props.db, 0, props.getTreeXML)

  // Track when tasks start
  if (hasStartedTasks && !hasStartedTasksRef.current) {
    hasStartedTasksRef.current = true
  }

  // React to task count changes for completion detection
  useEffectOnValueChange(pendingTasks, () => {
    // Clear any pending completion check
    if (completionCheckTimeoutRef.current) {
      clearTimeout(completionCheckTimeoutRef.current)
      completionCheckTimeoutRef.current = null
    }

    // Check stop conditions on task completion
    checkStopConditions()

    // If tasks are running, wait for them to complete
    if (pendingTasks > 0) return

    // Simple rule: complete when pendingTasks === 0 && hasStartedTasksRef.current
    if (!hasStartedTasksRef.current) {
      // Wait a bit for tasks to start (render settling)
      completionCheckTimeoutRef.current = setTimeout(() => {
        if (!hasCompletedRef.current && !hasStartedTasksRef.current) {
          hasCompletedRef.current = true
          signalComplete()
          props.onComplete?.()
        }
      }, 500)
      return
    }

    // All tasks have completed - small debounce for render settling
    completionCheckTimeoutRef.current = setTimeout(() => {
      if (reactiveDb.isClosed || hasCompletedRef.current) return
      hasCompletedRef.current = true
      signalComplete()
      props.onComplete?.()
    }, 50)
  }, [hasStartedTasks, props, reactiveDb, signalComplete, checkStopConditions])

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

    reactiveDb,
    executionEnabled: true,
  }), [props.db, props.executionId, props.config, props.middleware, stopRequested, rebaseRequested, reactiveDb])

  // Cleanup orchestration on unmount
  useUnmount(() => {
    // Clear timers
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
    if (completionCheckTimeoutRef.current) clearTimeout(completionCheckTimeoutRef.current)

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


