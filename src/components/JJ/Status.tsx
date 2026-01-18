import { useRef, useReducer, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { getJJStatus } from '../../utils/vcs.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'
import { useExecutionContext } from '../ExecutionContext.js'

export interface StatusProps {
  onDirty?: (status: { modified: string[]; added: string[]; deleted: string[] }) => void
  onClean?: () => void
  children?: ReactNode
}

/**
 * JJ Status component - checks JJ working copy status.
 *
 * React pattern: Uses useRef + forceUpdate for fire-and-forget VCS ops.
 * Registers with Ralph for task tracking.
 */
export function Status(props: StatusProps): ReactNode {
  const smithers = useSmithers()
  const execution = useExecutionContext()
  const [, forceUpdate] = useReducer((x) => x + 1, 0)

  const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
  const isDirtyRef = useRef<boolean | null>(null)
  const fileStatusRef = useRef<{
    modified: string[]
    added: string[]
    deleted: string[]
  } | null>(null)
  const errorRef = useRef<Error | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  useMount(() => {
    if (!execution.isActive) return
    ;(async () => {
      taskIdRef.current = smithers.db.tasks.start('jj-status')

      try {
        statusRef.current = 'running'
        forceUpdate()

        const jjStatus = await getJJStatus()

        if (!isMounted()) return

        fileStatusRef.current = jjStatus

        const dirty =
          jjStatus.modified.length > 0 ||
          jjStatus.added.length > 0 ||
          jjStatus.deleted.length > 0

        isDirtyRef.current = dirty

        if (dirty) {
          props.onDirty?.(jjStatus)
        } else {
          props.onClean?.()
        }

        if (isMounted()) {
          statusRef.current = 'complete'
          forceUpdate()
        }

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
    <jj-status
      status={statusRef.current}
      is-dirty={isDirtyRef.current}
      modified={fileStatusRef.current?.modified?.join(',')}
      added={fileStatusRef.current?.added?.join(',')}
      deleted={fileStatusRef.current?.deleted?.join(',')}
      error={errorRef.current?.message}
    >
      {props.children}
    </jj-status>
  )
}
