import type { ReactNode } from 'react'
import { useRef, useMemo, createContext, useContext } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useMount } from '../reconciler/hooks.js'
import { useQueryValue } from '../reactive-sqlite/hooks/useQueryValue.js'

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
}

const WhileIterationContext = createContext<WhileIterationContextValue | null>(null)

export function useWhileIteration() {
  return useContext(WhileIterationContext)
}

export function While(props: WhileProps): ReactNode {
  const { db } = useSmithers()
  const { id: whileId, maxIterations = 10 } = props
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
      if (db.state.get(statusKey) === null) {
        const conditionResult = await props.condition()
        
        if (conditionResult && iterationValue < maxIterations) {
          db.state.set(iterationKey, 0, 'while_init')
          db.state.set(statusKey, 'running', 'while_start')
          props.onIteration?.(0)
        } else {
          db.state.set(statusKey, 'complete', 'while_condition_false')
          props.onComplete?.(0, 'condition')
        }
      }
    })()
  })

  const handleIterationComplete = async () => {
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
    props.onIteration?.(nextIteration)
  }

  const contextValue = useMemo(() => ({
    iteration: iterationValue,
    signalComplete: handleIterationComplete
  }), [iterationValue])

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
