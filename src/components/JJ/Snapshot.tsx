import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { jjSnapshot, getJJStatus } from '../../utils/vcs.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'

export interface SnapshotProps {
  message?: string
  children?: ReactNode
}

/**
 * JJ Snapshot component - creates a JJ snapshot and logs to database.
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside.
 * Registers with Ralph for task tracking.
 */
export function Snapshot(props: SnapshotProps): ReactNode {
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [changeId, setChangeId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('jj-snapshot')

      try {
        setStatus('running')

        // Create JJ snapshot
        const result = await jjSnapshot(props.message)

        if (!isMounted()) return

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

        if (isMounted()) {
          setStatus('complete')
        }
      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <jj-snapshot
      status={status}
      change-id={changeId}
      error={error?.message}
      message={props.message}
    >
      {props.children}
    </jj-snapshot>
  )
}
