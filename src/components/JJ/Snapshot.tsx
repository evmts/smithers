import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useExecutionScope } from '../ExecutionScope.js'
import { jjSnapshot, getJJStatus } from '../../utils/vcs.js'
import { useExecutionMount } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'
import { makeStateKey } from '../../utils/scope.js'

export interface SnapshotProps {
  id?: string
  message?: string
  children?: ReactNode
}

interface SnapshotState {
  status: 'pending' | 'running' | 'complete' | 'error'
  changeId: string | null
  error: string | null
}

export function Snapshot(props: SnapshotProps): ReactNode {
  const smithers = useSmithers()
  const executionScope = useExecutionScope()
  const opIdRef = useRef(props.id ?? crypto.randomUUID())
  const stateKey = makeStateKey(smithers.executionId ?? 'execution', 'jj-snapshot', opIdRef.current)

  const { data: opState } = useQueryValue<string>(
    smithers.db.db,
    'SELECT value FROM state WHERE key = ?',
    [stateKey]
  )
  const defaultState: SnapshotState = { status: 'pending', changeId: null, error: null }
  const { status, changeId, error } = (() => {
    if (!opState) return defaultState
    try { return JSON.parse(opState) as SnapshotState }
    catch { return defaultState }
  })()

  const taskIdRef = useRef<string | null>(null)
  const shouldExecute = smithers.executionEnabled && executionScope.enabled

  const setState = (newState: SnapshotState) => {
    smithers.db.state.set(stateKey, newState, 'jj-snapshot')
  }

  useExecutionMount(shouldExecute, () => {
    ;(async () => {
      if (status !== 'pending') return
      taskIdRef.current = smithers.db.tasks.start('jj-snapshot', undefined, { scopeId: executionScope.scopeId })

      try {
        setState({ status: 'running', changeId: null, error: null })

        const result = await jjSnapshot(props.message)
        const fileStatus = await getJJStatus()

        await smithers.db.vcs.logSnapshot({
          change_id: result.changeId,
          description: result.description,
          files_modified: fileStatus.modified,
          files_added: fileStatus.added,
          files_deleted: fileStatus.deleted,
        })

        setState({ status: 'complete', changeId: result.changeId, error: null })
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setState({ status: 'error', changeId: null, error: errorObj.message })
      } finally {
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  }, [props.message, smithers, status, shouldExecute])

  return (
    <jj-snapshot
      status={status}
      change-id={changeId ?? undefined}
      error={error ?? undefined}
      message={props.message}
    >
      {props.children}
    </jj-snapshot>
  )
}
