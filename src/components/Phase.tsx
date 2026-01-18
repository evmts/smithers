// Phase component with automatic SQLite-backed state management
// Phases are always rendered in output, but only active phase renders children

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { usePhaseRegistry, usePhaseIndex } from './PhaseRegistry.js'
import { useMount } from '../reconciler/hooks.js'

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

  const [, setPhaseId] = useState<string | null>(null)
  const phaseIdRef = useRef<string | null>(null)
  const hasStartedRef = useRef(false)
  const hasCompletedRef = useRef(false)

  // Track previous active state to detect completion
  const wasActiveRef = useRef(false)

  // Determine phase status
  const isSkipped = props.skipIf?.() ?? false
  const isActive = !isSkipped && registry.isPhaseActive(myIndex)
  const isCompleted = !isSkipped && registry.isPhaseCompleted(myIndex)

  // Compute status string for output
  const status: 'pending' | 'active' | 'completed' | 'skipped' = isSkipped
    ? 'skipped'
    : isActive
      ? 'active'
      : isCompleted
        ? 'completed'
        : 'pending'

  // Handle skipped phases on mount
  useMount(() => {
    if (isSkipped) {
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
  })

  // Handle phase activation - triggers when isActive changes to true
  // Using useEffect instead of useMount so it triggers when a pre-mounted
  // pending phase becomes active (not just on initial mount)
  useEffect(() => {
    if (isSkipped) return

    if (isActive && !hasStartedRef.current) {
      hasStartedRef.current = true
      wasActiveRef.current = true

      // Start phase in database
      const id = db.phases.start(props.name, ralphCount)
      setPhaseId(id)
      phaseIdRef.current = id

      console.log(`[Phase] Started: ${props.name} (iteration ${ralphCount})`)
      props.onStart?.()
    }
  }, [isActive, isSkipped, props.name, ralphCount, db, props.onStart])

  // Handle phase completion - triggers when isActive changes from true to false
  // Using useEffect instead of useUnmount because Phase components stay mounted
  // (they always render in output), so we detect completion via state change
  useEffect(() => {
    // Detect transition from active to completed (wasActive && !isActive && isCompleted)
    if (wasActiveRef.current && !isActive && isCompleted) {
      const id = phaseIdRef.current
      if (id && !hasCompletedRef.current && hasStartedRef.current) {
        hasCompletedRef.current = true

        db.phases.complete(id)
        console.log(`[Phase] Completed: ${props.name}`)

        props.onComplete?.()

        // Advance to next phase
        registry.advancePhase()
      }
    }
  }, [isActive, isCompleted, db, props.name, props.onComplete, registry])

  // Always render the phase element (visible in plan output)
  // Only render children when active (executes work)
  return (
    <phase name={props.name} status={status}>
      {isActive && props.children}
    </phase>
  )
}
