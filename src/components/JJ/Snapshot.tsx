import { useState, useEffect, useContext, type ReactNode } from 'react'
import { RalphContext } from '../Ralph'
import { useSmithers } from '../../orchestrator/components/SmithersProvider'
import { jjSnapshot, getJJStatus } from '../../utils/vcs'

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
  const ralph = useContext(RalphContext)
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [changeId, setChangeId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    // Fire-and-forget async IIFE
    ;(async () => {
      ralph?.registerTask()

      try {
        setStatus('running')

        // Create JJ snapshot
        const result = await jjSnapshot(props.message)

        if (cancelled) return

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

        if (!cancelled) {
          setStatus('complete')
        }
      } catch (err) {
        if (!cancelled) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
        }
      } finally {
        ralph?.completeTask()
      }
    })()

    return () => { cancelled = true }
  }, [])

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
