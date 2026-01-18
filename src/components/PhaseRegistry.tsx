// PhaseRegistry - Manages sequential phase execution via SQLite state

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { useMount } from '../reconciler/hooks.js'

export interface PhaseRegistryContextValue {
  // Registration - returns the index assigned to this phase
  registerPhase: (name: string) => number

  // Current active phase index (from SQLite)
  currentPhaseIndex: number

  // Advance to next phase
  advancePhase: () => void

  // Check if a phase at given index is active
  isPhaseActive: (index: number) => boolean

  // Check if a phase at given index is completed
  isPhaseCompleted: (index: number) => boolean

  // Get total registered phases
  totalPhases: number
}

const PhaseRegistryContext = createContext<PhaseRegistryContextValue | undefined>(undefined)

export function usePhaseRegistry(): PhaseRegistryContextValue {
  const ctx = useContext(PhaseRegistryContext)
  if (!ctx) {
    throw new Error('usePhaseRegistry must be used within PhaseRegistryProvider')
  }
  return ctx
}

// Hook for phases to get their index during registration
export function usePhaseIndex(name: string): number {
  const registry = usePhaseRegistry()
  const [index] = useState(() => registry.registerPhase(name))
  return index
}

export interface PhaseRegistryProviderProps {
  children: ReactNode
}

export function PhaseRegistryProvider(props: PhaseRegistryProviderProps): ReactNode {
  const { db, reactiveDb } = useSmithers()

  // Track registered phases in order
  const [phases, setPhases] = useState<string[]>([])

  // Read currentPhaseIndex from SQLite reactively
  const { data: dbPhaseIndex } = useQueryValue<number>(
    reactiveDb,
    "SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = 'currentPhaseIndex'"
  )

  const currentPhaseIndex = dbPhaseIndex ?? 0

  // Initialize currentPhaseIndex in DB if not present
  useMount(() => {
    db.state.set('currentPhaseIndex', 0, 'phase_registry_init')
  })

  // Register a phase and return its index
  const registerPhase = useCallback((name: string): number => {
    let index = -1
    setPhases(prev => {
      // Check if already registered
      const existingIndex = prev.indexOf(name)
      if (existingIndex >= 0) {
        index = existingIndex
        return prev
      }
      // Add new phase
      index = prev.length
      return [...prev, name]
    })
    return index >= 0 ? index : phases.length
  }, [phases.length])

  // Advance to next phase
  const advancePhase = useCallback(() => {
    const nextIndex = currentPhaseIndex + 1
    if (nextIndex < phases.length) {
      db.state.set('currentPhaseIndex', nextIndex, 'phase_advance')
    }
  }, [db, currentPhaseIndex, phases.length])

  // Check if phase is active
  const isPhaseActive = useCallback((index: number): boolean => {
    return index === currentPhaseIndex
  }, [currentPhaseIndex])

  // Check if phase is completed
  const isPhaseCompleted = useCallback((index: number): boolean => {
    return index < currentPhaseIndex
  }, [currentPhaseIndex])

  const value = useMemo((): PhaseRegistryContextValue => ({
    registerPhase,
    currentPhaseIndex,
    advancePhase,
    isPhaseActive,
    isPhaseCompleted,
    totalPhases: phases.length,
  }), [registerPhase, currentPhaseIndex, advancePhase, isPhaseActive, isPhaseCompleted, phases.length])

  return (
    <PhaseRegistryContext.Provider value={value}>
      {props.children}
    </PhaseRegistryContext.Provider>
  )
}
