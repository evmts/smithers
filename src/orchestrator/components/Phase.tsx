// Enhanced Phase component with automatic database logging
// Wraps base smithers Phase component

import { useEffect, useState, useContext, useRef, type ReactNode } from 'react'
import { Phase as BasePhase } from '../../components/Phase'
import { RalphContext } from '../../components/Ralph'
import { useSmithers } from './SmithersProvider'

export interface PhaseProps {
  /**
   * Phase name
   */
  name: string

  /**
   * Children components
   */
  children: ReactNode

  /**
   * Skip this phase if condition is true
   */
  skipIf?: () => boolean

  /**
   * Callback when phase starts
   */
  onStart?: () => void

  /**
   * Callback when phase completes
   */
  onComplete?: () => void
}

/**
 * Enhanced Phase component with automatic database logging
 *
 * Usage:
 * ```tsx
 * <Phase name="Implementation">
 *   <Claude>Implement the feature</Claude>
 * </Phase>
 * ```
 */
export function Phase(props: PhaseProps): ReactNode {
  const { db } = useSmithers()
  const ralph = useContext(RalphContext)
  const [phaseId, setPhaseId] = useState<string | null>(null)
  const [status, setStatus] = useState<'pending' | 'running' | 'completed' | 'skipped'>('pending')
  const phaseIdRef = useRef<string | null>(null)

  // Get current iteration from Ralph context (if available)
  const getCurrentIteration = (): number => {
    return (ralph as any)?.iteration ?? 0
  }

  useEffect(() => {
    ;(async () => {
      try {
        // Check skip condition
        if (props.skipIf?.()) {
          setStatus('skipped')
          console.log(`[Phase] Skipped: ${props.name}`)

          // Still log to database for completeness
          const id = await db.phases.start(props.name, getCurrentIteration())
          await db.pg.query(
            `UPDATE phases SET status = 'skipped', completed_at = NOW() WHERE id = $1`,
            [id]
          )

          return
        }

        // Start phase in database
        const id = await db.phases.start(props.name, getCurrentIteration())
        setPhaseId(id)
        phaseIdRef.current = id
        setStatus('running')

        console.log(`[Phase] Started: ${props.name} (iteration ${getCurrentIteration()})`)

        props.onStart?.()
      } catch (error) {
        console.error(`[Phase] Error starting phase ${props.name}:`, error)
      }
    })()

    return () => {
      ;(async () => {
        const id = phaseIdRef.current
        if (!id) return

        try {
          await db.phases.complete(id)
          setStatus('completed')

          console.log(`[Phase] Completed: ${props.name}`)

          props.onComplete?.()
        } catch (error) {
          console.error(`[Phase] Error completing phase ${props.name}:`, error)
        }
      })()
    }
  }, [])

  // Don't render children if skipped
  if (status === 'skipped') {
    return <phase name={props.name} status="skipped" />
  }

  return (
    <BasePhase name={props.name}>
      {props.children}
    </BasePhase>
  )
}
