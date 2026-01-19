import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useExecuteOnActive } from '../ExecutionContext.js'
import { addGitNotes, getCommitHash, getDiffStats } from '../../utils/vcs.js'
import { useMountedState } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'
import { extractText } from '../../utils/extract-text.js'

interface CommitState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result: CommitResult | null
  error: string | null
}

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
  const smithers = useSmithers()
  const opIdRef = useRef(crypto.randomUUID())
  const stateKey = `git-commit:${opIdRef.current}`

  const { data: opState } = useQueryValue<string>(
    smithers.db.db,
    "SELECT value FROM state WHERE key = ?",
    [stateKey]
  )
  const defaultState = { status: 'pending' as const, result: null, error: null }
  const { status, result, error }: CommitState = (() => {
    if (!opState) return defaultState
    try { return JSON.parse(opState) }
    catch { return defaultState }
  })()

  const taskIdRef = useRef<string | null>(null)
  const isMounted = useMountedState()

  const setState = (newState: CommitState) => {
    smithers.db.state.set(stateKey, newState, 'git-commit')
  }

  useExecuteOnActive(() => {
    // Fire-and-forget async IIFE
    ;(async () => {
      // Register task with database
      taskIdRef.current = smithers.db.tasks.start('git-commit')

      try {
        setState({ status: 'running', result: null, error: null })

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
          message = extractText(props.children)
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
          setState({ status: 'complete', result: commitResult, error: null })
          props.onFinished?.(commitResult)
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
    <git-commit
      status={status}
      commit-hash={result?.commitHash}
      message={result?.message}
      error={error}
    >
      {props.children}
    </git-commit>
  )
}
