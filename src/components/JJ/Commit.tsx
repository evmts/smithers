import { createSignal, onMount, useContext, type JSX } from 'solid-js'
import { RalphContext } from '../Ralph'
import { useSmithers } from '../../../smithers-orchestrator/src/components/SmithersProvider'
import { jjCommit, addGitNotes, getJJDiffStats } from '../../utils/vcs'

export interface CommitProps {
  message?: string
  autoDescribe?: boolean
  notes?: string
  children?: JSX.Element
}

/**
 * Generate commit message using Claude based on diff.
 * This is a placeholder - will integrate with actual Claude SDK.
 */
async function generateCommitMessage(diff: string): Promise<string> {
  // TODO: Integrate with Claude SDK for auto-describe
  if (process.env.NODE_ENV === 'test' || process.env.MOCK_MODE === 'true') {
    return `Auto-generated commit message for diff with ${diff.split('\n').length} lines`
  }

  // For now, return a generic message
  return 'Changes made by Smithers orchestration'
}

/**
 * JJ Commit component - creates a JJ commit with optional auto-describe.
 *
 * Uses the fire-and-forget async IIFE pattern in onMount.
 * Registers with Ralph for task tracking.
 */
export function Commit(props: CommitProps): JSX.Element {
  const ralph = useContext(RalphContext)
  const smithers = useSmithers()
  const [status, setStatus] = createSignal<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [commitHash, setCommitHash] = createSignal<string | null>(null)
  const [changeId, setChangeId] = createSignal<string | null>(null)
  const [error, setError] = createSignal<Error | null>(null)

  onMount(() => {
    // Fire-and-forget async IIFE
    (async () => {
      ralph?.registerTask()

      try {
        setStatus('running')

        let message = props.message

        // Auto-describe using Claude if requested
        if (props.autoDescribe && !message) {
          const diffResult = await Bun.$`jj diff`.text()
          message = await generateCommitMessage(diffResult)
        }

        // Default message if still none
        if (!message) {
          message = 'Commit by Smithers'
        }

        // Create JJ commit
        const result = await jjCommit(message)
        setCommitHash(result.commitHash)
        setChangeId(result.changeId)

        // Get diff stats for logging
        const stats = await getJJDiffStats()

        // Add git notes with smithers metadata if provided
        if (props.notes) {
          await addGitNotes(props.notes)
        }

        // Log to database
        await smithers.db.vcs.logCommit({
          vcs_type: 'jj',
          commit_hash: result.commitHash,
          change_id: result.changeId,
          message,
          files_changed: stats.files,
          insertions: stats.insertions,
          deletions: stats.deletions,
          smithers_metadata: props.notes ? { notes: props.notes } : undefined,
        })

        setStatus('complete')
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setError(errorObj)
        setStatus('error')
      } finally {
        ralph?.completeTask()
      }
    })()
  })

  return (
    <jj-commit
      status={status()}
      commit-hash={commitHash()}
      change-id={changeId()}
      error={error()?.message}
      message={props.message}
      auto-describe={props.autoDescribe}
    >
      {props.children}
    </jj-commit>
  )
}
