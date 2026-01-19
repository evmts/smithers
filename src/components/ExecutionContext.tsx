import { createContext, useContext, type ReactNode } from 'react'
import { useExecutionScope } from './ExecutionScope.js'

export interface ExecutionContextValue {
  isActive: boolean
}

const ExecutionContext = createContext<ExecutionContextValue | null>(null)

export interface ExecutionProviderProps {
  isActive: boolean
  children: ReactNode
}

export function ExecutionProvider(props: ExecutionProviderProps): ReactNode {
  return (
    <ExecutionContext.Provider value={{ isActive: props.isActive }}>
      {props.children}
    </ExecutionContext.Provider>
  )
}

export function useExecutionContext(): ExecutionContextValue {
  const scope = useExecutionScope()
  const context = useContext(ExecutionContext)
  if (!context) {
    return { isActive: scope.enabled }
  }
  return { isActive: context.isActive && scope.enabled }
}
