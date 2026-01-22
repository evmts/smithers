import type { ReactNode } from 'react'
import { useRef, useMemo, createContext, useContext } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useMount } from '../reconciler/hooks.js'
import { useQueryValue } from '../reactive-sqlite/hooks/useQueryValue.js'

export const DEFAULT_MAX_ITERATIONS = 10

interface WhileProps {
  id: string
  condition: () => boolean | Promise<boolean>
  maxIterations?: number
  children: ReactNode
  onIteration?: (iteration: number) => void
  onComplete?: (iterations: number, reason: 'condition' | 'max') => void
}

interface WhileIterationContextValue {
  iteration: number
  signalComplete: () => void
  whileId: string
}

const WhileIterationContext = createContext<WhileIterationContextValue | null>(null)

export function useWhileIteration() {
  return useContext(WhileIterationContext)
}

export function useRequireRalph(componentName: string): WhileIterationContextValue {
  const ctx = useContext(WhileIterationContext)
  if (!ctx) {
    throw new Error(
      `<${componentName}> must be used inside a <Ralph> or <While> loop. ` +
      `Phased workflows require iteration to advance through phases. ` +
      `Wrap your workflow with <Ralph id="..." condition={() => true} maxIterations={10}>.`
    )
  }
  return ctx
}

export function useRalphContext(): WhileIterationContextValue | null {
  return useContext(WhileIterationContext)
}

export function While(props: WhileProps): ReactNode {
  const { db, config } = useSmithers()
  const { id: whileId, maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS } = props
  const hasInitializedRef = useRef(false)
  
  const iterationKey = `while.${whileId}.iteration`
  const statusKey = `while.${whileId}.status`
  
  const { data: iteration } = useQueryValue<number>(
    db.db,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = ?",
    [iterationKey]
  )
  const iterationValue = iteration ?? 0
  
  const { data: status } = useQueryValue<string>(
    db.db,
    "SELECT json_extract(value, '$') as v FROM state WHERE key = ?",
    [statusKey]
  )
  const statusValue = status ?? 'pending'

  useMount(() => {
    if (hasInitializedRef.current) return
    hasInitializedRef.current = true

    ;(async () => {
      const taskId = db.tasks.start('while_init', whileId)
      try {
        if (db.state.get(statusKey) === null) {
          const conditionResult = await props.condition()

          if (conditionResult && iterationValue < maxIterations) {
            db.state.set(iterationKey, 0, 'while_init')
            db.state.set(statusKey, 'running', 'while_start')
            db.state.set('ralphCount', 0, 'while_init_ralph')
            props.onIteration?.(0)
          } else {
            db.state.set(statusKey, 'complete', 'while_condition_false')
            props.onComplete?.(0, 'condition')
          }
        } else if (db.state.get(statusKey) === 'running') {
          const currentIteration = db.state.get<number>(iterationKey) ?? 0
          db.state.set('ralphCount', currentIteration, 'while_resume_ralph')
        }
      } finally {
        db.tasks.complete(taskId)
      }
    })()
  })

  const handleIterationComplete = async () => {
    const taskId = db.tasks.start('while_condition', `${whileId}:${iterationValue}`)
    try {
      const nextIteration = iterationValue + 1
      
      if (nextIteration >= maxIterations) {
        db.state.set(statusKey, 'complete', 'while_max')
        props.onComplete?.(nextIteration, 'max')
        return
      }

      const conditionResult = await props.condition()
      if (!conditionResult) {
        db.state.set(statusKey, 'complete', 'while_condition')
        props.onComplete?.(nextIteration, 'condition')
        return
      }

      db.state.set(iterationKey, nextIteration, 'while_advance')
      db.state.set('ralphCount', nextIteration, 'while_advance_ralph')
      props.onIteration?.(nextIteration)
    } finally {
      db.tasks.complete(taskId)
    }
  }

  const contextValue = useMemo((): WhileIterationContextValue => ({
    iteration: iterationValue,
    signalComplete: handleIterationComplete,
    whileId,
  }), [iterationValue, whileId])

  const isRunning = statusValue === 'running'

  return (
    <while id={whileId} iteration={iterationValue} status={statusValue} maxIterations={maxIterations}>
      {isRunning && (
        <WhileIterationContext.Provider value={contextValue}>
          {props.children}
        </WhileIterationContext.Provider>
      )}
    </while>
  )
}

export type { WhileProps, WhileIterationContextValue }
