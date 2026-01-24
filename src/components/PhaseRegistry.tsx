import { createContext, useContext, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { useMount, useEffectOnValueChange } from '../reconciler/hooks.js'
import { useRalphContext } from './While.js'

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
  const ralphCtx = useRalphContext()

  // Track registered phases in order (ref for synchronous registration)
  const phasesRef = useRef<string[]>([])

  // Read currentPhaseIndex from SQLite reactively
  const { data: dbPhaseIndex } = useQueryValue<number>(
    reactiveDb,
    "SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = 'currentPhaseIndex'"
  )

  const currentPhaseIndex = dbPhaseIndex ?? 0

  // Track Ralph iteration to reset phase index on new iteration
  const ralphIteration = ralphCtx?.iteration ?? 0
  const prevIterationRef = useRef(ralphIteration)

  // Track if we've already signaled completion to avoid double-signaling
  const hasSignaledCompleteRef = useRef(false)

  // Initialize currentPhaseIndex in DB only if not present (preserves resume)
  useMount(() => {
    const existing = db.state.get<number>('currentPhaseIndex')
    if (existing === null || existing === undefined) {
      db.state.set('currentPhaseIndex', 0, 'phase_registry_init')
    }
  })

  // Reset phase index when Ralph iteration changes (new iteration starting)
  useEffectOnValueChange(ralphIteration, () => {
    if (ralphIteration !== prevIterationRef.current) {
      prevIterationRef.current = ralphIteration
      hasSignaledCompleteRef.current = false
      // Only reset if not already at 0 to avoid unnecessary state changes
      if (currentPhaseIndex !== 0) {
        db.state.set('currentPhaseIndex', 0, 'phase_reset_for_new_iteration')
      }
    }
  }, [ralphIteration, currentPhaseIndex, db])

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

  // Advance to next phase (or signal Ralph iteration complete if all phases done)
  const advancePhase = useCallback(() => {
    const nextIndex = currentPhaseIndex + 1
    console.log(`[PhaseRegistry] advancePhase`, JSON.stringify({
      currentPhaseIndex,
      nextIndex,
      totalPhases: phasesRef.current.length,
      hasSignaledComplete: hasSignaledCompleteRef.current,
      hasRalphCtx: !!ralphCtx
    }))
    if (nextIndex < phasesRef.current.length) {
      db.state.set('currentPhaseIndex', nextIndex, 'phase_advance')
      hasSignaledCompleteRef.current = false
    } else if (!hasSignaledCompleteRef.current) {
      // All phases complete - signal Ralph to re-evaluate condition
      console.log(`[PhaseRegistry] All phases complete, signaling Ralph`)
      hasSignaledCompleteRef.current = true
      if (ralphCtx) {
        ralphCtx.signalComplete()
      }
    }
  }, [db, currentPhaseIndex, ralphCtx])

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
