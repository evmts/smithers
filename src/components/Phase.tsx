// Phase component with automatic SQLite-backed state management
// Phases are always rendered in output, but only active phase renders children

import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { usePhaseRegistry, usePhaseIndex } from './PhaseRegistry.js'
import { useMount, useUnmount } from '../reconciler/hooks.js'

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

  // Determine phase status
  const isSkipped = props.skipIf?.() ?? false
  const isActive = !isSkipped && registry.isPhaseActive(myIndex)
  const isCompleted = !isSkipped && registry.isPhaseCompleted(myIndex)

  // Compute status string for output
  const status: 'pending' | 'active' | 'completed' | 'skipped' =
    isSkipped ? 'skipped' :
    isActive ? 'active' :
    isCompleted ? 'completed' : 'pending'

  // Handle phase activation
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
      return
    }

    if (isActive && !hasStartedRef.current) {
      hasStartedRef.current = true

      // Start phase in database
      const id = db.phases.start(props.name, ralphCount)
      setPhaseId(id)
      phaseIdRef.current = id

      console.log(`[Phase] Started: ${props.name} (iteration ${ralphCount})`)
      props.onStart?.()
    }
  })

  // Handle phase completion (when children unmount = work done)
  useUnmount(() => {
    const id = phaseIdRef.current
    if (id && !hasCompletedRef.current && hasStartedRef.current) {
      hasCompletedRef.current = true

      db.phases.complete(id)
      console.log(`[Phase] Completed: ${props.name}`)

      props.onComplete?.()

      // Advance to next phase
      registry.advancePhase()
    }
  })

  // Always render the phase element (visible in plan output)
  // Only render children when active (executes work)
  return (
    <phase name={props.name} status={status}>
      {isActive && props.children}
    </phase>
  )
}
