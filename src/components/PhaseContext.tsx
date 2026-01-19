import { createContext, useContext } from 'react'

export interface PhaseContextValue {
  isActive: boolean
}

export const PhaseContext = createContext<PhaseContextValue | null>(null)

export function usePhaseContext(): PhaseContextValue | null {
  return useContext(PhaseContext)
}
