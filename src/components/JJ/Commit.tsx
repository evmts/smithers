import { useState, useEffect, useContext, type ReactNode } from 'react'
import { RalphContext } from '../Ralph'
import { useSmithers } from '../../orchestrator/components/SmithersProvider'
import { jjCommit, addGitNotes, getJJDiffStats } from '../../utils/vcs'

export interface CommitProps {
  message?: string
  autoDescribe?: boolean
  notes?: string
  children?: ReactNode
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
 * React pattern: Uses useEffect with empty deps and async IIFE inside.
 * Registers with Ralph for task tracking.
 */
export function Commit(props: CommitProps): ReactNode {
  const ralph = useContext(RalphContext)
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [commitHash, setCommitHash] = useState<string | null>(null)
  const [changeId, setChangeId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    // Fire-and-forget async IIFE
    ;(async () => {
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

        if (cancelled) return

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

        if (!cancelled) {
          setStatus('complete')
        }
      } catch (err) {
        if (!cancelled) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
        }
      } finally {
        ralph?.completeTask()
      }
    })()

    return () => { cancelled = true }
  }, [])

  return (
    <jj-commit
      status={status}
      commit-hash={commitHash}
      change-id={changeId}
      error={error?.message}
      message={props.message}
      auto-describe={props.autoDescribe}
    >
      {props.children}
    </jj-commit>
  )
}
