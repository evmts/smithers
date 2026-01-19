// Phase component with automatic SQLite-backed state management
// Phases are always rendered in output, but only active phase renders children

import { useRef, useEffect, useCallback, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { usePhaseRegistry, usePhaseIndex } from './PhaseRegistry.js'
import { StepRegistryProvider } from './Step.js'
import { ExecutionProvider, useExecutionEnabled } from './ExecutionContext.js'


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
   * Skip this phase if condition returns true.
   * Takes precedence over automatic state management.
   */
  skipIf?: () => boolean

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
  const { db, ralphCount } = useSmithers()
  const registry = usePhaseRegistry()
  const myIndex = usePhaseIndex(props.name)
  const parentExecutionEnabled = useExecutionEnabled()

  const phaseIdRef = useRef<string | null>(null)
  const hasStartedRef = useRef(false)
  const hasCompletedRef = useRef(false)
  const prevIsActiveRef = useRef(false)

  // Determine phase status
  const isSkipped = props.skipIf?.() ?? false
  const isActive = !isSkipped && parentExecutionEnabled && registry.isPhaseActive(myIndex)
  const isCompleted = !isSkipped && parentExecutionEnabled && registry.isPhaseCompleted(myIndex)

  // Compute status string for output
  const status: 'pending' | 'active' | 'completed' | 'skipped' = isSkipped
    ? 'skipped'
    : isActive
      ? 'active'
      : isCompleted
        ? 'completed'
        : 'pending'

  // Track if we've already processed the skip for this phase
  const hasSkippedRef = useRef(false)

  // Handle skipped phases only when they become active (not on mount)
  useEffect(() => {
    if (parentExecutionEnabled && registry.isPhaseActive(myIndex) && isSkipped && !hasSkippedRef.current) {
      hasSkippedRef.current = true
      // Log skipped phase to database
      const id = db.phases.start(props.name, ralphCount)
      db.db.run(
        `UPDATE phases SET status = 'skipped', completed_at = datetime('now') WHERE id = ?`,
        [id]
      )
      console.log(`[Phase] Skipped: ${props.name}`)

      // Advance to next phase immediately
      registry.advancePhase()
    }
  }, [parentExecutionEnabled, registry.currentPhaseIndex, isSkipped, myIndex, db, props.name, ralphCount, registry])

  // Handle phase lifecycle transitions
  useEffect(() => {
    if (isSkipped || !parentExecutionEnabled) return

    // Activation: transition from inactive to active
    if (!prevIsActiveRef.current && isActive && !hasStartedRef.current) {
      hasStartedRef.current = true

      const id = db.phases.start(props.name, ralphCount)
      phaseIdRef.current = id

      console.log(`[Phase] Started: ${props.name} (iteration ${ralphCount})`)
      props.onStart?.()
    }

    // Completion: transition from active to inactive
    if (prevIsActiveRef.current && !isActive) {
      const id = phaseIdRef.current
      if (id && !hasCompletedRef.current && hasStartedRef.current) {
        hasCompletedRef.current = true
        db.phases.complete(id)
        console.log(`[Phase] Completed: ${props.name}`)
        props.onComplete?.()
      }
    }

    prevIsActiveRef.current = isActive
  }, [isActive, isSkipped, parentExecutionEnabled, props.name, ralphCount, db, props.onStart, props.onComplete])

  // Handler for when all steps in this phase complete
  const handleAllStepsComplete = useCallback(() => {
    if (registry.isPhaseActive(myIndex)) {
      registry.advancePhase()
    }
  }, [registry, myIndex])

  // Always render the phase element (visible in plan output)
  // Only render children when active (executes work)
  // Wrap children in StepRegistryProvider to enforce sequential step execution
  const executionEnabled = parentExecutionEnabled && isActive && !isSkipped

  return (
    <phase name={props.name} status={status}>
      <ExecutionProvider enabled={executionEnabled}>
        <StepRegistryProvider phaseId={props.name} onAllStepsComplete={handleAllStepsComplete}>
          {props.children}
        </StepRegistryProvider>
      </ExecutionProvider>
    </phase>
  )
}
