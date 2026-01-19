import { useRef, useReducer, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { jjSnapshot, getJJStatus } from '../../utils/vcs.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'
import { useExecutionContext } from '../ExecutionContext.js'

export interface SnapshotProps {
  message?: string
  children?: ReactNode
}

/**
 * JJ Snapshot component - creates a JJ snapshot and logs to database.
 *
 * React pattern: Uses useRef + forceUpdate for fire-and-forget VCS ops.
 * Registers with Ralph for task tracking.
 */
export function Snapshot(props: SnapshotProps): ReactNode {
  const smithers = useSmithers()
  const execution = useExecutionContext()
  const [, forceUpdate] = useReducer((x) => x + 1, 0)

  const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
  const changeIdRef = useRef<string | null>(null)
  const errorRef = useRef<Error | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    if (!execution.isActive) return
    ;(async () => {
      taskIdRef.current = smithers.db.tasks.start('jj-snapshot')

      try {
        statusRef.current = 'running'
        forceUpdate()

        const result = await jjSnapshot(props.message)

        if (!isMounted()) return

        changeIdRef.current = result.changeId

        const fileStatus = await getJJStatus()

        await smithers.db.vcs.logSnapshot({
          change_id: result.changeId,
          description: result.description,
          files_modified: fileStatus.modified,
          files_added: fileStatus.added,
          files_deleted: fileStatus.deleted,
        })

        if (isMounted()) {
          statusRef.current = 'complete'
          forceUpdate()
        }
      } catch (err) {
        if (isMounted()) {
          errorRef.current = err instanceof Error ? err : new Error(String(err))
          statusRef.current = 'error'
          forceUpdate()
        }
      } finally {
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <jj-snapshot
      status={statusRef.current}
      change-id={changeIdRef.current}
      error={errorRef.current?.message}
      message={props.message}
    >
      {props.children}
    </jj-snapshot>
  )
}
