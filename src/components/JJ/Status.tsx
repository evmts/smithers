import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { getJJStatus } from '../../utils/vcs.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'

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
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [isDirty, setIsDirty] = useState<boolean | null>(null)
  const [fileStatus, setFileStatus] = useState<{
    modified: string[]
    added: string[]
    deleted: string[]
  } | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('jj-status')

      try {
        setStatus('running')

        // Get JJ status
        const jjStatus = await getJJStatus()

        if (!isMounted()) return

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

        if (isMounted()) {
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
