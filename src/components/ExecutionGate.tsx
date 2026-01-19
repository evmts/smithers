import { createContext, useContext, type ReactNode } from 'react'

const ExecutionGateContext = createContext<boolean>(true)

export function useExecutionGate(): boolean {
  return useContext(ExecutionGateContext)
}

export interface ExecutionGateProviderProps {
  isActive: boolean
  children: ReactNode
}

export function ExecutionGateProvider(props: ExecutionGateProviderProps): ReactNode {
  return (
    <ExecutionGateContext.Provider value={props.isActive}>
      {props.children}
    </ExecutionGateContext.Provider>
  )
}
