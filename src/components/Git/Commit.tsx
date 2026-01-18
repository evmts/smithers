import { useState, useContext, type ReactNode } from 'react'
import { RalphContext } from '../Ralph'
import { useSmithers } from '../../orchestrator/components/SmithersProvider'
import { addGitNotes, getCommitHash, getDiffStats } from '../../utils/vcs'
import { useMount, useMountedState } from '../../reconciler/hooks'

export interface CommitProps {
  /** Commit message (optional if autoGenerate is true) */
  message?: string
  /** Auto-generate commit message using Claude */
  autoGenerate?: boolean
  /** Metadata to store in git notes */
  notes?: Record<string, any>
  /** Specific files to stage (default: all with -A) */
  files?: string[]
  /** Stage all tracked files with -a flag */
  all?: boolean
  /** Children content (used as message if message prop not provided) */
  children?: ReactNode
  /** Callback when commit is complete */
  onFinished?: (result: CommitResult) => void
  /** Callback on error */
  onError?: (error: Error) => void
}

export interface CommitResult {
  commitHash: string
  message: string
  filesChanged: string[]
  insertions: number
  deletions: number
}

/**
 * Generate commit message using Claude CLI
 */
async function generateCommitMessage(): Promise<string> {
  // Get the diff for context
  const diffResult = await Bun.$`git diff --cached --stat`.text()
  const diffContent = await Bun.$`git diff --cached`.text()

  const prompt = `Generate a concise git commit message for these changes. Return ONLY the commit message, nothing else.

Staged files:
${diffResult}

Diff:
${diffContent.slice(0, 5000)}${diffContent.length > 5000 ? '\n...(truncated)' : ''}`

  // Use claude CLI with --print to get the response
  const result = await Bun.$`claude --print --prompt ${prompt}`.text()
  return result.trim()
}

/**
 * Commit component - creates a git commit with smithers metadata
 *
 * React pattern: Uses useEffect with empty deps and async IIFE inside
 */
export function Commit(props: CommitProps): ReactNode {
  const ralph = useContext(RalphContext)
  const smithers = useSmithers()
  const [status, setStatus] = useState<'pending' | 'running' | 'complete' | 'error'>('pending')
  const [result, setResult] = useState<CommitResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const isMounted = useMountedState()

  useMount(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      ralph?.registerTask()

      try {
        setStatus('running')

        // Stage files
        if (props.files && props.files.length > 0) {
          // Stage specific files
          for (const file of props.files) {
            await Bun.$`git add ${file}`.quiet()
          }
        } else {
          // Stage all files with -A
          await Bun.$`git add -A`.quiet()
        }

        // Get or generate commit message
        let message = props.message

        if (!message && props.children) {
          // Use children content as message
          message = String(props.children)
        }

        if (!message && props.autoGenerate) {
          message = await generateCommitMessage()
        }

        if (!message) {
          throw new Error('No commit message provided and autoGenerate is false')
        }

        // Create commit
        const commitFlag = props.all ? '-a' : ''
        if (commitFlag) {
          await Bun.$`git commit -a -m ${message}`.quiet()
        } else {
          await Bun.$`git commit -m ${message}`.quiet()
        }

        if (!isMounted()) return

        // Get commit info
        const commitHash = await getCommitHash('HEAD')
        const diffStats = await getDiffStats('HEAD~1')

        // Add git notes with smithers metadata
        const notesData = {
          smithers: true,
          executionId: smithers.executionId,
          timestamp: Date.now(),
          ...props.notes,
        }

        await addGitNotes(JSON.stringify(notesData, null, 2), 'HEAD', false)

        // Log to database
        await smithers.db.vcs.logCommit({
          vcs_type: 'git',
          commit_hash: commitHash,
          message,
          files_changed: diffStats.files,
          insertions: diffStats.insertions,
          deletions: diffStats.deletions,
          smithers_metadata: notesData,
        })

        const commitResult: CommitResult = {
          commitHash,
          message,
          filesChanged: diffStats.files,
          insertions: diffStats.insertions,
          deletions: diffStats.deletions,
        }

        if (isMounted()) {
          setResult(commitResult)
          setStatus('complete')
          props.onFinished?.(commitResult)
        }

      } catch (err) {
        if (isMounted()) {
          const errorObj = err instanceof Error ? err : new Error(String(err))
          setError(errorObj)
          setStatus('error')
          props.onError?.(errorObj)
        }
      } finally {
        ralph?.completeTask()
      }
    })()
  })

  return (
    <git-commit
      status={status}
      commit-hash={result?.commitHash}
      message={result?.message}
      error={error?.message}
    >
      {props.children}
    </git-commit>
  )
}
