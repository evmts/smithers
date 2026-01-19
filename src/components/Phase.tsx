// Phase component with automatic SQLite-backed state management
// Phases are always rendered in output, but only active phase renders children

import { useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { useSmithers, ExecutionBoundary } from './SmithersProvider.js'
import { usePhaseRegistry, usePhaseIndex } from './PhaseRegistry.js'
import { StepRegistryProvider } from './Step.js'
import { createLogger, type Logger } from '../debug/index.js'

type PhaseStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'error'

function getPhaseStatus(isSkipped: boolean, isActive: boolean, isCompleted: boolean, hasError: boolean): PhaseStatus {
  if (hasError) return 'error'
  if (isSkipped) return 'skipped'
  if (isActive) return 'active'
  if (isCompleted) return 'completed'
  return 'pending'
}
export interface PhaseProps {
  /**
   * Phase name (must be unique within the orchestration)
   */
  name: string

  /**
   * Children components - only rendered when phase is active
   */
  children: ReactNode

  /**
   * Skip this phase if condition returns truthy.
   * Takes precedence over automatic state management.
   */
  skipIf?: () => unknown

  /**
   * Callback when phase starts (becomes active)
   */
  onStart?: () => void

  /**
   * Callback when phase completes
   */
  onComplete?: () => void
}

/**
 * Phase component with automatic state management
 *
 * All phases are always rendered in the plan output (visible structure),
 * but only the active phase renders its children (executes work).
 *
 * Phases execute sequentially by default - when one completes, the next begins.
 *
 * @example
 * ```tsx
 * <Ralph maxIterations={3}>
 *   <Phase name="Research">
 *     <Claude>Research best practices...</Claude>
 *   </Phase>
 *   <Phase name="Implementation">
 *     <Claude>Implement the solution...</Claude>
 *   </Phase>
 *   <Phase name="Review">
 *     <Claude>Review the implementation...</Claude>
 *   </Phase>
 * </Ralph>
 * ```
 */
export function Phase(props: PhaseProps): ReactNode {
  const { db, ralphCount, executionEnabled } = useSmithers()
  const registry = usePhaseRegistry()
  const myIndex = usePhaseIndex(props.name)

  const phaseIdRef = useRef<string | null>(null)
  const hasStartedRef = useRef(false)
  const hasCompletedRef = useRef(false)
  const prevIsActiveRef = useRef(false)
  const skipIfErrorRef = useRef<Error | null>(null)

  // Create logger with phase context
  const log: Logger = useMemo(() => createLogger('Phase', { name: props.name }), [props.name])

  // Evaluate skipIf with error handling
  let isSkipped = false
  if (props.skipIf) {
    try {
      isSkipped = Boolean(props.skipIf())
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      skipIfErrorRef.current = error
      log.error('skipIf evaluation failed', error, { phase: props.name })
      isSkipped = false // Don't skip if we can't evaluate the condition
    }
  }

  const hasError = skipIfErrorRef.current !== null
  const isActive = !isSkipped && !hasError && (registry ? registry.isPhaseActive(myIndex) : true)
  const isCompleted = !isSkipped && !hasError && (registry ? registry.isPhaseCompleted(myIndex) : false)

  // Compute status string for output
  const status = getPhaseStatus(isSkipped, isActive, isCompleted, hasError)

  // Track if we've already processed the skip for this phase
  const hasSkippedRef = useRef(false)

  // Handle skipped phases only when they become active (not on mount)
  useEffect(() => {
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
  }, [registry?.currentPhaseIndex, isSkipped, myIndex, db, props.name, ralphCount, registry, executionEnabled, log])

  // Handle phase lifecycle transitions
  useEffect(() => {
    if (isSkipped || hasError || !executionEnabled) return

    // Activation: transition from inactive to active
    if (!prevIsActiveRef.current && isActive && !hasStartedRef.current) {
      hasStartedRef.current = true
      const endTiming = log.time('phase_start')

      const id = db.phases.start(props.name, ralphCount)
      phaseIdRef.current = id
      endTiming()

      log.info(`Started`, { iteration: ralphCount, phaseId: id })
      props.onStart?.()
    }

    // Completion: transition from active to inactive
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

  // Handler for when all steps in this phase complete
  const handleAllStepsComplete = useCallback(() => {
    if (registry?.isPhaseActive(myIndex)) {
      registry?.advancePhase()
    }
  }, [registry, myIndex])

  // Always render the phase element (visible in plan output)
  // Only render children when active (executes work)
  // Skipped and non-active phases show only the phase tag without children
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
