import { createContext, useContext, type ReactNode } from 'react'

export interface ExecutionContextValue {
  isActive: boolean
}

const ExecutionContext = createContext<ExecutionContextValue>({ isActive: true })

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
  return useContext(ExecutionContext)
}
