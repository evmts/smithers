import { createContext, useContext, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useQueryValue } from '../reactive-sqlite/index.js'
import { useEffectOnValueChange } from '../reconciler/hooks.js'
import { createLogger } from '../debug/index.js'
import { useRequireRalph } from './While.js'

export interface StepRegistryContextValue {
  registerStep: (name: string) => number
  currentStepIndex: number
  advanceStep: () => void
  isStepActive: (index: number) => boolean
  isStepCompleted: (index: number) => boolean
  markStepComplete: (index: number) => void
  isParallel: boolean
}

export const StepRegistryContext = createContext<StepRegistryContextValue | undefined>(undefined)

export function useStepRegistry(): StepRegistryContextValue | undefined {
  return useContext(StepRegistryContext)
}

export function useStepIndex(name: string | undefined): number {
  const registry = useStepRegistry()
  const indexRef = useRef<number | null>(null)
  if (indexRef.current === null) {
    indexRef.current = registry ? registry.registerStep(name ?? 'unnamed') : 0
  }
  return indexRef.current
}

export interface StepRegistryProviderProps {
  children: ReactNode
  phaseId?: string
  isParallel?: boolean
  onAllStepsComplete?: () => void
  registryId?: string
  enabled?: boolean
}

export function StepRegistryProvider(props: StepRegistryProviderProps): ReactNode {
  useRequireRalph('StepRegistryProvider')
  const { db, reactiveDb, executionEnabled } = useSmithers()
  const isParallel = props.isParallel ?? false
  const registryEnabled = props.enabled ?? true
  const completionEnabled = executionEnabled && registryEnabled
  const stateKey = `stepIndex_${props.phaseId ?? 'default'}`

  const stepsRef = useRef<string[]>([])
  const completedStepsRef = useRef<Set<number>>(new Set())
  const hasInitializedRef = useRef(false)
  const hasNotifiedAllCompleteRef = useRef(false)
  const hasWarnedNoStepsRef = useRef(false)

  const log = useMemo(() => createLogger('StepRegistryProvider', { phaseId: props.phaseId }), [props.phaseId])

  const { data: dbStepIndex } = useQueryValue<number>(
    reactiveDb,
    `SELECT CAST(value AS INTEGER) as idx FROM state WHERE key = ?`,
    [stateKey],
    { skip: isParallel }
  )

  const currentStepIndex = isParallel ? -1 : (dbStepIndex ?? 0)
  const registeredStepCount = stepsRef.current.length

  const registerStep = useCallback((name: string): number => {
    const existingIndex = stepsRef.current.indexOf(name)
    if (existingIndex >= 0) return existingIndex
    const index = stepsRef.current.length
    stepsRef.current.push(name)
    return index
  }, [])

  const initToken = completionEnabled ? (dbStepIndex ?? -1) : -2
  useEffectOnValueChange(initToken, () => {
    if (!completionEnabled || isParallel) return
    if (hasInitializedRef.current) return
    if (dbStepIndex !== null && dbStepIndex !== undefined) {
      hasInitializedRef.current = true
      return
    }
    if (db.state.has(stateKey)) {
      hasInitializedRef.current = true
      return
    }
    db.state.set(stateKey, 0, 'step_registry_init')
    hasInitializedRef.current = true
  }, [db, dbStepIndex, completionEnabled, isParallel, stateKey])

  const maybeNotifyAllComplete = useCallback((completedOverride?: number) => {
    if (!completionEnabled || hasNotifiedAllCompleteRef.current) return
    const totalSteps = stepsRef.current.length

    if (totalSteps === 0) {
      if (!hasWarnedNoStepsRef.current) {
        hasWarnedNoStepsRef.current = true
        log.warn('Phase has no Steps - wrap children in <Step>')
      }
      return
    }

    const completedCountValue = completedOverride ?? completedStepsRef.current.size
    const sequentialDone = !isParallel && currentStepIndex >= totalSteps
    if (sequentialDone || completedCountValue >= totalSteps) {
      hasNotifiedAllCompleteRef.current = true
      props.onAllStepsComplete?.()
    }
  }, [completionEnabled, currentStepIndex, isParallel, log, props.onAllStepsComplete])

  const sequentialCompletionToken = completionEnabled && !isParallel
    ? `${currentStepIndex}/${registeredStepCount}`
    : 'disabled'
  const parallelCompletionToken = completionEnabled && isParallel
    ? `${completedStepsRef.current.size}/${registeredStepCount}`
    : 'disabled'

  useEffectOnValueChange(sequentialCompletionToken, () => {
    if (isParallel) return
    maybeNotifyAllComplete()
  }, [isParallel, maybeNotifyAllComplete, sequentialCompletionToken])

  useEffectOnValueChange(parallelCompletionToken, () => {
    if (!isParallel) return
    maybeNotifyAllComplete(completedStepsRef.current.size)
  }, [isParallel, maybeNotifyAllComplete, parallelCompletionToken])

  const advanceStep = useCallback(() => {
    if (isParallel) return
    const nextIndex = currentStepIndex + 1
    const totalSteps = stepsRef.current.length
    if (totalSteps === 0 || nextIndex <= totalSteps) {
      db.state.set(stateKey, nextIndex, 'step_advance')
    }
  }, [db, stateKey, currentStepIndex, isParallel])

  const isStepActive = useCallback((index: number): boolean => {
    if (isParallel) return true
    if (currentStepIndex >= stepsRef.current.length) return false
    return index === currentStepIndex
  }, [currentStepIndex, isParallel])

  const isStepCompleted = useCallback((index: number): boolean => {
    if (completedStepsRef.current.has(index)) return true
    if (isParallel) return false
    return index < currentStepIndex
  }, [currentStepIndex, isParallel])

  const markStepComplete = useCallback((index: number) => {
    if (completedStepsRef.current.has(index)) return
    completedStepsRef.current.add(index)
    maybeNotifyAllComplete(completedStepsRef.current.size)
  }, [maybeNotifyAllComplete])

  const value = useMemo((): StepRegistryContextValue => ({
    registerStep,
    currentStepIndex,
    advanceStep,
    isStepActive,
    isStepCompleted,
    markStepComplete,
    isParallel,
  }), [registerStep, currentStepIndex, advanceStep, isStepActive, isStepCompleted, markStepComplete, isParallel])

  return (
    <StepRegistryContext.Provider value={value}>
      {props.children}
    </StepRegistryContext.Provider>
  )
}
