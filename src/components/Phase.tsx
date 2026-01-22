import { useRef, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers, ExecutionBoundary } from './SmithersProvider.js'
import { usePhaseRegistry, usePhaseIndex } from './PhaseRegistry.js'
import { StepRegistryProvider } from './Step.js'
import { createLogger, type Logger } from '../debug/index.js'
import { useEffectOnValueChange } from '../reconciler/hooks.js'
import { useRequireRalph } from './While.js'

type PhaseStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'error'

function getPhaseStatus(isSkipped: boolean, isActive: boolean, isCompleted: boolean, hasError: boolean): PhaseStatus {
  if (hasError) return 'error'
  if (isSkipped) return 'skipped'
  if (isActive) return 'active'
  if (isCompleted) return 'completed'
  return 'pending'
}
export interface PhaseProps {
  name: string
  children: ReactNode
  skipIf?: () => unknown
  onStart?: () => void
  onComplete?: () => void
}

export function Phase(props: PhaseProps): ReactNode {
  // Phase requires Ralph/While for iteration-based progression
  const ralphCtx = useRequireRalph('Phase')
  
  const { db, executionEnabled } = useSmithers()
  const ralphCount = ralphCtx.iteration
  const registry = usePhaseRegistry()
  const myIndex = usePhaseIndex(props.name)

  const phaseIdRef = useRef<string | null>(null)
  const hasStartedRef = useRef(false)
  const hasCompletedRef = useRef(false)
  const prevIsActiveRef = useRef(false)
  const skipIfErrorRef = useRef<Error | null>(null)

  // Create logger with phase context
  const log: Logger = useMemo(() => createLogger('Phase', { name: props.name }), [props.name])

  skipIfErrorRef.current = null
  let isSkipped = false
  if (props.skipIf) {
    try {
      isSkipped = Boolean(props.skipIf())
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      skipIfErrorRef.current = error
      log.error('skipIf evaluation failed', error, { phase: props.name })
      isSkipped = false
    }
  }

  const hasError = skipIfErrorRef.current !== null
  const isActive = !isSkipped && !hasError && (registry ? registry.isPhaseActive(myIndex) : true)
  const isCompleted = !isSkipped && !hasError && (registry ? registry.isPhaseCompleted(myIndex) : false)
  const currentPhaseIndex = registry?.currentPhaseIndex ?? null

  const status = getPhaseStatus(isSkipped, isActive, isCompleted, hasError)

  const hasSkippedRef = useRef(false)

  const skipKey = useMemo(
    () => ({ currentPhaseIndex, isSkipped }),
    [currentPhaseIndex, isSkipped]
  )

  useEffectOnValueChange(skipKey, () => {
    if (!executionEnabled) return
    if (registry?.isPhaseActive(myIndex) && isSkipped && !hasSkippedRef.current) {
      hasSkippedRef.current = true
      const endTiming = log.time('phase_skip')
      const id = db.phases.start(props.name, ralphCount)
      db.db.run(
        `UPDATE phases SET status = 'skipped', completed_at = datetime('now') WHERE id = ?`,
        [id]
      )
      log.info(`Skipped`, { iteration: ralphCount })
      endTiming()

      registry?.advancePhase()
    }
  }, [currentPhaseIndex, isSkipped, myIndex, db, props.name, ralphCount, registry, executionEnabled, log])

  const lifecycleKey = useMemo(
    () => ({ isActive, isSkipped, hasError, executionEnabled }),
    [isActive, isSkipped, hasError, executionEnabled]
  )

  useEffectOnValueChange(lifecycleKey, () => {
    if (isSkipped || hasError || !executionEnabled) return

    if (!prevIsActiveRef.current && isActive && !hasStartedRef.current) {
      hasStartedRef.current = true
      const endTiming = log.time('phase_start')

      const id = db.phases.start(props.name, ralphCount)
      phaseIdRef.current = id
      endTiming()

      log.info(`Started`, { iteration: ralphCount, phaseId: id })
      props.onStart?.()
    }

    if (prevIsActiveRef.current && !isActive) {
      const id = phaseIdRef.current
      if (id && !hasCompletedRef.current && hasStartedRef.current) {
        hasCompletedRef.current = true
        const endTiming = log.time('phase_complete')
        db.phases.complete(id)
        endTiming()
        log.info(`Completed`, { phaseId: id })
        props.onComplete?.()
      }
    }

    prevIsActiveRef.current = isActive
  }, [isActive, isSkipped, hasError, executionEnabled, props.name, ralphCount, db, props.onStart, props.onComplete, log])

  const handleAllStepsComplete = useCallback(() => {
    if (registry?.isPhaseActive(myIndex)) {
      registry?.advancePhase()
    }
  }, [registry, myIndex])

  const shouldRenderChildren = isActive && !isSkipped

  return (
    <phase 
      name={props.name} 
      status={status}
      {...(skipIfErrorRef.current ? { error: skipIfErrorRef.current.message } : {})}
    >
      {shouldRenderChildren && (
        <ExecutionBoundary enabled={isActive}>
          <StepRegistryProvider phaseId={props.name} onAllStepsComplete={handleAllStepsComplete}>
            {props.children}
          </StepRegistryProvider>
        </ExecutionBoundary>
      )}
    </phase>
  )
}
