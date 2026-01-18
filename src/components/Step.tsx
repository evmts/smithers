// Enhanced Step component with automatic database logging and VCS integration

import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { jjSnapshot, jjCommit } from '../utils/vcs.js'
import { useMount, useUnmount } from '../reconciler/hooks.js'

export interface StepProps {
  /**
   * Step name
   */
  name?: string

  /**
   * Children components
   */
  children: ReactNode

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
export function Step(props: StepProps): ReactNode {
  const { db } = useSmithers()
  const [, setStepId] = useState<string | null>(null)
  const [, setStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending')
  const stepIdRef = useRef<string | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const snapshotBeforeIdRef = useRef<string | undefined>(undefined)
  const snapshotAfterIdRef = useRef<string | undefined>(undefined)
  const commitHashRef = useRef<string | undefined>(undefined)

  useMount(() => {
    ;(async () => {
      // Register task with database
      taskIdRef.current = db.tasks.start('step', props.name)

      try {
        // Snapshot before if requested
        if (props.snapshotBefore) {
          try {
            const { changeId } = await jjSnapshot(`Before step: ${props.name ?? 'unnamed'}`)
            snapshotBeforeIdRef.current = changeId
            console.log(`[Step] Created snapshot before: ${changeId}`)
          } catch (error) {
            console.warn('[Step] Could not create snapshot before:', error)
          }
        }

        // Start step in database
        const id = db.steps.start(props.name)
        setStepId(id)
        stepIdRef.current = id
        setStatus('running')

        console.log(`[Step] Started: ${props.name ?? 'unnamed'}`)

        props.onStart?.()
      } catch (error) {
        console.error(`[Step] Error starting step:`, error)
        setStatus('failed')

        if (stepIdRef.current) {
          db.steps.fail(stepIdRef.current)
        }

        // Complete task on error
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  useUnmount(() => {
    ;(async () => {
      const id = stepIdRef.current
      if (!id) return

      try {
        // Snapshot after if requested
        if (props.snapshotAfter) {
          try {
            const { changeId } = await jjSnapshot(`After step: ${props.name ?? 'unnamed'}`)
            snapshotAfterIdRef.current = changeId
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
            commitHashRef.current = result.commitHash

            console.log(`[Step] Created commit: ${commitHashRef.current}`)

            // Also log to commits table
            db.vcs.logCommit({
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
        db.steps.complete(id, {
          ...(snapshotBeforeIdRef.current ? { snapshot_before: snapshotBeforeIdRef.current } : {}),
          ...(snapshotAfterIdRef.current ? { snapshot_after: snapshotAfterIdRef.current } : {}),
          ...(commitHashRef.current ? { commit_created: commitHashRef.current } : {}),
        })

        setStatus('completed')
        console.log(`[Step] Completed: ${props.name ?? 'unnamed'}`)

        props.onComplete?.()
      } catch (error) {
        console.error(`[Step] Error completing step:`, error)
        db.steps.fail(id)
        setStatus('failed')
      } finally {
        // Complete task
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <step {...(props.name ? { name: props.name } : {})}>
      {props.children}
    </step>
  )
}
