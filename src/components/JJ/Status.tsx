import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useExecutionScope } from '../ExecutionScope.js'
import { getJJStatus } from '../../utils/vcs.js'
import { useMountedState, useExecutionMount } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'
import { makeStateKey } from '../../utils/scope.js'

export interface StatusProps {
  id?: string
  onDirty?: (status: { modified: string[]; added: string[]; deleted: string[] }) => void
  onClean?: () => void
  children?: ReactNode
}

/**
 * JJ Status component - checks JJ working copy status.
 *
 * React pattern: Uses refs + version tracking for fire-and-forget VCS ops.
 * Registers with Ralph for task tracking.
 */
interface StatusState {
  status: 'pending' | 'running' | 'complete' | 'error'
  fileStatus: { modified: string[]; added: string[]; deleted: string[] } | null
  isDirty: boolean | null
  error: string | null
}

export function Status(props: StatusProps): ReactNode {
  const smithers = useSmithers()
  const executionScope = useExecutionScope()
  const opIdRef = useRef(props.id ?? crypto.randomUUID())
  const stateKey = makeStateKey(smithers.executionId ?? 'execution', 'jj-status', opIdRef.current)

  const { data: opState } = useQueryValue<string>(
    smithers.db.db,
    'SELECT value FROM state WHERE key = ?',
    [stateKey]
  )
  const defaultState: StatusState = { status: 'pending', fileStatus: null, isDirty: null, error: null }
  const { status, fileStatus, isDirty, error } = (() => {
    if (!opState) return defaultState
    try { return JSON.parse(opState) as StatusState }
    catch { return defaultState }
  })()

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()
  const shouldExecute = smithers.executionEnabled && executionScope.enabled

  const setState = (newState: StatusState) => {
    smithers.db.state.set(stateKey, newState, 'jj-status')
  }

  useExecutionMount(shouldExecute, () => {
    ;(async () => {
      if (status !== 'pending') return
      taskIdRef.current = smithers.db.tasks.start('jj-status', undefined, { scopeId: executionScope.scopeId })

      try {
        setState({ status: 'running', fileStatus: null, isDirty: null, error: null })

        const jjStatus = await getJJStatus()

        const dirty =
          jjStatus.modified.length > 0 ||
          jjStatus.added.length > 0 ||
          jjStatus.deleted.length > 0

        if (isMounted()) {
          if (dirty) {
            props.onDirty?.(jjStatus)
          } else {
            props.onClean?.()
          }
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

        setState({ status: 'complete', fileStatus: jjStatus, isDirty: dirty, error: null })
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setState({ status: 'error', fileStatus: null, isDirty: null, error: errorObj.message })
      } finally {
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  }, [props.onClean, props.onDirty, smithers, status, shouldExecute])

  return (
    <jj-status
      status={status}
      is-dirty={isDirty ?? undefined}
      modified={fileStatus?.modified?.join(',')}
      added={fileStatus?.added?.join(',')}
      deleted={fileStatus?.deleted?.join(',')}
      error={error ?? undefined}
    >
      {props.children}
    </jj-status>
  )
}
