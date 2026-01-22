import type { ReactNode } from 'react'
import { getJJStatus } from '../../utils/vcs.js'
import { useJJOperation } from './useJJOperation.js'

export interface StatusProps {
  id?: string
  onDirty?: (status: { modified: string[]; added: string[]; deleted: string[] }) => void
  onClean?: () => void
  children?: ReactNode
}

interface StatusState {
  status: 'pending' | 'running' | 'complete' | 'error'
  fileStatus: { modified: string[]; added: string[]; deleted: string[] } | null
  isDirty: boolean | null
  error: string | null
}

export function Status(props: StatusProps): ReactNode {
  const defaultState: StatusState = { status: 'pending', fileStatus: null, isDirty: null, error: null }
  const { state } = useJJOperation<StatusState>({
    ...(props.id ? { id: props.id } : {}),
    operationType: 'jj-status',
    defaultState,
    deps: [props.onClean, props.onDirty],
    execute: async ({ smithers, setState, isMounted }) => {
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
      }
    },
  })
  const { status, fileStatus, isDirty, error } = state

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
