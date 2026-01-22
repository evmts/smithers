// OnCIFailure hook component - polls CI status and triggers children on failure
// Currently supports GitHub Actions

import { useRef, type ReactNode } from 'react'
import { useSmithers } from '../SmithersProvider.js'
import { useUnmount, useExecutionMount, useEffectOnValueChange } from '../../reconciler/hooks.js'
import { useQueryValue } from '../../reactive-sqlite/index.js'
import { useExecutionScope } from '../ExecutionScope.js'
import { makeStateKey } from '../../utils/scope.js'

export interface CIFailure {
  failed: boolean
  runId?: string
  workflowName?: string
  failedJobs?: string[]
  logs?: string
}

export interface OnCIFailureProps {
  /**
   * Content to render when a failure is detected.
   * Can be a render prop function that receives the failure object.
   */
  children: ReactNode | ((failure: CIFailure) => ReactNode)
  /**
   * CI provider (currently only github-actions supported)
   */
  provider: 'github-actions'
  /**
   * Branch to monitor (defaults to repo default branch when available)
   */
  branch?: string
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
 * Fetch the latest GitHub Actions run for a branch
 */
async function fetchLatestGitHubActionsRun(branch: string): Promise<GitHubActionsRun | null> {
  const result = await Bun.$`gh run list --branch ${branch} --limit 1 --json status,conclusion,databaseId,name`.json()

  if (Array.isArray(result) && result.length > 0) {
    return result[0] as GitHubActionsRun
  }
  return null
}

async function resolveDefaultBranch(): Promise<string | null> {
  try {
    const remoteHead = await Bun.$`git symbolic-ref --quiet --short refs/remotes/origin/HEAD`.text()
    const trimmed = remoteHead.trim()
    if (trimmed) {
      return trimmed.replace(/^origin\//, '')
    }
  } catch {}

  try {
    const current = await Bun.$`git rev-parse --abbrev-ref HEAD`.text()
    const trimmed = current.trim()
    if (trimmed && trimmed !== 'HEAD') {
      return trimmed
    }
  } catch {}

  return null
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

const MAX_PROCESSED_RUNS = 50

export function OnCIFailure(props: OnCIFailureProps): ReactNode {
  const { db, reactiveDb, executionEnabled, executionId } = useSmithers()
  const executionScope = useExecutionScope()
  const stateKey = makeStateKey(executionId, 'hook', 'ciFailure')
  const lastFailureKey = makeStateKey(executionId, 'hook', 'lastCIFailure')

  // Query state from db.state reactively
  const { data: stateJson } = useQueryValue<string>(
    reactiveDb,
    'SELECT value FROM state WHERE key = ?',
    [stateKey]
  )
  const state: CIFailureState = (() => {
    if (!stateJson) {
      return db.state.get<CIFailureState>(stateKey) ?? DEFAULT_CI_STATE
    }
    try { return JSON.parse(stateJson) }
    catch { return DEFAULT_CI_STATE }
  })()
  const { ciStatus, currentFailure, triggered, error } = state

  const taskIdRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)
  const branchRef = useRef<string | null>(props.branch ?? null)

  const intervalMs = props.pollInterval ?? 30000
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const shouldExecute = executionEnabled && executionScope.enabled
  useExecutionMount(shouldExecute, () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    // Initialize state if not present
    const currentState = db.state.get<CIFailureState>(stateKey)
    if (!currentState) {
      db.state.set(stateKey, DEFAULT_CI_STATE, 'ci-failure-init')
    }

    // Fire-and-forget async IIFE pattern
    ;(async () => {
      const resolvedBranch = props.branch ?? await resolveDefaultBranch()
      branchRef.current = resolvedBranch ?? 'main'

      const s = db.state.get<CIFailureState>(stateKey) ?? DEFAULT_CI_STATE
      db.state.set(stateKey, { ...s, ciStatus: 'polling' }, 'ci-failure-polling')

      // Define the polling function
      const checkCI = async () => {
        if (inFlightRef.current) return
        inFlightRef.current = true

        try {
          if (props.provider !== 'github-actions') {
            const currentS = db.state.get<CIFailureState>(stateKey) ?? DEFAULT_CI_STATE
            db.state.set(stateKey, {
              ...currentS,
              error: `Unsupported CI provider: ${props.provider}`,
              ciStatus: 'error',
            }, 'ci-failure-error')
            return
          }

          const branch = branchRef.current ?? 'main'
          const run = await fetchLatestGitHubActionsRun(branch)

          if (!run) {
            return
          }

          const currentS = db.state.get<CIFailureState>(stateKey) ?? DEFAULT_CI_STATE
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

            const nextRunIds = [...currentS.processedRunIds, run.databaseId].slice(-MAX_PROCESSED_RUNS)

            // Update state with new failure and processed ID
            db.state.set(stateKey, {
              ...currentS,
              ciStatus: 'failed',
              currentFailure: failure,
              triggered: true,
              processedRunIds: nextRunIds,
            }, 'ci-failure-triggered')

            // Call onFailure callback
            props.onFailure?.(failure)

            // Register task for tracking - children will handle completion
            taskIdRef.current = db.tasks.start('ci-failure-hook', undefined, { scopeId: executionScope.scopeId })
            // Complete immediately as children handle their own task registration
            db.tasks.complete(taskIdRef.current)

            // Log to db state
            db.state.set(lastFailureKey, failure, 'ci-failure-hook')
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          const currentS = db.state.get<CIFailureState>(stateKey) ?? DEFAULT_CI_STATE
          db.state.set(stateKey, {
            ...currentS,
            error: errorMsg,
            ciStatus: 'error',
          }, 'ci-failure-error')
          console.error('[OnCIFailure] Polling error:', errorMsg)
        } finally {
          inFlightRef.current = false
        }
      }

      // Initial check
      await checkCI()

      // Start polling
      pollIntervalRef.current = setInterval(checkCI, intervalMs)
    })()
  }, [db, executionEnabled, intervalMs, props.branch, props.onFailure, props.provider])

  useUnmount(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
  })

  useEffectOnValueChange(shouldExecute, () => {
    if (shouldExecute) return
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  })

  // Resolve children - support render prop pattern
  const resolvedChildren = (() => {
    if (!triggered || !currentFailure?.runId) return null
    if (typeof props.children === 'function') {
      return props.children(currentFailure)
    }
    return props.children
  })()

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
      {triggered && currentFailure?.runId
        ? <ci-failure-run key={currentFailure.runId}>{resolvedChildren}</ci-failure-run>
        : null}
    </ci-failure-hook>
  )
}
