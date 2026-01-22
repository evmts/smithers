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

const orchestrationControllers = new Map<string, OrchestrationController>()

const OrchestrationTokenContext = createContext<string | null>(null)

export function createOrchestrationPromise(): { promise: Promise<void>; token: string } {
  const token = crypto.randomUUID()
  const promise = new Promise<void>((resolve, reject) => {
    orchestrationControllers.set(token, { resolve, reject })
  })
  return { promise, token }
}

export function signalOrchestrationCompleteByToken(token: string): void {
  const controller = orchestrationControllers.get(token)
  if (controller) {
    controller.resolve()
    orchestrationControllers.delete(token)
  }
}

export function signalOrchestrationErrorByToken(token: string, err: Error): void {
  const controller = orchestrationControllers.get(token)
  if (controller) {
    controller.reject(err)
    orchestrationControllers.delete(token)
  }
}

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
  maxIterations?: number
  defaultModel?: string
  globalTimeout?: number
  verbose?: boolean
  extra?: Record<string, unknown>
}

export interface SmithersContextValue {
  db: SmithersDB
  executionId: string
  config: SmithersConfig
  middleware?: SmithersMiddleware[]
  requestStop: (reason: string) => void
  requestRebase: (reason: string) => void
  isStopRequested: () => boolean
  isRebaseRequested: () => boolean
  reactiveDb: ReactiveDatabase
  executionEnabled: boolean
}

const SmithersContext = createContext<SmithersContextValue | undefined>(undefined)

export function useSmithers() {
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
  db: SmithersDB
  executionId: string
  config?: SmithersConfig
  getTreeXML?: () => string | null
  middleware?: SmithersMiddleware[]
  onComplete?: () => void
  globalTimeout?: number
  stopConditions?: GlobalStopCondition[]
  snapshotBeforeStart?: boolean
  onError?: (error: Error) => void
  onStopRequested?: (reason: string) => void
  cleanupOnComplete?: boolean
  orchestrationToken?: string
  children: ReactNode
}

export function SmithersProvider(props: SmithersProviderProps): ReactNode {
  const reactiveDb = props.db.db

  const startTimeRef = useRef(Date.now())
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: stopRequested } = useQueryValue<boolean>(
    reactiveDb,
    "SELECT CASE WHEN value IS NOT NULL THEN 1 ELSE 0 END as requested FROM state WHERE key = 'stop_requested'"
  )

  const { data: rebaseRequested } = useQueryValue<boolean>(
    reactiveDb,
    "SELECT CASE WHEN value IS NOT NULL THEN 1 ELSE 0 END as requested FROM state WHERE key = 'rebase_requested'"
  )

  const { data: runningTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ? AND status = 'running'`,
    [props.executionId]
  )

  const { data: totalTaskCount } = useQueryValue<number>(
    reactiveDb,
    `SELECT COUNT(*) as count FROM tasks WHERE execution_id = ?`,
    [props.executionId]
  )

  const pendingTasks = runningTaskCount ?? 0
  const hasStartedTasks = (totalTaskCount ?? 0) > 0

  const hasCompletedRef = useRef(false)
  const hasStartedTasksRef = useRef(false)
  const completionCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const orchestrationToken = props.orchestrationToken ?? null

  const signalComplete = useMemo(() => () => {
    if (orchestrationToken) {
      signalOrchestrationCompleteByToken(orchestrationToken)
    }
  }, [orchestrationToken])

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

  useMount(() => {
    ;(async () => {
      try {
        if (props.snapshotBeforeStart) {
          try {
            const { changeId, description } = await jjSnapshot('Before orchestration start')
            await props.db.vcs.logSnapshot({
              change_id: changeId,
              description,
            })
            console.log(`[SmithersProvider] Created initial snapshot: ${changeId}`)
          } catch (error) {
            console.warn('[SmithersProvider] Could not create JJ snapshot:', error)
          }
        }

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
      } catch (error) {
        console.error('[SmithersProvider] Setup error:', error)
        props.onError?.(error as Error)
      }
    })()
  })

  useCaptureRenderFrame(props.db, 0, props.getTreeXML)

  if (hasStartedTasks && !hasStartedTasksRef.current) {
    hasStartedTasksRef.current = true
  }

  useEffectOnValueChange(pendingTasks, () => {
    if (completionCheckTimeoutRef.current) {
      clearTimeout(completionCheckTimeoutRef.current)
      completionCheckTimeoutRef.current = null
    }

    checkStopConditions()

    if (pendingTasks > 0) return

    if (!hasStartedTasksRef.current) {
      completionCheckTimeoutRef.current = setTimeout(() => {
        if (!hasCompletedRef.current && !hasStartedTasksRef.current) {
          hasCompletedRef.current = true
          signalComplete()
          props.onComplete?.()
        }
      }, 500)
      return
    }

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

  useUnmount(() => {
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
    if (completionCheckTimeoutRef.current) clearTimeout(completionCheckTimeoutRef.current)

    ;(async () => {
      try {
        const execution = await props.db.execution.current()
        if (execution && !hasCompletedRef.current) {
          hasCompletedRef.current = true
          props.onComplete?.()
        }

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


