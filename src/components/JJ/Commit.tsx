import { useRef, useReducer, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { jjCommit, addGitNotes, getJJDiffStats } from '../../utils/vcs.js'
import { useMountedState, useExecutionMount } from '../../reconciler/hooks.js'
import { useExecutionContext } from '../ExecutionContext.js'

export interface CommitProps {
  message?: string
  autoDescribe?: boolean
  notes?: string
  children?: ReactNode
}

/**
 * JJ Commit component - creates a JJ commit with optional auto-describe.
 *
 * React pattern: Uses useRef + forceUpdate for fire-and-forget VCS ops.
 * Registers with Ralph for task tracking.
 */
export function Commit(props: CommitProps): ReactNode {
  const smithers = useSmithers()
  const execution = useExecutionContext()
  const [, forceUpdate] = useReducer((x) => x + 1, 0)

  const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
  const commitHashRef = useRef<string | null>(null)
  const changeIdRef = useRef<string | null>(null)
  const errorRef = useRef<Error | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  const shouldExecute = smithers.executionEnabled && execution.isActive
  useExecutionMount(shouldExecute, () => {
    ;(async () => {
      taskIdRef.current = smithers.db.tasks.start('jj-commit')

      try {
        statusRef.current = 'running'
        forceUpdate()

        let message = props.message

        if (props.autoDescribe && !message) {
          const diffResult = await Bun.$`jj diff`.text()
          const lines = diffResult.split('\n').length
          message = `Auto-generated commit: ${lines} lines changed`
        }

        if (!message) {
          message = 'Commit by Smithers'
        }

        const result = await jjCommit(message)

        if (!isMounted()) return

        commitHashRef.current = result.commitHash
        changeIdRef.current = result.changeId

        const stats = await getJJDiffStats()

        if (props.notes) {
          await addGitNotes(props.notes)
        }

        await smithers.db.vcs.logCommit({
          vcs_type: 'jj',
          commit_hash: result.commitHash,
          change_id: result.changeId,
          message,
          files_changed: stats.files,
          insertions: stats.insertions,
          deletions: stats.deletions,
          ...(props.notes ? { smithers_metadata: { notes: props.notes } } : {}),
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
  }, [props.autoDescribe, props.message, props.notes, smithers])

  return (
    <jj-commit
      status={statusRef.current}
      commit-hash={commitHashRef.current}
      change-id={changeIdRef.current}
      error={errorRef.current?.message}
      message={props.message}
      auto-describe={props.autoDescribe}
    >
      {props.children}
    </jj-commit>
  )
}
