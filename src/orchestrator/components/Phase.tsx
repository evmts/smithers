// Enhanced Phase component with automatic database logging
// Wraps base smithers Phase component

import { onMount, onCleanup, createSignal, useContext, type JSX } from 'solid-js'
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
  children: JSX.Element

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
export function Phase(props: PhaseProps): JSX.Element {
  const { db } = useSmithers()
  const ralph = useContext(RalphContext)
  const [phaseId, setPhaseId] = createSignal<string | null>(null)
  const [status, setStatus] = createSignal<'pending' | 'running' | 'completed' | 'skipped'>('pending')

  // Get current iteration from Ralph context (if available)
  const getCurrentIteration = (): number => {
    return (ralph as any)?.iteration?.() ?? 0
  }

  onMount(() => {
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
        setStatus('running')

        console.log(`[Phase] Started: ${props.name} (iteration ${getCurrentIteration()})`)

        props.onStart?.()
      } catch (error) {
        console.error(`[Phase] Error starting phase ${props.name}:`, error)
      }
    })()
  })

  onCleanup(() => {
    ;(async () => {
      const id = phaseId()
      if (!id || status() === 'skipped') return

      try {
        await db.phases.complete(id)
        setStatus('completed')

        console.log(`[Phase] Completed: ${props.name}`)

        props.onComplete?.()
      } catch (error) {
        console.error(`[Phase] Error completing phase ${props.name}:`, error)
      }
    })()
  })

  // Don't render children if skipped
  if (status() === 'skipped') {
    return <phase name={props.name} status="skipped" />
  }

  return (
    <BasePhase name={props.name}>
      {props.children}
    </BasePhase>
  )
}
