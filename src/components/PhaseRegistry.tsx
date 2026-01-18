// PhaseRegistry - Manages sequential phase execution via SQLite state

import { createContext, useContext, useRef, useCallback, useMemo, type ReactNode } from 'react'
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
  const indexRef = useRef<number | null>(null)
  if (indexRef.current === null) {
    indexRef.current = registry.registerPhase(name)
  }
  return indexRef.current
}

export interface PhaseRegistryProviderProps {
  children: ReactNode
}

export function PhaseRegistryProvider(props: PhaseRegistryProviderProps): ReactNode {
  const { db, reactiveDb } = useSmithers()

  // Track registered phases in order (ref for synchronous registration)
  const phasesRef = useRef<string[]>([])

  // Read currentPhaseIndex from SQLite reactively
  const { data: dbPhaseIndex } = useQueryValue<number>(
    reactiveDb,
    "SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = 'currentPhaseIndex'"
  )

  const currentPhaseIndex = dbPhaseIndex ?? 0

  // Initialize currentPhaseIndex in DB only if not present (preserves resume)
  useMount(() => {
    const existing = db.state.get<number>('currentPhaseIndex')
    if (existing === null || existing === undefined) {
      db.state.set('currentPhaseIndex', 0, 'phase_registry_init')
    }
  })

  // Register a phase and return its index
  const registerPhase = useCallback((name: string): number => {
    const existingIndex = phasesRef.current.indexOf(name)
    if (existingIndex >= 0) {
      return existingIndex
    }
    const index = phasesRef.current.length
    phasesRef.current.push(name)
    return index
  }, [])

  // Advance to next phase
  const advancePhase = useCallback(() => {
    const nextIndex = currentPhaseIndex + 1
    if (nextIndex < phasesRef.current.length) {
      db.state.set('currentPhaseIndex', nextIndex, 'phase_advance')
    }
  }, [db, currentPhaseIndex])

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
    totalPhases: phasesRef.current.length,
  }), [registerPhase, currentPhaseIndex, advancePhase, isPhaseActive, isPhaseCompleted])

  return (
    <PhaseRegistryContext.Provider value={value}>
      {props.children}
    </PhaseRegistryContext.Provider>
  )
}
