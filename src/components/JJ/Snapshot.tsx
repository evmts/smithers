import type { ReactNode } from 'react'
import { jjSnapshot, getJJStatus } from '../../utils/vcs.js'
import { useJJOperation } from './useJJOperation.js'

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
  const defaultState: SnapshotState = { status: 'pending', changeId: null, error: null }
  const { state } = useJJOperation<SnapshotState>({
    ...(props.id ? { id: props.id } : {}),
    operationType: 'jj-snapshot',
    defaultState,
    deps: [props.message],
    execute: async ({ smithers, setState }) => {
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
      }
    },
  })
  const { status, changeId, error } = state

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
