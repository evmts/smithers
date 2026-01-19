import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { jjSnapshot, getJJStatus } from '../../utils/vcs.js'
import { useMountedState, useExecutionMount } from '../../reconciler/hooks.js'
import { useExecutionContext } from '../ExecutionContext.js'
import { useVersionTracking } from '../../reactive-sqlite/index.js'

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
  const { invalidateAndUpdate } = useVersionTracking()

  const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
  const changeIdRef = useRef<string | null>(null)
  const errorRef = useRef<Error | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  const shouldExecute = smithers.executionEnabled && execution.isActive
  useExecutionMount(shouldExecute, () => {
    ;(async () => {
      taskIdRef.current = smithers.db.tasks.start('jj-snapshot')

      try {
        statusRef.current = 'running'
        invalidateAndUpdate()

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
          invalidateAndUpdate()
        }
      } catch (err) {
        if (isMounted()) {
          errorRef.current = err instanceof Error ? err : new Error(String(err))
          statusRef.current = 'error'
          invalidateAndUpdate()
        }
      } finally {
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  }, [props.message, smithers])

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
