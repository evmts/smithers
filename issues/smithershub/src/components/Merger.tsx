import React, { useRef, useCallback } from 'react'
import { useMount, useUnmount, useQueryValue } from '../../../src/reconciler/hooks'
import type { SmithersDB } from '../../../src/db'
import type { Review, Commit } from '../../../src/db/types'
import type { ExecFunction } from '../types'
import {
  rebaseCommits,
  createMergeCommit,
  squashCommits,
  getWorkingCopyStatus,
  undoOperation,
  type JJRebaseResult
} from '../utils/jjOperations'
import { validatePreMerge, validatePostMerge, runCompleteValidation } from '../utils/repoStateValidator'
import { useIterationTimeout } from '../hooks/useIterationTimeout'

interface MergerProps {
  db: SmithersDB
  executionId: string
  exec: ExecFunction
  strategy?: 'rebase' | 'merge' | 'squash'
  targetBranch?: string
  timeoutMs?: number
  maxRetries?: number
  throttle?: {
    maxMergesPerHour: number
    retryBackoffMs: number
  }
  onMergeComplete?: (result: MergeResult) => void
  onError?: (error: Error) => void
  children?: (state: MergerState) => React.ReactNode
}

interface MergeQueueEntry {
  id: string
  worktree: string
  branch: string
  timestamp: number
  priority: number
  reviewIds: string[]
  status: 'pending' | 'merging' | 'merged' | 'failed' | 'cancelled'
  author: string
  title: string
  retryCount: number
  lastError?: string
  strategy: 'rebase' | 'merge' | 'squash'
  metadata?: Record<string, any>
}

interface MergerState {
  status: 'idle' | 'processing' | 'merging' | 'completed' | 'failed'
  queue: MergeQueueEntry[]
  currentEntry: MergeQueueEntry | null
  progress: number
  errors: Array<{ entry: string; error: string; timestamp: number }>
  statistics: {
    totalMerges: number
    successfulMerges: number
    failedMerges: number
    averageMergeTime: number
    lastMergeTimestamp: number
  }
  throttleState: {
    mergeCount: number
    windowStart: number
    isThrottled: boolean
  }
}

interface MergeResult {
  success: boolean
  commitId?: string
  mergedEntry: MergeQueueEntry
  mergeTime: number
  conflicts?: string[]
  error?: string
}

/**
 * Merger component - manages merge queue with throttling and retry logic
 * Integrates with JJ VCS and follows project patterns
 */
export function Merger({
  db,
  executionId,
  exec,
  strategy = 'rebase',
  targetBranch = 'main',
  timeoutMs = 300000, // 5 minutes default
  maxRetries = 3,
  throttle = { maxMergesPerHour: 10, retryBackoffMs: 5000 },
  onMergeComplete,
  onError,
  children
}: MergerProps) {
  // Non-reactive state (per project guidelines)
  const stateRef = useRef<MergerState>({
    status: 'idle',
    queue: [],
    currentEntry: null,
    progress: 0,
    errors: [],
    statistics: {
      totalMerges: 0,
      successfulMerges: 0,
      failedMerges: 0,
      averageMergeTime: 0,
      lastMergeTimestamp: 0
    },
    throttleState: {
      mergeCount: 0,
      windowStart: Date.now(),
      isThrottled: false
    }
  })

  const processingRef = useRef(false)
  const abortController = useRef<AbortController | null>(null)

  // Reactive data from database
  const mergeQueue = useQueryValue<MergeQueueEntry[]>(
    db.db,
    "SELECT * FROM merge_queue WHERE execution_id = ? ORDER BY priority ASC, timestamp ASC",
    [executionId]
  ) || []

  const mergeStats = useQueryValue<any>(
    db.db,
    "SELECT * FROM merge_statistics WHERE execution_id = ?",
    [executionId]
  )

  // Throttling support
  const { sleep } = useIterationTimeout(timeoutMs)

  // Update state when reactive data changes
  React.useEffect(() => {
    stateRef.current.queue = mergeQueue
    if (mergeStats) {
      stateRef.current.statistics = mergeStats
    }
  }, [mergeQueue, mergeStats])

  // Throttle management
  const checkThrottling = useCallback((): boolean => {
    const now = Date.now()
    const windowDuration = 60 * 60 * 1000 // 1 hour

    // Reset window if expired
    if (now - stateRef.current.throttleState.windowStart > windowDuration) {
      stateRef.current.throttleState = {
        mergeCount: 0,
        windowStart: now,
        isThrottled: false
      }
    }

    // Check if throttled
    const isThrottled = stateRef.current.throttleState.mergeCount >= throttle.maxMergesPerHour
    stateRef.current.throttleState.isThrottled = isThrottled

    return isThrottled
  }, [throttle.maxMergesPerHour])

  // Add entry to merge queue
  const addToQueue = useCallback(async (
    worktree: string,
    branch: string,
    options: {
      priority?: number
      title?: string
      author?: string
      reviewIds?: string[]
      strategy?: MergeQueueEntry['strategy']
      metadata?: Record<string, any>
    } = {}
  ): Promise<string> => {
    const entry: MergeQueueEntry = {
      id: `merge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      worktree,
      branch,
      timestamp: Date.now(),
      priority: options.priority || 5,
      reviewIds: options.reviewIds || [],
      status: 'pending',
      author: options.author || 'unknown',
      title: options.title || `Merge ${worktree} into ${branch}`,
      retryCount: 0,
      strategy: options.strategy || strategy,
      metadata: options.metadata
    }

    // Add to database
    await db.db.run(
      `INSERT INTO merge_queue (
        id, worktree, branch, timestamp, priority, reviewIds, status,
        author, title, retryCount, strategy, metadata, execution_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.worktree,
        entry.branch,
        entry.timestamp,
        entry.priority,
        JSON.stringify(entry.reviewIds),
        entry.status,
        entry.author,
        entry.title,
        entry.retryCount,
        entry.strategy,
        JSON.stringify(entry.metadata),
        executionId
      ]
    )

    return entry.id
  }, [db, executionId, strategy])

  // Update queue entry
  const updateQueueEntry = useCallback(async (
    entryId: string,
    updates: Partial<MergeQueueEntry>
  ): Promise<void> => {
    const updateFields = Object.keys(updates).map(key => `${key} = ?`).join(', ')
    const updateValues = Object.values(updates)

    await db.db.run(
      `UPDATE merge_queue SET ${updateFields} WHERE id = ?`,
      [...updateValues, entryId]
    )
  }, [db])

  // Validate merge prerequisites
  const validateMergePrerequisites = useCallback(async (entry: MergeQueueEntry): Promise<boolean> => {
    try {
      // Check all reviews are complete and approved
      if (entry.reviewIds.length > 0) {
        const reviews = await Promise.all(
          entry.reviewIds.map(async (reviewId) => {
            const review = await db.db.get("SELECT * FROM reviews WHERE id = ?", [reviewId])
            return review as Review
          })
        )

        const incompleteReviews = reviews.filter(r => !r || !r.approved)
        if (incompleteReviews.length > 0) {
          throw new Error(`${incompleteReviews.length} reviews not approved`)
        }

        const blockingIssues = reviews.flatMap(r => r.issues || []).filter(i => i.severity === 'critical')
        if (blockingIssues.length > 0) {
          throw new Error(`${blockingIssues.length} blocking issues remain`)
        }
      }

      // Validate repository state
      const validation = await validatePreMerge(exec, entry.worktree, entry.branch)
      if (!validation.isValid) {
        const criticalIssues = validation.issues.filter(i => i.severity === 'critical' || i.severity === 'error')
        throw new Error(`Repository validation failed: ${criticalIssues.map(i => i.message).join(', ')}`)
      }

      return true

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed'
      await updateQueueEntry(entry.id, {
        status: 'failed',
        lastError: errorMessage
      })

      stateRef.current.errors.push({
        entry: entry.id,
        error: errorMessage,
        timestamp: Date.now()
      })

      return false
    }
  }, [db, exec, updateQueueEntry])

  // Execute merge operation
  const executeMerge = useCallback(async (entry: MergeQueueEntry): Promise<MergeResult> => {
    const startTime = Date.now()

    try {
      stateRef.current.currentEntry = entry
      await updateQueueEntry(entry.id, { status: 'merging' })

      // Perform merge based on strategy
      let result: JJRebaseResult | string | null = null
      let commitId: string | undefined

      switch (entry.strategy) {
        case 'rebase':
          result = await rebaseCommits(exec, entry.worktree, entry.branch)
          if (typeof result === 'object' && result.success) {
            commitId = result.new_head
          } else {
            throw new Error('Rebase failed')
          }
          break

        case 'merge':
          result = await createMergeCommit(exec, entry.branch, entry.worktree, entry.title)
          if (typeof result === 'string') {
            commitId = result
          } else {
            throw new Error('Merge commit creation failed')
          }
          break

        case 'squash':
          result = await squashCommits(exec, entry.worktree)
          if (typeof result === 'string') {
            commitId = result
          } else {
            throw new Error('Squash merge failed')
          }
          break

        default:
          throw new Error(`Unknown merge strategy: ${entry.strategy}`)
      }

      if (!commitId) {
        throw new Error('Merge completed but no commit ID returned')
      }

      // Validate post-merge state
      const postValidation = await validatePostMerge(exec, commitId)
      if (!postValidation.isValid) {
        const criticalIssues = postValidation.issues.filter(i => i.severity === 'critical')
        if (criticalIssues.length > 0) {
          // Rollback merge
          await undoOperation(exec)
          throw new Error(`Post-merge validation failed: ${criticalIssues.map(i => i.message).join(', ')}`)
        }
      }

      // Log merge commit
      const mergeCommit: Commit = {
        id: `commit-merge-${Date.now()}`,
        execution_id: executionId,
        agent_id: 'merger',
        change_id: commitId.substring(0, 8),
        commit_id: commitId,
        message: entry.title,
        author: entry.author,
        timestamp: new Date(),
        files_changed: [], // Would be populated from actual merge
        insertions: 0, // Would be calculated
        deletions: 0, // Would be calculated
        parent_commits: [entry.branch, entry.worktree],
        created_at: new Date()
      }

      await db.vcs.logCommit(mergeCommit)

      // Update queue entry
      await updateQueueEntry(entry.id, {
        status: 'merged'
      })

      // Update statistics
      const mergeTime = Date.now() - startTime
      stateRef.current.statistics.successfulMerges++
      stateRef.current.statistics.totalMerges++
      stateRef.current.statistics.lastMergeTimestamp = Date.now()

      const totalTime = stateRef.current.statistics.averageMergeTime * (stateRef.current.statistics.totalMerges - 1) + mergeTime
      stateRef.current.statistics.averageMergeTime = totalTime / stateRef.current.statistics.totalMerges

      // Update throttle state
      stateRef.current.throttleState.mergeCount++

      const mergeResult: MergeResult = {
        success: true,
        commitId,
        mergedEntry: { ...entry, status: 'merged' },
        mergeTime
      }

      if (onMergeComplete) {
        onMergeComplete(mergeResult)
      }

      return mergeResult

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Merge failed'
      const mergeTime = Date.now() - startTime

      // Update entry with failure
      await updateQueueEntry(entry.id, {
        status: 'failed',
        lastError: errorMessage
      })

      // Update statistics
      stateRef.current.statistics.failedMerges++
      stateRef.current.statistics.totalMerges++

      stateRef.current.errors.push({
        entry: entry.id,
        error: errorMessage,
        timestamp: Date.now()
      })

      const mergeResult: MergeResult = {
        success: false,
        mergedEntry: { ...entry, status: 'failed' },
        mergeTime,
        error: errorMessage
      }

      if (onError) {
        onError(error instanceof Error ? error : new Error(errorMessage))
      }

      return mergeResult

    } finally {
      stateRef.current.currentEntry = null
    }
  }, [exec, updateQueueEntry, executionId, db, onMergeComplete, onError])

  // Process merge queue with retry logic
  const processQueue = useCallback(async (): Promise<void> => {
    if (processingRef.current) return
    processingRef.current = true

    try {
      stateRef.current.status = 'processing'

      while (true) {
        // Check for abort signal
        if (abortController.current?.signal.aborted) {
          break
        }

        // Check throttling
        if (checkThrottling()) {
          stateRef.current.status = 'idle'
          await sleep() // Wait before rechecking
          continue
        }

        // Get next pending entry
        const pendingEntries = stateRef.current.queue
          .filter(entry => entry.status === 'pending')
          .sort((a, b) => {
            if (a.priority !== b.priority) {
              return a.priority - b.priority // Lower number = higher priority
            }
            return a.timestamp - b.timestamp // Older first
          })

        if (pendingEntries.length === 0) {
          stateRef.current.status = 'idle'
          break
        }

        const entry = pendingEntries[0]
        stateRef.current.status = 'merging'

        try {
          // Validate prerequisites
          const isValid = await validateMergePrerequisites(entry)
          if (!isValid) {
            continue // Skip this entry, continue with next
          }

          // Execute merge
          const result = await executeMerge(entry)

          if (!result.success && entry.retryCount < maxRetries) {
            // Retry with exponential backoff
            const backoffMs = throttle.retryBackoffMs * Math.pow(2, entry.retryCount)
            await updateQueueEntry(entry.id, {
              status: 'pending',
              retryCount: entry.retryCount + 1
            })

            await new Promise(resolve => setTimeout(resolve, backoffMs))
            continue
          }

        } catch (error) {
          console.error('Unexpected error processing merge queue:', error)
          // Continue with next entry
        }

        // Update progress
        const completedEntries = stateRef.current.queue.filter(e =>
          e.status === 'merged' || e.status === 'failed'
        ).length
        stateRef.current.progress = (completedEntries / stateRef.current.queue.length) * 100

        // Apply iteration timeout
        await sleep()
      }

      stateRef.current.status = 'completed'

    } catch (error) {
      stateRef.current.status = 'failed'

      if (onError) {
        onError(error instanceof Error ? error : new Error('Queue processing failed'))
      }

    } finally {
      processingRef.current = false
    }
  }, [
    checkThrottling,
    sleep,
    validateMergePrerequisites,
    executeMerge,
    maxRetries,
    throttle.retryBackoffMs,
    updateQueueEntry,
    onError
  ])

  // Cancel processing
  const cancelProcessing = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort()
    }
    processingRef.current = false
    stateRef.current.status = 'idle'
  }, [])

  // Clear completed entries
  const clearCompleted = useCallback(async () => {
    const completedIds = stateRef.current.queue
      .filter(entry => entry.status === 'merged' || entry.status === 'failed')
      .map(entry => entry.id)

    if (completedIds.length > 0) {
      await db.db.run(
        `DELETE FROM merge_queue WHERE id IN (${completedIds.map(() => '?').join(',')})`,
        completedIds
      )
    }
  }, [db])

  // Component lifecycle
  useMount(() => {
    abortController.current = new AbortController()

    // Auto-start processing if queue has entries
    if (stateRef.current.queue.length > 0) {
      processQueue()
    }
  })

  useUnmount(() => {
    cancelProcessing()
  })

  // Auto-process when new entries arrive
  React.useEffect(() => {
    if (stateRef.current.queue.length > 0 && stateRef.current.status === 'idle') {
      processQueue()
    }
  }, [mergeQueue.length, processQueue])

  // Return interface for programmatic control
  const mergerInterface = {
    addToQueue,
    processQueue,
    cancelProcessing,
    clearCompleted,
    get state() { return stateRef.current },
    get isProcessing() { return processingRef.current },
    get isThrottled() { return stateRef.current.throttleState.isThrottled }
  }

  // Render function
  if (children) {
    return children(stateRef.current)
  }

  // Default render
  return (
    <div>
      <div>Status: {stateRef.current.status}</div>
      <div>Queue Length: {stateRef.current.queue.length}</div>
      <div>Progress: {stateRef.current.progress.toFixed(1)}%</div>

      {stateRef.current.currentEntry && (
        <div>
          <div>Currently Merging:</div>
          <div>Worktree: {stateRef.current.currentEntry.worktree}</div>
          <div>Branch: {stateRef.current.currentEntry.branch}</div>
          <div>Strategy: {stateRef.current.currentEntry.strategy}</div>
        </div>
      )}

      <div>
        <div>Statistics:</div>
        <div>Total: {stateRef.current.statistics.totalMerges}</div>
        <div>Successful: {stateRef.current.statistics.successfulMerges}</div>
        <div>Failed: {stateRef.current.statistics.failedMerges}</div>
        <div>Average Time: {(stateRef.current.statistics.averageMergeTime / 1000).toFixed(1)}s</div>
      </div>

      {stateRef.current.throttleState.isThrottled && (
        <div>⚠️ Merge operations are throttled due to rate limits</div>
      )}

      {stateRef.current.errors.length > 0 && (
        <div>
          <div>Recent Errors:</div>
          {stateRef.current.errors.slice(-5).map((error, index) => (
            <div key={index}>
              <div>{error.entry}: {error.error}</div>
              <div>{new Date(error.timestamp).toLocaleTimeString()}</div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div>Queue:</div>
        {stateRef.current.queue.map(entry => (
          <div key={entry.id}>
            <div>{entry.title} ({entry.status})</div>
            <div>Priority: {entry.priority} | Retries: {entry.retryCount}</div>
            {entry.lastError && <div>Error: {entry.lastError}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

export type { MergerProps, MergerState, MergeQueueEntry, MergeResult }