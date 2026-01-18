// OnCIFailure hook component - polls CI status and triggers children on failure
// Currently supports GitHub Actions

import { useState, useRef, useContext, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider'
import { RalphContext } from '../Ralph'
import { useMount, useUnmount } from '../../reconciler/hooks'

export interface CIFailure {
  failed: boolean
  runId?: string
  workflowName?: string
  failedJobs?: string[]
  logs?: string
}

export interface OnCIFailureProps {
  children: ReactNode
  /**
   * CI provider (currently only github-actions supported)
   */
  provider: 'github-actions'
  /**
   * Polling interval in milliseconds (default: 30000ms / 30s)
   */
  pollInterval?: number
  /**
   * Callback when a CI failure is detected
   */
  onFailure?: (failure: CIFailure) => void
}

interface GitHubActionsRun {
  status: string
  conclusion: string | null
  databaseId: number
  name: string
}

/**
 * Fetch the latest GitHub Actions run for the main branch
 */
async function fetchLatestGitHubActionsRun(): Promise<GitHubActionsRun | null> {
  try {
    const result = await Bun.$`gh run list --branch main --limit 1 --json status,conclusion,databaseId,name`.json()

    if (Array.isArray(result) && result.length > 0) {
      return result[0] as GitHubActionsRun
    }
    return null
  } catch (err) {
    console.error('[OnCIFailure] Failed to fetch GitHub Actions status:', err)
    return null
  }
}

/**
 * Fetch failed job names from a GitHub Actions run
 */
async function fetchFailedJobs(runId: number): Promise<string[]> {
  try {
    const result = await Bun.$`gh run view ${runId} --json jobs`.json() as { jobs: Array<{ name: string; conclusion: string }> }

    if (result.jobs) {
      return result.jobs
        .filter((job) => job.conclusion === 'failure')
        .map((job) => job.name)
    }
    return []
  } catch {
    return []
  }
}

/**
 * Fetch logs from a failed GitHub Actions run
 */
async function fetchRunLogs(runId: number): Promise<string> {
  try {
    const result = await Bun.$`gh run view ${runId} --log-failed 2>/dev/null`.text()
    // Truncate if too long (keep last 5000 chars)
    if (result.length > 5000) {
      return '... [truncated]\n' + result.slice(-5000)
    }
    return result
  } catch {
    return ''
  }
}

/**
 * OnCIFailure - Hook component that triggers on CI failures
 *
 * Polls GitHub Actions status and renders children when a failure is detected.
 * Keeps track of processed run IDs to avoid re-triggering on the same failure.
 *
 * Usage:
 * ```tsx
 * <OnCIFailure
 *   provider="github-actions"
 *   pollInterval={60000}
 *   onFailure={(failure) => console.log('CI failed:', failure)}
 * >
 *   <Claude>The CI has failed. Analyze the logs and fix the issue.</Claude>
 * </OnCIFailure>
 * ```
 */
export function OnCIFailure(props: OnCIFailureProps): ReactNode {
  const smithers = useSmithers()
  const ralph = useContext(RalphContext)

  const [ciStatus, setCIStatus] = useState<'idle' | 'polling' | 'failed' | 'error'>('idle')
  const [currentFailure, setCurrentFailure] = useState<CIFailure | null>(null)
  const [triggered, setTriggered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track processed run IDs to avoid re-triggering
  const processedRunIdsRef = useRef(new Set<number>())

  const intervalMs = props.pollInterval ?? 30000
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useMount(() => {
    const processedRunIds = processedRunIdsRef.current

    // Fire-and-forget async IIFE pattern
    ;(async () => {
      setCIStatus('polling')

      // Load previously processed run IDs from db state
      try {
        const processed = await smithers.db.state.get<number[]>('ci_processed_run_ids')
        if (processed) {
          processed.forEach((id) => processedRunIds.add(id))
        }
      } catch {
        // Ignore - starting fresh
      }

      // Define the polling function
      const checkCI = async () => {
        try {
          if (props.provider !== 'github-actions') {
            setError(`Unsupported CI provider: ${props.provider}`)
            return
          }

          const run = await fetchLatestGitHubActionsRun()

          if (!run) {
            return
          }

          // Check if this is a new failure
          if (
            run.status === 'completed' &&
            run.conclusion === 'failure' &&
            !processedRunIds.has(run.databaseId)
          ) {
            // Mark as processed
            processedRunIds.add(run.databaseId)

            // Persist processed IDs
            await smithers.db.state.set(
              'ci_processed_run_ids',
              Array.from(processedRunIds),
              'ci-failure-hook'
            )

            // Fetch additional failure details
            const failedJobs = await fetchFailedJobs(run.databaseId)
            const logs = await fetchRunLogs(run.databaseId)

            const failure: CIFailure = {
              failed: true,
              runId: String(run.databaseId),
              workflowName: run.name,
              failedJobs,
              logs,
            }

            setCurrentFailure(failure)
            setCIStatus('failed')
            setTriggered(true)

            // Call onFailure callback
            props.onFailure?.(failure)

            // Register with Ralph for task tracking
            if (ralph) {
              ralph.registerTask()
              // Children will handle their own task completion
              ralph.completeTask()
            }

            // Log to db state
            await smithers.db.state.set('last_ci_failure', failure, 'ci-failure-hook')
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          setError(errorMsg)
          setCIStatus('error')
          console.error('[OnCIFailure] Polling error:', errorMsg)
        }
      }

      // Initial check
      await checkCI()

      // Start polling
      pollIntervalRef.current = setInterval(checkCI, intervalMs)
    })()
  })

  useUnmount(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
  })

  return (
    <ci-failure-hook
      provider={props.provider}
      status={ciStatus}
      triggered={triggered}
      run-id={currentFailure?.runId}
      workflow-name={currentFailure?.workflowName}
      failed-jobs={currentFailure?.failedJobs?.join(', ')}
      poll-interval={intervalMs}
      error={error}
    >
      {triggered ? props.children : null}
    </ci-failure-hook>
  )
}
