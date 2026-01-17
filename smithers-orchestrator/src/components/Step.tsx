// Enhanced Step component with automatic database logging and VCS integration
// Wraps base smithers Step component

import { onMount, onCleanup, createSignal, useContext, type JSX } from 'solid-js'
import { Step as BaseStep } from '../../../src/components/Step'
import { RalphContext } from '../../../src/components/Ralph'
import { useSmithers } from './SmithersProvider'
import { jjSnapshot, jjCommit, getJJChangeId } from '../../../src/utils/vcs'

export interface StepProps {
  /**
   * Step name
   */
  name?: string

  /**
   * Children components
   */
  children: JSX.Element

  /**
   * Create JJ snapshot before executing
   */
  snapshotBefore?: boolean

  /**
   * Create JJ snapshot after executing
   */
  snapshotAfter?: boolean

  /**
   * Create JJ commit after executing
   */
  commitAfter?: boolean

  /**
   * Commit message (if commitAfter is true)
   */
  commitMessage?: string

  /**
   * Callback when step starts
   */
  onStart?: () => void

  /**
   * Callback when step completes
   */
  onComplete?: () => void
}

/**
 * Enhanced Step component with automatic database logging and VCS integration
 *
 * Usage:
 * ```tsx
 * <Step name="Write code" snapshotBefore commitAfter commitMessage="Implement feature">
 *   <Claude>Write the implementation</Claude>
 * </Step>
 * ```
 */
export function Step(props: StepProps): JSX.Element {
  const { db } = useSmithers()
  const ralph = useContext(RalphContext)
  const [stepId, setStepId] = createSignal<string | null>(null)
  const [status, setStatus] = createSignal<'pending' | 'running' | 'completed' | 'failed'>('pending')

  let snapshotBeforeId: string | undefined
  let snapshotAfterId: string | undefined
  let commitHash: string | undefined

  onMount(() => {
    ;(async () => {
      ralph?.registerTask()

      try {
        // Snapshot before if requested
        if (props.snapshotBefore) {
          try {
            const { changeId } = await jjSnapshot(`Before step: ${props.name ?? 'unnamed'}`)
            snapshotBeforeId = changeId
            console.log(`[Step] Created snapshot before: ${changeId}`)
          } catch (error) {
            console.warn('[Step] Could not create snapshot before:', error)
          }
        }

        // Start step in database
        const id = await db.steps.start(props.name)
        setStepId(id)
        setStatus('running')

        console.log(`[Step] Started: ${props.name ?? 'unnamed'}`)

        props.onStart?.()
      } catch (error) {
        console.error(`[Step] Error starting step:`, error)
        setStatus('failed')

        if (stepId()) {
          await db.steps.fail(stepId()!)
        }

        ralph?.completeTask()
      }
    })()
  })

  onCleanup(() => {
    ;(async () => {
      const id = stepId()
      if (!id) return

      try {
        // Snapshot after if requested
        if (props.snapshotAfter) {
          try {
            const { changeId } = await jjSnapshot(`After step: ${props.name ?? 'unnamed'}`)
            snapshotAfterId = changeId
            console.log(`[Step] Created snapshot after: ${changeId}`)
          } catch (error) {
            console.warn('[Step] Could not create snapshot after:', error)
          }
        }

        // Commit if requested
        if (props.commitAfter) {
          try {
            const message = props.commitMessage ?? `Step: ${props.name ?? 'unnamed'}`
            const result = await jjCommit(message)
            commitHash = result.commitHash

            console.log(`[Step] Created commit: ${commitHash}`)

            // Also log to commits table
            await db.vcs.logCommit({
              vcs_type: 'jj',
              commit_hash: result.commitHash,
              change_id: result.changeId,
              message,
            })
          } catch (error) {
            console.warn('[Step] Could not create commit:', error)
          }
        }

        // Complete step in database
        await db.steps.complete(id, {
          snapshot_before: snapshotBeforeId,
          snapshot_after: snapshotAfterId,
          commit_created: commitHash,
        })

        setStatus('completed')
        console.log(`[Step] Completed: ${props.name ?? 'unnamed'}`)

        props.onComplete?.()
      } catch (error) {
        console.error(`[Step] Error completing step:`, error)
        await db.steps.fail(id)
        setStatus('failed')
      } finally {
        ralph?.completeTask()
      }
    })()
  })

  return (
    <BaseStep name={props.name}>
      {props.children}
    </BaseStep>
  )
}
