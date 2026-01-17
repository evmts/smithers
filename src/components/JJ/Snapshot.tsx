import { createSignal, onMount, useContext, type JSX } from 'solid-js'
import { RalphContext } from '../Ralph'
import { useSmithers } from '../../../smithers-orchestrator/src/components/SmithersProvider'
import { jjSnapshot, getJJStatus } from '../../utils/vcs'

export interface SnapshotProps {
  message?: string
  children?: JSX.Element
}

/**
 * JJ Snapshot component - creates a JJ snapshot and logs to database.
 *
 * Uses the fire-and-forget async IIFE pattern in onMount.
 * Registers with Ralph for task tracking.
 */
export function Snapshot(props: SnapshotProps): JSX.Element {
  const ralph = useContext(RalphContext)
  const smithers = useSmithers()
  const [status, setStatus] = createSignal<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [changeId, setChangeId] = createSignal<string | null>(null)
  const [error, setError] = createSignal<Error | null>(null)

  onMount(() => {
    // Fire-and-forget async IIFE
    (async () => {
      ralph?.registerTask()

      try {
        setStatus('running')

        // Create JJ snapshot
        const result = await jjSnapshot(props.message)
        setChangeId(result.changeId)

        // Get file status for logging
        const fileStatus = await getJJStatus()

        // Log to database
        await smithers.db.vcs.logSnapshot({
          change_id: result.changeId,
          description: result.description,
          files_modified: fileStatus.modified,
          files_added: fileStatus.added,
          files_deleted: fileStatus.deleted,
        })

        setStatus('complete')
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setError(errorObj)
        setStatus('error')
      } finally {
        ralph?.completeTask()
      }
    })()
  })

  return (
    <jj-snapshot
      status={status()}
      change-id={changeId()}
      error={error()?.message}
      message={props.message}
    >
      {props.children}
    </jj-snapshot>
  )
}
