import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { renderHook, act } from '@testing-library/react'
import type { ExecFunction } from '../../issues/smithershub/src/types'
import type { Review, Commit } from '../../src/db/types'

// Mock database and exec function
const mockExec = mock() as jest.MockedFunction<ExecFunction>
const mockDb = {
  db: {
    prepare: mock(),
    run: mock(),
    all: mock(),
    get: mock(),
  },
  vcs: {
    logReview: mock(),
    logCommit: mock(),
    getReviews: mock(),
    getBlockingReviews: mock(),
    logSnapshot: mock(),
  },
  state: {
    get: mock(),
    set: mock(),
  },
  agents: {
    start: mock(),
    complete: mock(),
    fail: mock(),
  }
} as any

interface ReviewMergeWorkflow {
  executionId: string
  targetRef: string
  reviewers: string[]
  mergeStrategy: 'rebase' | 'merge' | 'squash'
  status: 'pending' | 'reviewing' | 'approved' | 'blocked' | 'merging' | 'merged' | 'failed'
}

interface MergeQueueEntry {
  worktree: string
  branch: string
  priority: number
  reviewIds: string[]
  status: 'pending' | 'merging' | 'merged' | 'failed'
  timestamp: number
}

describe('Review-Merge Integration', () => {
  beforeEach(() => {
    mock.restore()

    // Setup default JJ and database responses
    mockExec.mockImplementation(async (command: string) => {
      if (command.includes('jj status')) {
        return {
          stdout: `Parent commit: abc123def456\nWorking copy: clean`,
          stderr: '',
          exitCode: 0
        }
      }
      if (command.includes('jj diff')) {
        return {
          stdout: `diff --git a/src/auth.ts b/src/auth.ts\n+  // New security feature`,
          stderr: '',
          exitCode: 0
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    mockDb.vcs.getReviews.mockReturnValue([])
    mockDb.vcs.getBlockingReviews.mockReturnValue([])
    mockDb.state.get.mockReturnValue([])
  })

  describe('Complete Review-to-Merge Pipeline', () => {
    it('should execute full workflow from review creation to merge', async () => {
      const workflow: ReviewMergeWorkflow = {
        executionId: 'exec-workflow-123',
        targetRef: 'feature-branch',
        reviewers: ['claude-quality', 'claude-security'],
        mergeStrategy: 'rebase',
        status: 'pending'
      }

      // Phase 1: Create reviews
      const createReviews = async (exec: ExecFunction, workflow: ReviewMergeWorkflow) => {
        const reviews: Review[] = []

        for (const reviewer of workflow.reviewers) {
          const agentId = await mockDb.agents.start({
            type: 'reviewer',
            name: reviewer,
            execution_id: workflow.executionId
          })

          const review: Review = {
            id: `review-${reviewer}-${Date.now()}`,
            execution_id: workflow.executionId,
            agent_id: agentId,
            target_type: 'commit',
            target_ref: workflow.targetRef,
            approved: reviewer === 'claude-quality', // Quality passes, security fails
            summary: reviewer === 'claude-quality'
              ? 'Code quality looks good'
              : 'Security vulnerabilities detected',
            issues: reviewer === 'claude-security' ? [
              {
                severity: 'critical' as const,
                file: 'src/auth.ts',
                line: 42,
                message: 'Potential SQL injection',
                suggestion: 'Use parameterized queries'
              }
            ] : [],
            approvals: reviewer === 'claude-quality' ? [
              { aspect: 'code_quality', reason: 'Well-structured code' }
            ] : [],
            reviewer_model: 'claude-3-5-sonnet-20241022',
            blocking: reviewer === 'claude-security',
            posted_to_github: false,
            posted_to_git_notes: false,
            created_at: new Date()
          }

          reviews.push(review)
          mockDb.vcs.logReview.mockResolvedValueOnce(review)
        }

        return reviews
      }

      mockDb.agents.start.mockImplementation(async (config) => {
        return `agent-${config.name}-${Date.now()}`
      })

      const reviews = await createReviews(mockExec, workflow)

      expect(reviews).toHaveLength(2)
      expect(reviews[0].approved).toBe(true) // Quality review approved
      expect(reviews[1].approved).toBe(false) // Security review blocked
      expect(reviews[1].blocking).toBe(true)

      // Phase 2: Check review status
      const checkReviewStatus = (reviews: Review[]) => {
        const hasBlockingIssues = reviews.some(r => r.blocking && !r.approved)
        const allApproved = reviews.length > 0 && reviews.every(r => r.approved)

        return {
          canProceedToMerge: !hasBlockingIssues && allApproved,
          blockingReviews: reviews.filter(r => r.blocking && !r.approved),
          pendingReviews: reviews.filter(r => !r.approved && !r.blocking)
        }
      }

      const reviewStatus = checkReviewStatus(reviews)

      expect(reviewStatus.canProceedToMerge).toBe(false)
      expect(reviewStatus.blockingReviews).toHaveLength(1)
      expect(reviewStatus.blockingReviews[0].agent_id).toContain('security')

      // Phase 3: Fix issues and re-review
      const fixIssuesAndReview = async (blockingReview: Review) => {
        // Simulate developer fixing the issue
        mockExec.mockImplementationOnce(async (command: string) => {
          if (command.includes('jj diff')) {
            return {
              stdout: `diff --git a/src/auth.ts b/src/auth.ts\n-  query = "SELECT * FROM users WHERE id = " + userId\n+  query = "SELECT * FROM users WHERE id = ?"\n+  const result = db.prepare(query).get(userId)`,
              stderr: '',
              exitCode: 0
            }
          }
          return { stdout: '', stderr: '', exitCode: 0 }
        })

        // Create new snapshot after fix
        const snapshotResult = await mockExec('jj commit -m "fix: Use parameterized queries for SQL"')

        // Re-run security review
        const updatedReview: Review = {
          ...blockingReview,
          id: `review-security-fixed-${Date.now()}`,
          approved: true,
          summary: 'Security issues resolved',
          issues: [],
          blocking: false,
          created_at: new Date()
        }

        mockDb.vcs.logReview.mockResolvedValueOnce(updatedReview)

        return updatedReview
      }

      const fixedReview = await fixIssuesAndReview(reviewStatus.blockingReviews[0])

      expect(fixedReview.approved).toBe(true)
      expect(fixedReview.blocking).toBe(false)
      expect(fixedReview.issues).toHaveLength(0)

      // Update reviews array
      const updatedReviews = [reviews[0], fixedReview] // Quality + fixed security

      const finalReviewStatus = checkReviewStatus(updatedReviews)

      expect(finalReviewStatus.canProceedToMerge).toBe(true)
      expect(finalReviewStatus.blockingReviews).toHaveLength(0)

      // Phase 4: Add to merge queue
      const addToMergeQueue = (workflow: ReviewMergeWorkflow, reviews: Review[]) => {
        const mergeEntry: MergeQueueEntry = {
          worktree: workflow.targetRef,
          branch: 'main',
          priority: 1,
          reviewIds: reviews.map(r => r.id),
          status: 'pending',
          timestamp: Date.now()
        }

        const currentQueue = mockDb.state.get('mergeQueue') || []
        currentQueue.push(mergeEntry)
        mockDb.state.set('mergeQueue', currentQueue, 'queue_add')

        return mergeEntry
      }

      const mergeEntry = addToMergeQueue(workflow, updatedReviews)

      expect(mergeEntry.worktree).toBe('feature-branch')
      expect(mergeEntry.reviewIds).toHaveLength(2)
      expect(mergeEntry.status).toBe('pending')

      // Phase 5: Execute merge
      const executeMerge = async (exec: ExecFunction, entry: MergeQueueEntry, strategy: string) => {
        // Pre-merge validation
        const statusResult = await exec('jj status')
        if (!statusResult.stdout.includes('Working copy: clean')) {
          throw new Error('Working copy not clean')
        }

        // Execute merge based on strategy
        let mergeResult
        switch (strategy) {
          case 'rebase':
            mergeResult = await exec(`jj rebase -s ${entry.worktree} -d ${entry.branch}`)
            break
          case 'merge':
            mergeResult = await exec(`jj new ${entry.branch} ${entry.worktree} --merge`)
            break
          case 'squash':
            mergeResult = await exec(`jj squash -r ${entry.worktree}`)
            break
          default:
            throw new Error(`Unknown merge strategy: ${strategy}`)
        }

        if (mergeResult.exitCode !== 0) {
          throw new Error(`Merge failed: ${mergeResult.stderr}`)
        }

        // Update merge queue
        entry.status = 'merged'
        const queue = mockDb.state.get('mergeQueue') || []
        const updatedQueue = queue.map((e: MergeQueueEntry) =>
          e.worktree === entry.worktree ? entry : e
        )
        mockDb.state.set('mergeQueue', updatedQueue, 'merge_complete')

        // Log commit
        const commitData: Commit = {
          id: `commit-${Date.now()}`,
          execution_id: workflow.executionId,
          agent_id: 'agent-merger',
          change_id: 'change-123',
          commit_id: 'commit-456',
          message: `Merge ${entry.worktree} into ${entry.branch}`,
          author: 'merger-agent@smithers.ai',
          timestamp: new Date(),
          files_changed: ['src/auth.ts'],
          insertions: 15,
          deletions: 5,
          parent_commits: ['abc123', 'def456'],
          created_at: new Date()
        }

        mockDb.vcs.logCommit.mockResolvedValueOnce(commitData)

        return commitData
      }

      // Mock successful rebase
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj rebase')) {
          return {
            stdout: `Rebased 3 commits onto main\nNew head: merge123def456`,
            stderr: '',
            exitCode: 0
          }
        }
        if (command.includes('jj status')) {
          return {
            stdout: `Parent commit: merge123def456\nWorking copy: clean`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const mergeCommit = await executeMerge(mockExec, mergeEntry, workflow.mergeStrategy)

      expect(mergeCommit).toBeDefined()
      expect(mergeCommit.message).toContain('Merge feature-branch into main')
      expect(mergeCommit.files_changed).toContain('src/auth.ts')

      // Verify final state
      expect(mockDb.state.set).toHaveBeenCalledWith(
        'mergeQueue',
        expect.arrayContaining([
          expect.objectContaining({
            worktree: 'feature-branch',
            status: 'merged'
          })
        ]),
        'merge_complete'
      )
    })

    it('should handle merge conflicts during workflow', async () => {
      const workflowWithConflict: ReviewMergeWorkflow = {
        executionId: 'exec-conflict-123',
        targetRef: 'conflicting-branch',
        reviewers: ['claude-quality'],
        mergeStrategy: 'rebase',
        status: 'pending'
      }

      // Setup successful review
      const approvedReview: Review = {
        id: 'review-approved-123',
        execution_id: workflowWithConflict.executionId,
        agent_id: 'agent-quality',
        target_type: 'commit',
        target_ref: workflowWithConflict.targetRef,
        approved: true,
        summary: 'Code quality approved',
        issues: [],
        approvals: [{ aspect: 'code_quality', reason: 'Good structure' }],
        reviewer_model: 'claude-3-5-sonnet-20241022',
        blocking: false,
        posted_to_github: false,
        posted_to_git_notes: false,
        created_at: new Date()
      }

      mockDb.vcs.logReview.mockResolvedValue(approvedReview)

      // Mock merge conflict
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj rebase')) {
          return {
            stdout: '',
            stderr: 'Conflict in src/auth.ts\nConflict in src/utils.ts',
            exitCode: 1
          }
        }
        if (command.includes('jj resolve --list')) {
          return {
            stdout: 'src/auth.ts: 2-sided conflict\nsrc/utils.ts: 3-sided conflict',
            stderr: '',
            exitCode: 0
          }
        }
        if (command.includes('jj undo')) {
          return {
            stdout: 'Undid rebase operation',
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const handleMergeConflict = async (exec: ExecFunction, entry: MergeQueueEntry) => {
        try {
          // Attempt merge
          const rebaseResult = await exec(`jj rebase -s ${entry.worktree} -d ${entry.branch}`)

          if (rebaseResult.exitCode !== 0) {
            // Check for conflicts
            const conflictResult = await exec('jj resolve --list')

            if (conflictResult.stdout.includes('conflict')) {
              // Rollback
              await exec('jj undo')

              // Update queue status
              entry.status = 'failed'

              return {
                success: false,
                conflicts: conflictResult.stdout.split('\n').filter(line => line.includes(':')),
                action: 'rolled_back'
              }
            }
          }

          return { success: true, conflicts: [], action: 'completed' }
        } catch (error) {
          return {
            success: false,
            conflicts: [],
            action: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }

      const mergeEntry: MergeQueueEntry = {
        worktree: 'conflicting-branch',
        branch: 'main',
        priority: 1,
        reviewIds: ['review-approved-123'],
        status: 'pending',
        timestamp: Date.now()
      }

      const conflictResult = await handleMergeConflict(mockExec, mergeEntry)

      expect(conflictResult.success).toBe(false)
      expect(conflictResult.conflicts).toHaveLength(2)
      expect(conflictResult.conflicts[0]).toContain('src/auth.ts')
      expect(conflictResult.action).toBe('rolled_back')
      expect(mergeEntry.status).toBe('failed')
    })
  })

  describe('Parallel Review Processing', () => {
    it('should handle multiple reviews running in parallel', async () => {
      const parallelWorkflow = {
        executionId: 'exec-parallel-123',
        targetRef: 'multi-feature-branch',
        reviewers: ['claude-quality', 'claude-security', 'claude-architecture']
      }

      const startParallelReviews = async (reviewers: string[]) => {
        const reviewPromises = reviewers.map(async (reviewer, index) => {
          const agentId = await mockDb.agents.start({
            type: 'reviewer',
            name: reviewer,
            execution_id: parallelWorkflow.executionId
          })

          // Simulate different review durations
          await new Promise(resolve => setTimeout(resolve, 100 * (index + 1)))

          const review: Review = {
            id: `review-${reviewer}-${Date.now()}`,
            execution_id: parallelWorkflow.executionId,
            agent_id: agentId,
            target_type: 'commit',
            target_ref: parallelWorkflow.targetRef,
            approved: Math.random() > 0.3, // 70% approval rate
            summary: `${reviewer} review completed`,
            issues: [],
            approvals: [],
            reviewer_model: 'claude-3-5-sonnet-20241022',
            blocking: false,
            posted_to_github: false,
            posted_to_git_notes: false,
            created_at: new Date()
          }

          await mockDb.agents.complete(agentId, { review })

          return review
        })

        return Promise.all(reviewPromises)
      }

      mockDb.agents.start.mockImplementation(async (config) => {
        return `agent-${config.name}-${Math.random().toString(36).substr(2, 9)}`
      })

      mockDb.agents.complete.mockImplementation(async (agentId, result) => {
        return { agentId, completedAt: new Date(), result }
      })

      const startTime = Date.now()
      const reviews = await startParallelReviews(parallelWorkflow.reviewers)
      const duration = Date.now() - startTime

      expect(reviews).toHaveLength(3)
      expect(duration).toBeLessThan(1000) // Should complete in parallel, not sequentially

      // Verify all agents were started
      expect(mockDb.agents.start).toHaveBeenCalledTimes(3)
      expect(mockDb.agents.complete).toHaveBeenCalledTimes(3)

      // Check review distribution
      const approvedCount = reviews.filter(r => r.approved).length
      expect(approvedCount).toBeGreaterThan(0) // Should have some approvals
    })

    it('should handle agent failures in parallel execution', async () => {
      const failureWorkflow = {
        executionId: 'exec-failure-123',
        reviewers: ['claude-quality', 'claude-security', 'claude-failing']
      }

      const executeReviewsWithFailure = async (reviewers: string[]) => {
        const results = await Promise.allSettled(
          reviewers.map(async (reviewer) => {
            if (reviewer === 'claude-failing') {
              throw new Error('Agent startup failed')
            }

            const agentId = await mockDb.agents.start({
              type: 'reviewer',
              name: reviewer,
              execution_id: failureWorkflow.executionId
            })

            return {
              reviewer,
              agentId,
              status: 'completed'
            }
          })
        )

        const successful = results.filter(r => r.status === 'fulfilled').length
        const failed = results.filter(r => r.status === 'rejected').length

        return { successful, failed, results }
      }

      mockDb.agents.start.mockImplementation(async (config) => {
        if (config.name === 'claude-failing') {
          throw new Error('Agent startup failed')
        }
        return `agent-${config.name}`
      })

      const { successful, failed, results } = await executeReviewsWithFailure(failureWorkflow.reviewers)

      expect(successful).toBe(2) // Quality and security succeed
      expect(failed).toBe(1) // Failing agent fails

      // Check that failures are handled gracefully
      const rejectedResult = results.find(r => r.status === 'rejected') as PromiseRejectedResult
      expect(rejectedResult.reason.message).toBe('Agent startup failed')
    })
  })

  describe('Queue Management Integration', () => {
    it('should prioritize merge queue entries correctly', async () => {
      const queueEntries: MergeQueueEntry[] = [
        {
          worktree: 'hotfix-critical',
          branch: 'main',
          priority: 1, // Highest priority
          reviewIds: ['review-1'],
          status: 'pending',
          timestamp: Date.now()
        },
        {
          worktree: 'feature-new',
          branch: 'main',
          priority: 3, // Low priority
          reviewIds: ['review-2'],
          status: 'pending',
          timestamp: Date.now() - 10000 // Older
        },
        {
          worktree: 'bugfix-urgent',
          branch: 'main',
          priority: 2, // Medium priority
          reviewIds: ['review-3'],
          status: 'pending',
          timestamp: Date.now() - 5000
        }
      ]

      const processQueueInOrder = (queue: MergeQueueEntry[]) => {
        // Sort by priority (1 = highest), then by timestamp (older first)
        return queue
          .filter(entry => entry.status === 'pending')
          .sort((a, b) => {
            if (a.priority !== b.priority) {
              return a.priority - b.priority // Lower number = higher priority
            }
            return a.timestamp - b.timestamp // Older first
          })
      }

      const sortedQueue = processQueueInOrder(queueEntries)

      expect(sortedQueue).toHaveLength(3)
      expect(sortedQueue[0].worktree).toBe('hotfix-critical') // Priority 1
      expect(sortedQueue[1].worktree).toBe('bugfix-urgent') // Priority 2
      expect(sortedQueue[2].worktree).toBe('feature-new') // Priority 3

      // Simulate processing queue
      const processEntry = async (entry: MergeQueueEntry) => {
        entry.status = 'merging'

        // Mock successful merge
        mockExec.mockImplementationOnce(async (command: string) => {
          if (command.includes('jj rebase')) {
            return { stdout: `Merged ${entry.worktree}`, stderr: '', exitCode: 0 }
          }
          return { stdout: '', stderr: '', exitCode: 0 }
        })

        const result = await mockExec(`jj rebase -s ${entry.worktree} -d ${entry.branch}`)

        entry.status = result.exitCode === 0 ? 'merged' : 'failed'

        return entry.status === 'merged'
      }

      // Process in priority order
      let processed = 0
      for (const entry of sortedQueue) {
        const success = await processEntry(entry)
        if (success) processed++
      }

      expect(processed).toBe(3)
      expect(queueEntries.every(e => e.status === 'merged')).toBe(true)
    })

    it('should handle queue congestion and throttling', async () => {
      const createLargeQueue = (size: number): MergeQueueEntry[] => {
        return Array.from({ length: size }, (_, i) => ({
          worktree: `branch-${i}`,
          branch: 'main',
          priority: Math.floor(i / 3) + 1, // Group priorities
          reviewIds: [`review-${i}`],
          status: 'pending' as const,
          timestamp: Date.now() - (size - i) * 1000
        }))
      }

      const processQueueWithThrottling = async (
        queue: MergeQueueEntry[],
        maxConcurrent: number = 3,
        delayMs: number = 100
      ) => {
        const results = []
        const inProgress: Promise<any>[] = []

        for (const entry of queue) {
          // Wait if we've hit the concurrency limit
          if (inProgress.length >= maxConcurrent) {
            await Promise.race(inProgress)
            inProgress.splice(0, 1) // Remove completed promise
          }

          const processPromise = (async () => {
            await new Promise(resolve => setTimeout(resolve, delayMs))

            entry.status = 'merging'
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 50))
            entry.status = 'merged'

            return entry
          })()

          inProgress.push(processPromise)
          results.push(processPromise)
        }

        // Wait for all remaining operations
        await Promise.all(inProgress)

        return Promise.all(results)
      }

      const largeQueue = createLargeQueue(10)

      const startTime = Date.now()
      const processedEntries = await processQueueWithThrottling(largeQueue, 3, 50)
      const duration = Date.now() - startTime

      expect(processedEntries).toHaveLength(10)
      expect(processedEntries.every(e => e.status === 'merged')).toBe(true)

      // Should take longer than if all processed simultaneously due to throttling
      // But less than if processed sequentially
      expect(duration).toBeGreaterThan(150) // Some throttling delay
      expect(duration).toBeLessThan(1000) // But not fully sequential
    })
  })

  describe('Error Recovery and Rollback', () => {
    it('should recover from merge failures', async () => {
      const failingWorkflow = {
        executionId: 'exec-recovery-123',
        targetRef: 'failing-branch',
        reviewers: ['claude-quality']
      }

      const executeWithRecovery = async (exec: ExecFunction, entry: MergeQueueEntry) => {
        const maxRetries = 3
        let attempt = 0
        const errors: string[] = []

        while (attempt < maxRetries) {
          try {
            attempt++

            // Mock failure on first two attempts, success on third
            mockExec.mockImplementation(async (command: string) => {
              if (command.includes('jj rebase')) {
                if (attempt < 3) {
                  return {
                    stdout: '',
                    stderr: `Temporary failure: attempt ${attempt}`,
                    exitCode: 1
                  }
                }
                return {
                  stdout: `Rebased successfully on attempt ${attempt}`,
                  stderr: '',
                  exitCode: 0
                }
              }
              if (command.includes('jj undo')) {
                return {
                  stdout: 'Undid failed operation',
                  stderr: '',
                  exitCode: 0
                }
              }
              return { stdout: '', stderr: '', exitCode: 0 }
            })

            const result = await exec(`jj rebase -s ${entry.worktree} -d ${entry.branch}`)

            if (result.exitCode === 0) {
              return {
                success: true,
                attempt,
                errors: []
              }
            }

            // Rollback failed operation
            await exec('jj undo')
            errors.push(`Attempt ${attempt}: ${result.stderr}`)

            // Exponential backoff
            const backoffMs = Math.pow(2, attempt - 1) * 100
            await new Promise(resolve => setTimeout(resolve, backoffMs))

          } catch (error) {
            errors.push(`Attempt ${attempt}: ${error}`)

            // Try to rollback
            try {
              await exec('jj undo')
            } catch {
              // Rollback failed, but continue
            }
          }
        }

        return {
          success: false,
          attempt,
          errors
        }
      }

      const mergeEntry: MergeQueueEntry = {
        worktree: 'failing-branch',
        branch: 'main',
        priority: 1,
        reviewIds: ['review-1'],
        status: 'pending',
        timestamp: Date.now()
      }

      const recoveryResult = await executeWithRecovery(mockExec, mergeEntry)

      expect(recoveryResult.success).toBe(true)
      expect(recoveryResult.attempt).toBe(3) // Succeeded on third attempt
      expect(mockExec).toHaveBeenCalledWith('jj undo') // Rollback was called for failed attempts
    })

    it('should maintain queue consistency during failures', async () => {
      const queueWithFailures: MergeQueueEntry[] = [
        { worktree: 'success-1', branch: 'main', priority: 1, reviewIds: [], status: 'pending', timestamp: Date.now() },
        { worktree: 'fail-1', branch: 'main', priority: 2, reviewIds: [], status: 'pending', timestamp: Date.now() },
        { worktree: 'success-2', branch: 'main', priority: 3, reviewIds: [], status: 'pending', timestamp: Date.now() },
        { worktree: 'fail-2', branch: 'main', priority: 4, reviewIds: [], status: 'pending', timestamp: Date.now() }
      ]

      const processQueueWithFailures = async (queue: MergeQueueEntry[]) => {
        const results = []

        for (const entry of queue) {
          try {
            // Mock success/failure based on worktree name
            const shouldFail = entry.worktree.includes('fail')

            if (shouldFail) {
              entry.status = 'failed'
              results.push({ entry, success: false, error: 'Simulated failure' })
            } else {
              entry.status = 'merged'
              results.push({ entry, success: true })
            }

          } catch (error) {
            entry.status = 'failed'
            results.push({ entry, success: false, error })
          }
        }

        // Update queue state
        mockDb.state.set('mergeQueue', queue, 'batch_processed')

        return results
      }

      const results = await processQueueWithFailures(queueWithFailures)

      expect(results).toHaveLength(4)

      const successful = results.filter(r => r.success)
      const failed = results.filter(r => !r.success)

      expect(successful).toHaveLength(2)
      expect(failed).toHaveLength(2)

      // Verify queue state maintained consistency
      expect(queueWithFailures[0].status).toBe('merged') // success-1
      expect(queueWithFailures[1].status).toBe('failed') // fail-1
      expect(queueWithFailures[2].status).toBe('merged') // success-2
      expect(queueWithFailures[3].status).toBe('failed') // fail-2

      // Verify state was persisted
      expect(mockDb.state.set).toHaveBeenCalledWith('mergeQueue', queueWithFailures, 'batch_processed')
    })
  })

  describe('Performance and Monitoring', () => {
    it('should track workflow performance metrics', async () => {
      interface WorkflowMetrics {
        reviewTime: number
        mergeTime: number
        totalTime: number
        reviewerCount: number
        conflictCount: number
        retryCount: number
      }

      const trackWorkflowPerformance = async (workflow: ReviewMergeWorkflow): Promise<WorkflowMetrics> => {
        const startTime = Date.now()

        // Phase 1: Reviews (simulate)
        const reviewStart = Date.now()
        await new Promise(resolve => setTimeout(resolve, 200)) // Simulate review time
        const reviewTime = Date.now() - reviewStart

        // Phase 2: Merge (simulate)
        const mergeStart = Date.now()
        await new Promise(resolve => setTimeout(resolve, 100)) // Simulate merge time
        const mergeTime = Date.now() - mergeStart

        const totalTime = Date.now() - startTime

        return {
          reviewTime,
          mergeTime,
          totalTime,
          reviewerCount: workflow.reviewers.length,
          conflictCount: 0, // Would be tracked during actual merge
          retryCount: 0 // Would be tracked during error recovery
        }
      }

      const testWorkflow: ReviewMergeWorkflow = {
        executionId: 'perf-test-123',
        targetRef: 'perf-branch',
        reviewers: ['claude-quality', 'claude-security'],
        mergeStrategy: 'rebase',
        status: 'pending'
      }

      const metrics = await trackWorkflowPerformance(testWorkflow)

      expect(metrics.reviewTime).toBeGreaterThan(190) // ~200ms
      expect(metrics.mergeTime).toBeGreaterThan(90) // ~100ms
      expect(metrics.totalTime).toBeGreaterThan(290) // ~300ms
      expect(metrics.reviewerCount).toBe(2)
      expect(metrics.conflictCount).toBe(0)
    })

    it('should monitor queue processing rates', async () => {
      interface QueueMetrics {
        entriesProcessed: number
        averageProcessingTime: number
        throughput: number // entries per minute
        failureRate: number
      }

      const monitorQueueProcessing = async (entries: MergeQueueEntry[]): Promise<QueueMetrics> => {
        const startTime = Date.now()
        const processingTimes: number[] = []
        let failures = 0

        for (const entry of entries) {
          const entryStart = Date.now()

          // Simulate processing with random duration and occasional failure
          const processingTime = 50 + Math.random() * 100 // 50-150ms
          await new Promise(resolve => setTimeout(resolve, processingTime))

          processingTimes.push(Date.now() - entryStart)

          // 10% failure rate
          if (Math.random() < 0.1) {
            entry.status = 'failed'
            failures++
          } else {
            entry.status = 'merged'
          }
        }

        const totalTime = Date.now() - startTime
        const averageProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
        const throughput = (entries.length / totalTime) * 60000 // per minute
        const failureRate = (failures / entries.length) * 100

        return {
          entriesProcessed: entries.length,
          averageProcessingTime,
          throughput,
          failureRate
        }
      }

      const testEntries: MergeQueueEntry[] = Array.from({ length: 10 }, (_, i) => ({
        worktree: `branch-${i}`,
        branch: 'main',
        priority: 1,
        reviewIds: [`review-${i}`],
        status: 'pending',
        timestamp: Date.now()
      }))

      const queueMetrics = await monitorQueueProcessing(testEntries)

      expect(queueMetrics.entriesProcessed).toBe(10)
      expect(queueMetrics.averageProcessingTime).toBeGreaterThan(50)
      expect(queueMetrics.averageProcessingTime).toBeLessThan(200)
      expect(queueMetrics.throughput).toBeGreaterThan(0)
      expect(queueMetrics.failureRate).toBeGreaterThanOrEqual(0)
      expect(queueMetrics.failureRate).toBeLessThanOrEqual(100)
    })
  })
})