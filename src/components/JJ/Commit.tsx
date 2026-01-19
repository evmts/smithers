import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useExecutionScope } from '../ExecutionScope.js'
import { jjCommit, addGitNotes, getJJDiffStats } from '../../utils/vcs.js'
import { useExecutionMount } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'
import { makeStateKey } from '../../utils/scope.js'

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

/**
 * JJ Commit component - creates a JJ commit with optional auto-describe.
 *
 * React pattern: Uses db.state for resumability and task tracking.
 */
export function Commit(props: CommitProps): ReactNode {
  const smithers = useSmithers()
  const executionScope = useExecutionScope()
  const opIdRef = useRef(props.id ?? crypto.randomUUID())
  const stateKey = makeStateKey(smithers.executionId ?? 'execution', 'jj-commit', opIdRef.current)

  const { data: opState } = useQueryValue<string>(
    smithers.db.db,
    'SELECT value FROM state WHERE key = ?',
    [stateKey]
  )
  const defaultState: CommitState = { status: 'pending', result: null, error: null }
  const { status, result, error } = (() => {
    if (!opState) return defaultState
    try { return JSON.parse(opState) as CommitState }
    catch { return defaultState }
  })()

  const taskIdRef = useRef<string | null>(null)
  const shouldExecute = smithers.executionEnabled && executionScope.enabled

  const setState = (newState: CommitState) => {
    smithers.db.state.set(stateKey, newState, 'jj-commit')
  }

  useExecutionMount(shouldExecute, () => {
    ;(async () => {
      if (status !== 'pending') return
      taskIdRef.current = smithers.db.tasks.start('jj-commit', undefined, { scopeId: executionScope.scopeId })

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
      } finally {
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  }, [props.autoDescribe, props.message, props.notes, smithers, status, shouldExecute])

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
