import { useRef } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useExecutionScope } from '../ExecutionScope.js'
import { useMountedState, useExecutionMount } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'
import { makeStateKey } from '../../utils/scope.js'

export interface UseJJOperationOptions<TState> {
  id?: string
  operationType: string
  defaultState: TState
  execute: (context: JJOperationContext<TState>) => Promise<void>
  deps?: unknown[]
}

export interface JJOperationContext<TState> {
  smithers: ReturnType<typeof useSmithers>
  executionScope: ReturnType<typeof useExecutionScope>
  setState: (newState: TState) => void
  isMounted: () => boolean
}

export function useJJOperation<TState extends { status: string }>(
  options: UseJJOperationOptions<TState>
) {
  const smithers = useSmithers()
  const executionScope = useExecutionScope()
  const opIdRef = useRef(options.id ?? crypto.randomUUID())
  const stateKey = makeStateKey(
    smithers.executionId ?? 'execution',
    options.operationType,
    opIdRef.current
  )

  const { data: opState } = useQueryValue<string>(
    smithers.db.db,
    'SELECT value FROM state WHERE key = ?',
    [stateKey]
  )

  const state: TState = (() => {
    if (!opState) return options.defaultState
    try {
      return JSON.parse(opState) as TState
    } catch {
      return options.defaultState
    }
  })()

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()
  const shouldExecute = smithers.executionEnabled && executionScope.enabled

  const setState = (newState: TState) => {
    smithers.db.state.set(stateKey, newState, options.operationType)
  }

  useExecutionMount(
    shouldExecute,
    () => {
      ;(async () => {
        if (state.status !== 'pending') return
        taskIdRef.current = smithers.db.tasks.start(options.operationType, undefined, {
          scopeId: executionScope.scopeId,
        })

        try {
          await options.execute({
            smithers,
            executionScope,
            setState,
            isMounted,
          })
        } finally {
          if (taskIdRef.current) {
            smithers.db.tasks.complete(taskIdRef.current)
          }
        }
      })()
    },
    [state.status, shouldExecute, ...(options.deps ?? [])]
  )

  return { state, setState, smithers, executionScope, isMounted }
}
