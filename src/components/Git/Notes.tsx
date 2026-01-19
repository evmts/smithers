import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { addGitNotes, getGitNotes } from '../../utils/vcs.js'
import { useMount, useMountedState } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'

interface NotesState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result: NotesResult | null
  error: string | null
}

export interface NotesProps {
  /** Commit reference (default: HEAD) */
  commitRef?: string
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

/**
 * Notes component - adds/appends git notes with smithers tracking
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside
 */
export function Notes(props: NotesProps): ReactNode {
  const smithers = useSmithers()
  const opIdRef = useRef(crypto.randomUUID())
  const stateKey = `git-notes:${opIdRef.current}`

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

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('git-notes')

      try {
        setState({ status: 'running', result: null, error: null })

        const commitRef = props.commitRef ?? 'HEAD'

        // Get existing notes if appending
        const previousNotes = props.append ? await getGitNotes(commitRef) : null

        // Prepare notes content with smithers metadata
        const notesData = {
          smithers: true,
          executionId: smithers.executionId,
          timestamp: Date.now(),
          ...props.data,
        }

        const notesContent = JSON.stringify(notesData, null, 2)

        // Add or append notes
        await addGitNotes(notesContent, commitRef, props.append ?? false)

        const notesResult: NotesResult = {
          commitRef,
          data: notesData,
          previousNotes,
        }

        if (isMounted()) {
          setState({ status: 'complete', result: notesResult, error: null })
          props.onFinished?.(notesResult)
        }

      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setState({ status: 'error', result: null, error: errorObj.message })
          props.onError?.(errorObj)
        }
      } finally {
        // Complete task
        if (taskIdRef.current) {
          smithers.db.tasks.complete(taskIdRef.current)
        }
      }
    })()
  })

  return (
    <git-notes
      status={status}
      commit-ref={result?.commitRef}
      error={error}
    />
  )
}
