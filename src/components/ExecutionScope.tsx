import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'
import { useEffectOnValueChange } from '../reconciler/hooks.js'

type ExecutionScopeValue = {
  enabled: boolean
  scopeId: string | null
}

const ExecutionScopeContext = createContext<ExecutionScopeValue>({ enabled: true, scopeId: null })

export function ExecutionScopeProvider(props: { enabled: boolean; scopeId?: string | null; children: ReactNode }): ReactNode {
  const parent = useContext(ExecutionScopeContext)
  const scopeId = props.scopeId ?? parent.scopeId ?? null
  const enabled = parent.enabled && props.enabled

  return (
    <ExecutionScopeContext.Provider value={{ enabled, scopeId }}>
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
  deps: unknown[] = []
): void {
  useEffectOnValueChange(enabled, () => {
    if (!enabled) return
    return effect()
  }, deps)
}
