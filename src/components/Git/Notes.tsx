import { createSignal, onMount, useContext, type JSX } from 'solid-js'
import { RalphContext } from '../Ralph'
import { useSmithers } from '../../../smithers-orchestrator/src/components/SmithersProvider'
import { addGitNotes, getGitNotes } from '../../utils/vcs'

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
 * CRITICAL PATTERN: Uses fire-and-forget async IIFE in onMount
 */
export function Notes(props: NotesProps): JSX.Element {
  const ralph = useContext(RalphContext)
  const smithers = useSmithers()
  const [status, setStatus] = createSignal<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [result, setResult] = createSignal<NotesResult | null>(null)
  const [error, setError] = createSignal<Error | null>(null)

  onMount(() => {
    // Fire-and-forget async IIFE
    (async () => {
      ralph?.registerTask()

      try {
        setStatus('running')

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

        setResult(notesResult)
        setStatus('complete')
        props.onFinished?.(notesResult)

      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setError(errorObj)
        setStatus('error')
        props.onError?.(errorObj)
      } finally {
        ralph?.completeTask()
      }
    })()
  })

  return (
    <git-notes
      status={status()}
      commit-ref={result()?.commitRef}
      error={error()?.message}
    />
  )
}
