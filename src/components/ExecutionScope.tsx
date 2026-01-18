import type { DependencyList, ReactNode } from 'react'
import { createContext, useContext } from 'react'
import { useEffectOnValueChange } from '../reconciler/hooks.js'

type ExecutionScopeValue = {
  enabled: boolean
}

const ExecutionScopeContext = createContext<ExecutionScopeValue>({ enabled: true })

export function ExecutionScopeProvider(props: { enabled: boolean; children: ReactNode }): ReactNode {
  return (
    <ExecutionScopeContext.Provider value={{ enabled: props.enabled }}>
      {props.children}
    </ExecutionScopeContext.Provider>
  )
}

export function useExecutionScope(): ExecutionScopeValue {
  return useContext(ExecutionScopeContext)
}

export function useExecutionEffect(
  enabled: boolean,
  effect: () => void | (() => void),
  deps: DependencyList = []
): void {
  useEffectOnValueChange(enabled, () => {
    if (!enabled) return
    return effect()
  }, deps)
}
