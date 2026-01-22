import type { ReactNode } from 'react'
import { jjCommit, addGitNotes, getJJDiffStats } from '../../utils/vcs.js'
import { useJJOperation } from './useJJOperation.js'

export interface CommitProps {
  id?: string
  message?: string
  autoDescribe?: boolean
  notes?: string
  children?: ReactNode
}

interface CommitState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result: { commitHash: string; changeId: string } | null
  error: string | null
}

export function Commit(props: CommitProps): ReactNode {
  const defaultState: CommitState = { status: 'pending', result: null, error: null }
  const { state } = useJJOperation<CommitState>({
    ...(props.id ? { id: props.id } : {}),
    operationType: 'jj-commit',
    defaultState,
    deps: [props.autoDescribe, props.message, props.notes],
    execute: async ({ smithers, setState }) => {
      try {
        setState({ status: 'running', result: null, error: null })

        let message = props.message

        if (props.autoDescribe && !message) {
          const diffResult = await Bun.$`jj diff`.text()
          const lines = diffResult.split('\n').length
          message = `Auto-generated commit: ${lines} lines changed`
        }

        if (!message) {
          message = 'Commit by Smithers'
        }

        const commitResult = await jjCommit(message)

        const stats = await getJJDiffStats()

        if (props.notes) {
          await addGitNotes(props.notes)
        }

        await smithers.db.vcs.logCommit({
          vcs_type: 'jj',
          commit_hash: commitResult.commitHash,
          change_id: commitResult.changeId,
          message,
          files_changed: stats.files,
          insertions: stats.insertions,
          deletions: stats.deletions,
          ...(props.notes ? { smithers_metadata: { notes: props.notes } } : {}),
        })

        setState({ status: 'complete', result: { commitHash: commitResult.commitHash, changeId: commitResult.changeId }, error: null })
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setState({ status: 'error', result: null, error: errorObj.message })
      }
    },
  })
  const { status, result, error } = state

  return (
    <jj-commit
      status={status}
      commit-hash={result?.commitHash}
      change-id={result?.changeId}
      error={error ?? undefined}
      message={props.message}
      auto-describe={props.autoDescribe}
    >
      {props.children}
    </jj-commit>
  )
}
