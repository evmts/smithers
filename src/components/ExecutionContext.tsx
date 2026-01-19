import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useEffectOnValueChange } from '../reconciler/hooks.js'

const ExecutionContext = createContext(true)

export interface ExecutionProviderProps {
  enabled: boolean
  children: ReactNode
}

export function ExecutionProvider(props: ExecutionProviderProps): ReactNode {
  return (
    <ExecutionContext.Provider value={props.enabled}>
      {props.children}
    </ExecutionContext.Provider>
  )
}

export function useExecutionEnabled(): boolean {
  return useContext(ExecutionContext)
}

export function useExecuteOnActive(effect: () => void | (() => void)): void {
  const enabled = useExecutionEnabled()
  const hasRunRef = useRef(false)

  useEffectOnValueChange(enabled, () => {
    if (!enabled || hasRunRef.current) return
    hasRunRef.current = true
    return effect()
  })
}
