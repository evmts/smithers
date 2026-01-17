import { createSignal, onMount, useContext, type JSX } from 'solid-js'
import { RalphContext } from '../Ralph'
import { useSmithers } from '../../orchestrator/components/SmithersProvider'
import { getJJStatus } from '../../utils/vcs'

export interface StatusProps {
  onDirty?: (status: { modified: string[]; added: string[]; deleted: string[] }) => void
  onClean?: () => void
  children?: JSX.Element
}

/**
 * JJ Status component - checks JJ working copy status.
 *
 * Uses the fire-and-forget async IIFE pattern in onMount.
 * Registers with Ralph for task tracking.
 */
export function Status(props: StatusProps): JSX.Element {
  const ralph = useContext(RalphContext)
  const smithers = useSmithers()
  const [status, setStatus] = createSignal<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [isDirty, setIsDirty] = createSignal<boolean | null>(null)
  const [fileStatus, setFileStatus] = createSignal<{
    modified: string[]
    added: string[]
    deleted: string[]
  } | null>(null)
  const [error, setError] = createSignal<Error | null>(null)

  onMount(() => {
    // Fire-and-forget async IIFE
    (async () => {
      ralph?.registerTask()

      try {
        setStatus('running')

        // Get JJ status
        const jjStatus = await getJJStatus()
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

        setStatus('complete')

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
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setError(errorObj)
        setStatus('error')
      } finally {
        ralph?.completeTask()
      }
    })()
  })

  return (
    <jj-status
      status={status()}
      is-dirty={isDirty()}
      modified={fileStatus()?.modified?.join(',')}
      added={fileStatus()?.added?.join(',')}
      deleted={fileStatus()?.deleted?.join(',')}
      error={error()?.message}
    >
      {props.children}
    </jj-status>
  )
}
