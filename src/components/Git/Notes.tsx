import type { ReactNode } from 'react'
import { addGitNotes, getGitNotes } from '../../utils/vcs.js'
import { useGitOperation } from './useGitOperation.js'

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
  const defaultState: NotesState = { status: 'pending', result: null, error: null }
  const { state } = useGitOperation<NotesState>({
    ...(props.id ? { id: props.id } : {}),
    operationType: 'git-notes',
    defaultState,
    deps: [props.append, props.commitRef, props.cwd, props.data, props.onError, props.onFinished],
    execute: async ({ smithers, setState, isMounted }) => {
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
      }
    },
  })
  const { status, result, error } = state

  return (
    <git-notes
      status={status}
      commit-ref={result?.commitRef}
      error={error}
    />
  )
}
