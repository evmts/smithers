import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import type { SmithersDB } from '../db/index.js'
import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import { DatabaseProvider } from '../reactive-sqlite/hooks/context.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { PhaseRegistryProvider } from './PhaseRegistry.js'
import { useMount, useUnmount } from '../reconciler/hooks.js'
import { useCaptureRenderFrame } from '../hooks/useCaptureRenderFrame.js'
import { jjSnapshot } from '../utils/vcs.js'
import type { SmithersMiddleware } from '../middleware/types.js'
import {
  OrchestrationTokenContext,
  signalOrchestrationCompleteByToken,
} from './OrchestrationController.js'
import {
  type GlobalStopCondition,
  type OrchestrationContext,
  STOP_EVALUATORS,
} from './StopConditionEvaluator.js'
import { useTaskCompletionTracker } from './TaskCompletionTracker.js'

export {
  createOrchestrationPromise,
  signalOrchestrationCompleteByToken,
  signalOrchestrationErrorByToken,
  useOrchestrationToken,
} from './OrchestrationController.js'

export type {
  GlobalStopCondition,
  OrchestrationContext,
  OrchestrationResult,
} from './StopConditionEvaluator.js'

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
  const hasCompletedRef = useRef(false)

  const { data: stopRequested } = useQueryValue<boolean>(
    reactiveDb,
    "SELECT CASE WHEN value IS NOT NULL THEN 1 ELSE 0 END as requested FROM state WHERE key = 'stop_requested'"
  )

  const { data: rebaseRequested } = useQueryValue<boolean>(
    reactiveDb,
    "SELECT CASE WHEN value IS NOT NULL THEN 1 ELSE 0 END as requested FROM state WHERE key = 'rebase_requested'"
  )

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

  const handleComplete = useMemo(() => () => {
    if (hasCompletedRef.current) return
    hasCompletedRef.current = true
    signalComplete()
    props.onComplete?.()
  }, [signalComplete, props.onComplete])

  useTaskCompletionTracker(reactiveDb, props.executionId, {
    onComplete: handleComplete,
    checkStopConditions,
  })

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
