import { createContext, useContext } from 'react'

export interface StepContextValue {
  isActive: boolean
}

export const StepContext = createContext<StepContextValue | null>(null)

export function useStepContext(): StepContextValue | null {
  return useContext(StepContext)
}
