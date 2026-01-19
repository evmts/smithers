// OnCIFailure hook component - polls CI status and triggers children on failure
// Currently supports GitHub Actions

import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useMount, useUnmount } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'

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
interface CIFailureState {
  ciStatus: 'idle' | 'polling' | 'failed' | 'error'
  currentFailure: CIFailure | null
  triggered: boolean
  error: string | null
  processedRunIds: number[]
}

const DEFAULT_CI_STATE: CIFailureState = {
  ciStatus: 'idle',
  currentFailure: null,
  triggered: false,
  error: null,
  processedRunIds: [],
}

export function OnCIFailure(props: OnCIFailureProps): ReactNode {
  const { db, reactiveDb } = useSmithers()

  // Query state from db.state reactively
  const { data: stateJson } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'hook:ciFailure'"
  )
  const state: CIFailureState = (() => {
    if (!stateJson) return DEFAULT_CI_STATE
    try { return JSON.parse(stateJson) }
    catch { return DEFAULT_CI_STATE }
  })()
  const { ciStatus, currentFailure, triggered, error } = state

  const taskIdRef = useRef<string | null>(null)

  const intervalMs = props.pollInterval ?? 30000
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useMount(() => {
    // Initialize state if not present
    const currentState = db.state.get<CIFailureState>('hook:ciFailure')
    if (!currentState) {
      db.state.set('hook:ciFailure', DEFAULT_CI_STATE, 'ci-failure-init')
    }

    // Fire-and-forget async IIFE pattern
    ;(async () => {
      const s = db.state.get<CIFailureState>('hook:ciFailure') ?? DEFAULT_CI_STATE
      db.state.set('hook:ciFailure', { ...s, ciStatus: 'polling' }, 'ci-failure-polling')

      // Define the polling function
      const checkCI = async () => {
        try {
          if (props.provider !== 'github-actions') {
            const currentS = db.state.get<CIFailureState>('hook:ciFailure') ?? DEFAULT_CI_STATE
            db.state.set('hook:ciFailure', { 
              ...currentS, 
              error: `Unsupported CI provider: ${props.provider}` 
            }, 'ci-failure-error')
            return
          }

          const run = await fetchLatestGitHubActionsRun()

          if (!run) {
            return
          }

          const currentS = db.state.get<CIFailureState>('hook:ciFailure') ?? DEFAULT_CI_STATE
          const processedSet = new Set(currentS.processedRunIds)

          // Check if this is a new failure
          if (
            run.status === 'completed' &&
            run.conclusion === 'failure' &&
            !processedSet.has(run.databaseId)
          ) {
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

            // Update state with new failure and processed ID
            db.state.set('hook:ciFailure', {
              ...currentS,
              ciStatus: 'failed',
              currentFailure: failure,
              triggered: true,
              processedRunIds: [...currentS.processedRunIds, run.databaseId],
            }, 'ci-failure-triggered')

            // Call onFailure callback
            props.onFailure?.(failure)

            // Register task for tracking - children will handle completion
            taskIdRef.current = db.tasks.start('ci-failure-hook')
            // Complete immediately as children handle their own task registration
            db.tasks.complete(taskIdRef.current)

            // Log to db state
            db.state.set('last_ci_failure', failure, 'ci-failure-hook')
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          const currentS = db.state.get<CIFailureState>('hook:ciFailure') ?? DEFAULT_CI_STATE
          db.state.set('hook:ciFailure', { 
            ...currentS, 
            error: errorMsg, 
            ciStatus: 'error' 
          }, 'ci-failure-error')
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
