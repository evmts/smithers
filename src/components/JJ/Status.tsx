import { useState, useEffect, useContext, type ReactNode } from 'react'
import { RalphContext } from '../Ralph'
import { useSmithers } from '../../orchestrator/components/SmithersProvider'
import { getJJStatus } from '../../utils/vcs'

export interface StatusProps {
  onDirty?: (status: { modified: string[]; added: string[]; deleted: string[] }) => void
  onClean?: () => void
  children?: ReactNode
}

/**
 * JJ Status component - checks JJ working copy status.
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside.
 * Registers with Ralph for task tracking.
 */
export function Status(props: StatusProps): ReactNode {
  const ralph = useContext(RalphContext)
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [isDirty, setIsDirty] = useState<boolean | null>(null)
  const [fileStatus, setFileStatus] = useState<{
    modified: string[]
    added: string[]
    deleted: string[]
  } | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    // Fire-and-forget async IIFE
    ;(async () => {
      ralph?.registerTask()

      try {
        setStatus('running')

        // Get JJ status
        const jjStatus = await getJJStatus()

        if (cancelled) return

        setFileStatus(jjStatus)

        // Check if working copy is dirty
        const dirty =
          jjStatus.modified.length > 0 ||
          jjStatus.added.length > 0 ||
          jjStatus.deleted.length > 0

        setIsDirty(dirty)

        // Call appropriate callback
        if (dirty) {
          props.onDirty?.(jjStatus)
        } else {
          props.onClean?.()
        }

        if (!cancelled) {
          setStatus('complete')
        }

        // Log status check to reports
        await smithers.db.vcs.addReport({
          type: 'progress',
          title: 'JJ Status Check',
          content: dirty
            ? `Working copy is dirty: ${jjStatus.modified.length} modified, ${jjStatus.added.length} added, ${jjStatus.deleted.length} deleted`
            : 'Working copy is clean',
          data: {
            isDirty: dirty,
            ...jjStatus,
          },
        })
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
    <jj-status
      status={status}
      is-dirty={isDirty}
      modified={fileStatus?.modified?.join(',')}
      added={fileStatus?.added?.join(',')}
      deleted={fileStatus?.deleted?.join(',')}
      error={error?.message}
    >
      {props.children}
    </jj-status>
  )
}
