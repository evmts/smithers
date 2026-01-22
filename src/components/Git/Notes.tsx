import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useExecutionScope } from '../ExecutionScope.js'
import { addGitNotes, getGitNotes } from '../../utils/vcs.js'
import { useMountedState, useExecutionMount } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'
import { makeStateKey } from '../../utils/scope.js'

interface NotesState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result: NotesResult | null
  error: string | null
}

export interface NotesProps {
  /** Stable identifier for resumability */
  id?: string
  /** Commit reference (default: HEAD) */
  commitRef?: string
  /** Repository path (defaults to process.cwd) */
  cwd?: string
  /** Data to store in notes */
  data: Record<string, any>
  /** Append to existing notes instead of replacing */
  append?: boolean
  /** Callback when notes are added */
  onFinished?: (result: NotesResult) => void
  /** Callback on error */
  onError?: (error: Error) => void
}

export interface NotesResult {
  commitRef: string
  data: Record<string, any>
  previousNotes: string | null
}

export function Notes(props: NotesProps): ReactNode {
  const smithers = useSmithers()
  const executionScope = useExecutionScope()
  const opIdRef = useRef(props.id ?? crypto.randomUUID())
  const stateKey = makeStateKey(smithers.executionId ?? 'execution', 'git-notes', opIdRef.current)

  const { data: opState } = useQueryValue<string>(
    smithers.db.db,
    "SELECT value FROM state WHERE key = ?",
    [stateKey]
  )
  const defaultState = { status: 'pending' as const, result: null, error: null }
  const { status, result, error }: NotesState = (() => {
    if (!opState) return defaultState
    try { return JSON.parse(opState) }
    catch { return defaultState }
  })()

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  const setState = (newState: NotesState) => {
    smithers.db.state.set(stateKey, newState, 'git-notes')
  }

  const shouldExecute = smithers.executionEnabled && executionScope.enabled
  useExecutionMount(shouldExecute, () => {
    ;(async () => {
      if (status !== 'pending') return
      taskIdRef.current = smithers.db.tasks.start('git-notes', undefined, { scopeId: executionScope.scopeId })

      try {
        setState({ status: 'running', result: null, error: null })

        const commitRef = props.commitRef ?? 'HEAD'
        const previousNotes = props.append ? await getGitNotes(commitRef, props.cwd) : null

        const notesData = {
          smithers: true,
          executionId: smithers.executionId,
          timestamp: Date.now(),
          ...props.data,
        }

        const notesContent = JSON.stringify(notesData, null, 2)
        await addGitNotes(notesContent, commitRef, props.append ?? false, props.cwd)

        const notesResult: NotesResult = {
          commitRef,
          data: notesData,
          previousNotes,
        }

        setState({ status: 'complete', result: notesResult, error: null })
        if (isMounted()) {
          props.onFinished?.(notesResult)
        }

      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setState({ status: 'error', result: null, error: errorObj.message })
        if (isMounted()) {
          props.onError?.(errorObj)
        }
      } finally {
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  }, [props.append, props.commitRef, props.cwd, props.data, props.onError, props.onFinished, smithers])

  return (
    <git-notes
      status={status}
      commit-ref={result?.commitRef}
      error={error}
    />
  )
}
