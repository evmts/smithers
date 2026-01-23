import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { renderHook, act } from '@testing-library/react'
import type { ExecFunction } from '../../issues/smithershub/src/types'
import type { Review, Commit } from '../../src/db/types'

// Mock the complete environment for end-to-end testing
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
    logSnapshot: mock(),
    getReviews: mock(),
    getBlockingReviews: mock(),
  },
  state: {
    get: mock(),
    set: mock(),
  },
  agents: {
    start: mock(),
    complete: mock(),
    fail: mock(),
    list: mock(),
  },
  execution: {
    start: mock(),
    complete: mock(),
  }
} as any

// Complete workflow simulation types
interface E2EWorkflowState {
  executionId: string
  phase: 'init' | 'reviewing' | 'resolving' | 'merging' | 'completed' | 'failed'
  targetBranch: string
  baseBranch: string
  reviewers: string[]
  mergeStrategy: 'rebase' | 'merge' | 'squash'
  iterations: WorkflowIteration[]
  currentIteration: number
  totalIterations: number
}

interface WorkflowIteration {
  id: string
  startTime: number
  endTime?: number
  reviews: Review[]
  issues: Array<{
    severity: 'critical' | 'major' | 'minor'
    description: string
    resolved: boolean
    resolutionCommit?: string
  }>
  commits: Commit[]
  status: 'in_progress' | 'completed' | 'failed'
}

interface ThrottlingConfig {
  maxReviewsPerMinute: number
  maxMergesPerHour: number
  iterationCooldown: number
  retryBackoff: number
}

describe('End-to-End Review-Merge-Iteration Workflow', () => {
  beforeEach(() => {
    mock.restore()

    // Setup comprehensive mock environment
    mockExec.mockImplementation(async (command: string) => {
      // JJ status responses
      if (command.includes('jj status')) {
        return {
          stdout: `Parent commit: abc123def456\nWorking copy: clean`,
          stderr: '',
          exitCode: 0
        }
      }

      // JJ diff responses
      if (command.includes('jj diff')) {
        return {
          stdout: generateMockDiff(),
          stderr: '',
          exitCode: 0
        }
      }

      // JJ log responses
      if (command.includes('jj log')) {
        return {
          stdout: `abc123def456\n2024-01-15T10:00:00Z\nfeat: Implement user authentication`,
          stderr: '',
          exitCode: 0
        }
      }

      // Default success response
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    // Setup database mocks
    mockDb.state.get.mockImplementation((key: string) => {
      switch (key) {
        case 'mergeQueue':
          return []
        case 'throttling':
          return {
            lastReview: Date.now() - 60000, // 1 minute ago
            reviewCount: 0,
            mergeCount: 0
          }
        default:
          return null
      }
    })

    mockDb.agents.start.mockImplementation(async (config) => {
      return `agent-${config.name}-${Date.now()}`
    })
  })

  describe('Complete Multi-Iteration Workflow', () => {
    it('should execute full workflow with multiple review-fix cycles', async () => {
      const initialWorkflow: E2EWorkflowState = {
        executionId: 'e2e-workflow-123',
        phase: 'init',
        targetBranch: 'feature/user-authentication',
        baseBranch: 'main',
        reviewers: ['claude-quality', 'claude-security', 'claude-architecture'],
        mergeStrategy: 'rebase',
        iterations: [],
        currentIteration: 0,
        totalIterations: 0
      }

      const throttlingConfig: ThrottlingConfig = {
        maxReviewsPerMinute: 10,
        maxMergesPerHour: 5,
        iterationCooldown: 5000, // 5 seconds
        retryBackoff: 1000 // 1 second
      }

      // Main workflow orchestrator
      const executeCompleteWorkflow = async (
        workflow: E2EWorkflowState,
        config: ThrottlingConfig
      ): Promise<E2EWorkflowState> => {
        try {
          workflow.phase = 'reviewing'

          // Start execution tracking
          await mockDb.execution.start({
            id: workflow.executionId,
            type: 'review_merge_workflow',
            metadata: { targetBranch: workflow.targetBranch }
          })

          // Iteration 1: Initial reviews with critical issues
          const iteration1 = await executeReviewIteration(workflow, 1, {
            shouldFindCriticalIssues: true,
            mockIssues: [
              { severity: 'critical', description: 'SQL injection vulnerability in auth.ts' },
              { severity: 'major', description: 'Missing input validation' }
            ]
          })

          workflow.iterations.push(iteration1)
          workflow.currentIteration = 1

          // Developer fixes issues based on review feedback
          await simulateDeveloperFixes(workflow, iteration1.issues)

          // Apply throttling before next iteration
          await applyIterationThrottling(config.iterationCooldown)

          // Iteration 2: Re-review after fixes
          const iteration2 = await executeReviewIteration(workflow, 2, {
            shouldFindCriticalIssues: false,
            mockIssues: [
              { severity: 'minor', description: 'Code style improvement needed' }
            ]
          })

          workflow.iterations.push(iteration2)
          workflow.currentIteration = 2

          // Final minor fixes
          await simulateDeveloperFixes(workflow, iteration2.issues)

          // Apply throttling before merge
          await applyIterationThrottling(config.iterationCooldown)

          // Iteration 3: Final review and merge
          const iteration3 = await executeReviewIteration(workflow, 3, {
            shouldFindCriticalIssues: false,
            mockIssues: []
          })

          workflow.iterations.push(iteration3)
          workflow.currentIteration = 3

          // All reviews approved, proceed to merge
          workflow.phase = 'merging'
          const mergeResult = await executeMergePhase(workflow, config)

          if (mergeResult.success) {
            workflow.phase = 'completed'
            workflow.totalIterations = 3
          } else {
            workflow.phase = 'failed'
          }

          // Complete execution tracking
          await mockDb.execution.complete(workflow.executionId, {
            status: workflow.phase,
            iterations: workflow.totalIterations,
            totalTime: Date.now() - (iteration1.startTime)
          })

          return workflow

        } catch (error) {
          workflow.phase = 'failed'
          await mockDb.execution.complete(workflow.executionId, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          })

          throw error
        }
      }

      // Execute review iteration
      const executeReviewIteration = async (
        workflow: E2EWorkflowState,
        iterationNumber: number,
        options: {
          shouldFindCriticalIssues: boolean
          mockIssues: Array<{ severity: 'critical' | 'major' | 'minor', description: string }>
        }
      ): Promise<WorkflowIteration> => {
        const iteration: WorkflowIteration = {
          id: `iteration-${iterationNumber}`,
          startTime: Date.now(),
          reviews: [],
          issues: options.mockIssues.map(issue => ({ ...issue, resolved: false })),
          commits: [],
          status: 'in_progress'
        }

        // Start parallel reviewers
        const reviewPromises = workflow.reviewers.map(async (reviewer) => {
          const agentId = await mockDb.agents.start({
            type: 'reviewer',
            name: reviewer,
            execution_id: workflow.executionId
          })

          // Simulate reviewer analysis time
          await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200))

          const review: Review = {
            id: `review-${reviewer}-iter${iterationNumber}-${Date.now()}`,
            execution_id: workflow.executionId,
            agent_id: agentId,
            target_type: 'commit',
            target_ref: workflow.targetBranch,
            approved: determineReviewApproval(reviewer, options),
            summary: generateReviewSummary(reviewer, options),
            issues: generateReviewIssues(reviewer, options),
            approvals: [],
            reviewer_model: 'claude-3-5-sonnet-20241022',
            blocking: hasBlockingIssues(reviewer, options),
            posted_to_github: false,
            posted_to_git_notes: false,
            created_at: new Date()
          }

          await mockDb.vcs.logReview(review)
          await mockDb.agents.complete(agentId, { review })

          return review
        })

        iteration.reviews = await Promise.all(reviewPromises)

        // Determine iteration outcome
        const hasBlocking = iteration.reviews.some(r => r.blocking && !r.approved)
        const allApproved = iteration.reviews.every(r => r.approved)

        iteration.status = hasBlocking ? 'failed' : allApproved ? 'completed' : 'in_progress'
        iteration.endTime = Date.now()

        return iteration
      }

      // Simulate developer fixing issues
      const simulateDeveloperFixes = async (
        workflow: E2EWorkflowState,
        issues: WorkflowIteration['issues']
      ): Promise<void> => {
        for (const issue of issues) {
          if (issue.severity === 'critical' || issue.severity === 'major') {
            // Mock creating a fix commit
            mockExec.mockImplementationOnce(async (command: string) => {
              if (command.includes('jj commit')) {
                return {
                  stdout: `Created commit fix123def456\nFixed: ${issue.description}`,
                  stderr: '',
                  exitCode: 0
                }
              }
              return { stdout: '', stderr: '', exitCode: 0 }
            })

            const commitResult = await mockExec(`jj commit -m "fix: ${issue.description}"`)

            if (commitResult.exitCode === 0) {
              issue.resolved = true
              issue.resolutionCommit = 'fix123def456'

              const fixCommit: Commit = {
                id: `commit-fix-${Date.now()}`,
                execution_id: workflow.executionId,
                agent_id: 'developer',
                change_id: 'fix123',
                commit_id: 'fix123def456',
                message: `fix: ${issue.description}`,
                author: 'developer@example.com',
                timestamp: new Date(),
                files_changed: [`src/${issue.description.split(' ')[0]}.ts`],
                insertions: 10,
                deletions: 5,
                parent_commits: ['abc123def456'],
                created_at: new Date()
              }

              await mockDb.vcs.logCommit(fixCommit)
            }
          }
        }
      }

      // Apply throttling between iterations
      const applyIterationThrottling = async (cooldownMs: number): Promise<void> => {
        // Check current throttling state
        const throttlingState = mockDb.state.get('throttling') || {
          lastIteration: 0,
          iterationCount: 0
        }

        const timeSinceLastIteration = Date.now() - throttlingState.lastIteration

        if (timeSinceLastIteration < cooldownMs) {
          const waitTime = cooldownMs - timeSinceLastIteration
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }

        // Update throttling state
        throttlingState.lastIteration = Date.now()
        throttlingState.iterationCount++
        mockDb.state.set('throttling', throttlingState, 'iteration_throttle')
      }

      // Execute merge phase
      const executeMergePhase = async (
        workflow: E2EWorkflowState,
        config: ThrottlingConfig
      ): Promise<{ success: boolean; commitId?: string; error?: string }> => {
        try {
          // Pre-merge validation
          const lastIteration = workflow.iterations[workflow.iterations.length - 1]
          const allApproved = lastIteration.reviews.every(r => r.approved)
          const noBlockingIssues = !lastIteration.reviews.some(r => r.blocking && !r.approved)

          if (!allApproved || !noBlockingIssues) {
            return { success: false, error: 'Reviews not approved or blocking issues remain' }
          }

          // Check merge throttling
          const throttlingState = mockDb.state.get('throttling')
          if (throttlingState.mergeCount >= config.maxMergesPerHour) {
            return { success: false, error: 'Merge rate limit exceeded' }
          }

          // Execute merge
          mockExec.mockImplementation(async (command: string) => {
            if (command.includes('jj rebase')) {
              return {
                stdout: `Rebased 5 commits onto ${workflow.baseBranch}\nNew head: merge789abc123`,
                stderr: '',
                exitCode: 0
              }
            }
            return { stdout: '', stderr: '', exitCode: 0 }
          })

          const mergeResult = await mockExec(`jj rebase -s ${workflow.targetBranch} -d ${workflow.baseBranch}`)

          if (mergeResult.exitCode !== 0) {
            return { success: false, error: mergeResult.stderr }
          }

          // Log merge commit
          const mergeCommit: Commit = {
            id: `merge-commit-${Date.now()}`,
            execution_id: workflow.executionId,
            agent_id: 'merger',
            change_id: 'merge789',
            commit_id: 'merge789abc123',
            message: `Merge ${workflow.targetBranch} into ${workflow.baseBranch}`,
            author: 'smithers-merger@ai.com',
            timestamp: new Date(),
            files_changed: ['src/auth.ts', 'src/middleware.ts', 'tests/auth.test.ts'],
            insertions: 145,
            deletions: 25,
            parent_commits: ['abc123def456', 'def456ghi789'],
            created_at: new Date()
          }

          await mockDb.vcs.logCommit(mergeCommit)

          // Update throttling state
          throttlingState.mergeCount++
          mockDb.state.set('throttling', throttlingState, 'merge_throttle')

          return { success: true, commitId: mergeCommit.commit_id }

        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown merge error'
          }
        }
      }

      // Mock the database and agent responses
      mockDb.execution.start.mockResolvedValue({ id: initialWorkflow.executionId })
      mockDb.execution.complete.mockResolvedValue({ completed: true })
      mockDb.vcs.logReview.mockImplementation(async (review) => review)
      mockDb.vcs.logCommit.mockImplementation(async (commit) => commit)
      mockDb.agents.complete.mockResolvedValue({ success: true })

      // Execute the complete workflow
      const completedWorkflow = await executeCompleteWorkflow(initialWorkflow, throttlingConfig)

      // Assertions for complete workflow
      expect(completedWorkflow.phase).toBe('completed')
      expect(completedWorkflow.iterations).toHaveLength(3)
      expect(completedWorkflow.totalIterations).toBe(3)

      // Validate iteration 1 (critical issues found)
      const iter1 = completedWorkflow.iterations[0]
      expect(iter1.reviews).toHaveLength(3) // 3 reviewers
      expect(iter1.issues.some(i => i.severity === 'critical')).toBe(true)
      expect(iter1.issues.filter(i => i.resolved)).toHaveLength(2) // Critical and major fixed

      // Validate iteration 2 (minor issues)
      const iter2 = completedWorkflow.iterations[1]
      expect(iter2.reviews.every(r => !r.blocking)).toBe(true) // No blocking issues
      expect(iter2.issues.every(i => i.severity === 'minor')).toBe(true)

      // Validate iteration 3 (all approved)
      const iter3 = completedWorkflow.iterations[2]
      expect(iter3.reviews.every(r => r.approved)).toBe(true)
      expect(iter3.issues).toHaveLength(0) // No issues found

      // Validate database interactions
      expect(mockDb.execution.start).toHaveBeenCalledWith({
        id: 'e2e-workflow-123',
        type: 'review_merge_workflow',
        metadata: { targetBranch: 'feature/user-authentication' }
      })

      expect(mockDb.execution.complete).toHaveBeenCalledWith(
        'e2e-workflow-123',
        expect.objectContaining({
          status: 'completed',
          iterations: 3
        })
      )

      // Validate agent lifecycle
      expect(mockDb.agents.start).toHaveBeenCalledTimes(9) // 3 reviewers × 3 iterations
      expect(mockDb.agents.complete).toHaveBeenCalledTimes(9)

      // Validate VCS operations
      expect(mockDb.vcs.logReview).toHaveBeenCalledTimes(9) // All reviews logged
      expect(mockDb.vcs.logCommit).toHaveBeenCalled() // Fix commits and merge commit
    })

    it('should handle workflow failure and recovery', async () => {
      const failingWorkflow: E2EWorkflowState = {
        executionId: 'e2e-failure-123',
        phase: 'init',
        targetBranch: 'feature/failing-branch',
        baseBranch: 'main',
        reviewers: ['claude-quality', 'claude-security'],
        mergeStrategy: 'rebase',
        iterations: [],
        currentIteration: 0,
        totalIterations: 0
      }

      const executeWorkflowWithFailures = async (workflow: E2EWorkflowState) => {
        const maxIterations = 5
        let currentIteration = 0

        try {
          workflow.phase = 'reviewing'

          while (currentIteration < maxIterations) {
            currentIteration++

            // Simulate persistent critical issues for first 4 iterations
            const hasCriticalIssues = currentIteration <= 4

            const iteration: WorkflowIteration = {
              id: `iteration-${currentIteration}`,
              startTime: Date.now(),
              reviews: [],
              issues: hasCriticalIssues ? [
                { severity: 'critical', description: 'Persistent security vulnerability', resolved: false }
              ] : [],
              commits: [],
              status: 'in_progress'
            }

            // Mock reviews that keep finding critical issues
            for (const reviewer of workflow.reviewers) {
              const review: Review = {
                id: `review-${reviewer}-${currentIteration}`,
                execution_id: workflow.executionId,
                agent_id: `agent-${reviewer}`,
                target_type: 'commit',
                target_ref: workflow.targetBranch,
                approved: !hasCriticalIssues,
                summary: hasCriticalIssues ? 'Critical issues remain' : 'All issues resolved',
                issues: hasCriticalIssues ? [
                  {
                    severity: 'critical',
                    message: 'Security vulnerability persists',
                    file: 'src/auth.ts',
                    line: 42
                  }
                ] : [],
                approvals: [],
                reviewer_model: 'claude-3-5-sonnet-20241022',
                blocking: hasCriticalIssues,
                posted_to_github: false,
                posted_to_git_notes: false,
                created_at: new Date()
              }

              iteration.reviews.push(review)
            }

            iteration.status = hasCriticalIssues ? 'failed' : 'completed'
            iteration.endTime = Date.now()

            workflow.iterations.push(iteration)
            workflow.currentIteration = currentIteration

            // If iteration failed due to persistent issues
            if (hasCriticalIssues && currentIteration >= maxIterations) {
              workflow.phase = 'failed'
              break
            }

            // If iteration succeeded
            if (!hasCriticalIssues) {
              workflow.phase = 'completed'
              break
            }

            // Apply iteration cooldown
            await new Promise(resolve => setTimeout(resolve, 50))
          }

          workflow.totalIterations = currentIteration

          return workflow

        } catch (error) {
          workflow.phase = 'failed'
          throw error
        }
      }

      const result = await executeWorkflowWithFailures(failingWorkflow)

      // Should fail after max iterations
      expect(result.phase).toBe('failed')
      expect(result.totalIterations).toBe(5)
      expect(result.iterations).toHaveLength(5)

      // All iterations should have failed due to persistent critical issues
      result.iterations.slice(0, -1).forEach(iteration => {
        expect(iteration.status).toBe('failed')
        expect(iteration.reviews.some(r => r.blocking)).toBe(true)
      })
    })
  })

  describe('Advanced Throttling and Rate Limiting', () => {
    it('should enforce comprehensive rate limits', async () => {
      const strictThrottling: ThrottlingConfig = {
        maxReviewsPerMinute: 3,
        maxMergesPerHour: 1,
        iterationCooldown: 2000, // 2 seconds
        retryBackoff: 500 // 500ms
      }

      const testThrottlingEnforcement = async (config: ThrottlingConfig) => {
        const operations: Array<{ type: 'review' | 'merge', timestamp: number, allowed: boolean }> = []

        // Simulate rapid operations
        for (let i = 0; i < 10; i++) {
          const operationType = i % 3 === 0 ? 'merge' : 'review'
          const timestamp = Date.now()

          // Check rate limits
          const throttlingState = mockDb.state.get('throttling') || {
            reviewCount: 0,
            mergeCount: 0,
            lastReset: timestamp - 60000 // 1 minute ago
          }

          // Reset counters if time window passed
          if (timestamp - throttlingState.lastReset >= 60000) {
            throttlingState.reviewCount = 0
            throttlingState.mergeCount = 0
            throttlingState.lastReset = timestamp
          }

          let allowed = false

          if (operationType === 'review' && throttlingState.reviewCount < config.maxReviewsPerMinute) {
            allowed = true
            throttlingState.reviewCount++
          } else if (operationType === 'merge' && throttlingState.mergeCount < config.maxMergesPerHour) {
            allowed = true
            throttlingState.mergeCount++
          }

          operations.push({ type: operationType, timestamp, allowed })

          mockDb.state.set('throttling', throttlingState, 'rate_limit_check')

          // Small delay between operations
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        return operations
      }

      const operations = await testThrottlingEnforcement(strictThrottling)

      const reviewOps = operations.filter(op => op.type === 'review')
      const mergeOps = operations.filter(op => op.type === 'merge')

      const allowedReviews = reviewOps.filter(op => op.allowed)
      const allowedMerges = mergeOps.filter(op => op.allowed)

      // Should enforce review rate limit
      expect(allowedReviews.length).toBeLessThanOrEqual(strictThrottling.maxReviewsPerMinute)

      // Should enforce merge rate limit
      expect(allowedMerges.length).toBeLessThanOrEqual(strictThrottling.maxMergesPerHour)

      // Should have some denied operations due to rate limiting
      const deniedOperations = operations.filter(op => !op.allowed)
      expect(deniedOperations.length).toBeGreaterThan(0)
    })

    it('should implement adaptive throttling based on system load', async () => {
      interface AdaptiveThrottlingState {
        currentLoad: number // 0-1 scale
        adaptedLimits: {
          reviewsPerMinute: number
          mergesPerHour: number
          iterationCooldown: number
        }
        performanceHistory: Array<{
          timestamp: number
          responseTime: number
          errorRate: number
        }>
      }

      const calculateAdaptiveThrottling = (
        baseConfig: ThrottlingConfig,
        systemLoad: number,
        performanceHistory: AdaptiveThrottlingState['performanceHistory']
      ): AdaptiveThrottlingState['adaptedLimits'] => {
        // Calculate recent performance metrics
        const recentHistory = performanceHistory.slice(-10) // Last 10 operations
        const avgResponseTime = recentHistory.reduce((sum, h) => sum + h.responseTime, 0) / recentHistory.length
        const avgErrorRate = recentHistory.reduce((sum, h) => sum + h.errorRate, 0) / recentHistory.length

        // Adapt limits based on load and performance
        const loadFactor = Math.max(0.1, 1 - systemLoad) // Reduce by up to 90% under high load
        const performanceFactor = avgResponseTime > 1000 || avgErrorRate > 0.1 ? 0.5 : 1.0

        const adaptationFactor = loadFactor * performanceFactor

        return {
          reviewsPerMinute: Math.floor(baseConfig.maxReviewsPerMinute * adaptationFactor),
          mergesPerHour: Math.floor(baseConfig.maxMergesPerHour * adaptationFactor),
          iterationCooldown: Math.floor(baseConfig.iterationCooldown / adaptationFactor)
        }
      }

      const baseThrottling: ThrottlingConfig = {
        maxReviewsPerMinute: 10,
        maxMergesPerHour: 5,
        iterationCooldown: 1000,
        retryBackoff: 500
      }

      // Test under different load conditions
      const testScenarios = [
        { load: 0.1, description: 'Low load' },
        { load: 0.5, description: 'Medium load' },
        { load: 0.9, description: 'High load' }
      ]

      const performanceHistory: AdaptiveThrottlingState['performanceHistory'] = [
        { timestamp: Date.now() - 10000, responseTime: 500, errorRate: 0.02 },
        { timestamp: Date.now() - 9000, responseTime: 600, errorRate: 0.01 },
        { timestamp: Date.now() - 8000, responseTime: 800, errorRate: 0.03 },
        { timestamp: Date.now() - 7000, responseTime: 1200, errorRate: 0.15 }, // Poor performance
        { timestamp: Date.now() - 6000, responseTime: 400, errorRate: 0.01 }
      ]

      testScenarios.forEach(scenario => {
        const adaptedLimits = calculateAdaptiveThrottling(
          baseThrottling,
          scenario.load,
          performanceHistory
        )

        console.log(`${scenario.description}:`, adaptedLimits)

        // Under high load, limits should be reduced
        if (scenario.load > 0.8) {
          expect(adaptedLimits.reviewsPerMinute).toBeLessThan(baseThrottling.maxReviewsPerMinute)
          expect(adaptedLimits.mergesPerHour).toBeLessThan(baseThrottling.maxMergesPerHour)
        }

        // Under low load with good performance, limits should be maintained or increased
        if (scenario.load < 0.2) {
          expect(adaptedLimits.reviewsPerMinute).toBeGreaterThan(0)
          expect(adaptedLimits.mergesPerHour).toBeGreaterThan(0)
        }

        // All adapted limits should be positive
        expect(adaptedLimits.reviewsPerMinute).toBeGreaterThan(0)
        expect(adaptedLimits.mergesPerHour).toBeGreaterThan(0)
        expect(adaptedLimits.iterationCooldown).toBeGreaterThan(0)
      })
    })
  })

  describe('JJ Integration Edge Cases', () => {
    it('should handle complex JJ operations during workflow', async () => {
      const complexWorkflow = async () => {
        // Test JJ workspace management during workflow
        mockExec.mockImplementation(async (command: string) => {
          if (command.includes('jj workspace list')) {
            return {
              stdout: `default: /current/path\nreview-workspace: /review/path [abc123]`,
              stderr: '',
              exitCode: 0
            }
          }

          if (command.includes('jj workspace add')) {
            return {
              stdout: `Created workspace review-temp at /tmp/review`,
              stderr: '',
              exitCode: 0
            }
          }

          if (command.includes('jj bookmark')) {
            return {
              stdout: `Created bookmark pre-review at abc123`,
              stderr: '',
              exitCode: 0
            }
          }

          if (command.includes('jj split')) {
            return {
              stdout: `Split commit into 2 commits\nFirst: def456\nSecond: ghi789`,
              stderr: '',
              exitCode: 0
            }
          }

          if (command.includes('jj absorb')) {
            return {
              stdout: `Absorbed changes into 3 commits`,
              stderr: '',
              exitCode: 0
            }
          }

          return { stdout: '', stderr: '', exitCode: 0 }
        })

        // Create temporary workspace for review
        const workspaceResult = await mockExec('jj workspace add review-temp /tmp/review')
        expect(workspaceResult.exitCode).toBe(0)

        // Create bookmark before review
        const bookmarkResult = await mockExec('jj bookmark create pre-review')
        expect(bookmarkResult.exitCode).toBe(0)

        // Test commit splitting for atomic changes
        const splitResult = await mockExec('jj split abc123')
        expect(splitResult.exitCode).toBe(0)
        expect(splitResult.stdout).toContain('Split commit')

        // Test change absorption for cleanup
        const absorbResult = await mockExec('jj absorb')
        expect(absorbResult.exitCode).toBe(0)

        return {
          workspaceCreated: workspaceResult.stdout.includes('Created workspace'),
          bookmarkCreated: bookmarkResult.stdout.includes('Created bookmark'),
          commitSplit: splitResult.stdout.includes('Split commit'),
          changesAbsorbed: absorbResult.stdout.includes('Absorbed changes')
        }
      }

      const result = await complexWorkflow()

      expect(result.workspaceCreated).toBe(true)
      expect(result.bookmarkCreated).toBe(true)
      expect(result.commitSplit).toBe(true)
      expect(result.changesAbsorbed).toBe(true)
    })

    it('should handle JJ conflict resolution workflow', async () => {
      const conflictResolutionWorkflow = async () => {
        // Mock conflict scenario
        mockExec.mockImplementation(async (command: string) => {
          if (command.includes('jj rebase') && !command.includes('--dry-run')) {
            return {
              stdout: '',
              stderr: 'Conflict in src/auth.ts\nConflict in src/utils.ts',
              exitCode: 1
            }
          }

          if (command.includes('jj resolve --list')) {
            return {
              stdout: `src/auth.ts: 2-sided conflict\nsrc/utils.ts: 3-sided conflict`,
              stderr: '',
              exitCode: 0
            }
          }

          if (command.includes('jj resolve --tool')) {
            return {
              stdout: `Resolved conflict in src/auth.ts using external tool`,
              stderr: '',
              exitCode: 0
            }
          }

          if (command.includes('jj resolve src/utils.ts')) {
            return {
              stdout: `Manually resolved conflict in src/utils.ts`,
              stderr: '',
              exitCode: 0
            }
          }

          if (command.includes('jj resolve --list') && command.includes('after-resolution')) {
            return {
              stdout: '', // No conflicts remaining
              stderr: '',
              exitCode: 0
            }
          }

          return { stdout: '', stderr: '', exitCode: 0 }
        })

        // Attempt rebase that causes conflicts
        const rebaseResult = await mockExec('jj rebase -s feature -d main')
        expect(rebaseResult.exitCode).toBe(1)

        // List conflicts
        const conflictsList = await mockExec('jj resolve --list')
        expect(conflictsList.stdout).toContain('src/auth.ts')
        expect(conflictsList.stdout).toContain('src/utils.ts')

        // Resolve conflicts using external tool
        const toolResolve = await mockExec('jj resolve --tool merge src/auth.ts')
        expect(toolResolve.exitCode).toBe(0)

        // Manually resolve remaining conflict
        const manualResolve = await mockExec('jj resolve src/utils.ts')
        expect(manualResolve.exitCode).toBe(0)

        // Verify all conflicts resolved
        const finalCheck = await mockExec('jj resolve --list after-resolution')
        expect(finalCheck.stdout.trim()).toBe('')

        return {
          conflictsDetected: rebaseResult.exitCode === 1,
          conflictsListed: conflictsList.stdout.includes('conflict'),
          toolResolutionWorked: toolResolve.stdout.includes('Resolved'),
          manualResolutionWorked: manualResolve.stdout.includes('resolved'),
          allResolved: finalCheck.stdout.trim() === ''
        }
      }

      const result = await conflictResolutionWorkflow()

      expect(result.conflictsDetected).toBe(true)
      expect(result.conflictsListed).toBe(true)
      expect(result.toolResolutionWorked).toBe(true)
      expect(result.manualResolutionWorked).toBe(true)
      expect(result.allResolved).toBe(true)
    })
  })
})

// Helper functions for E2E testing
function generateMockDiff(): string {
  return `diff --git a/src/auth.ts b/src/auth.ts
index abc123..def456 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,10 +1,15 @@
 export class AuthService {
   constructor(private db: Database) {}

+  /**
+   * Authenticate user with email and password
+   */
   async authenticate(email: string, password: string): Promise<User | null> {
+    // Input validation
+    if (!email || !password) return null
+
-    const query = "SELECT * FROM users WHERE email = '" + email + "'"
+    const query = "SELECT * FROM users WHERE email = ?"
+    const user = await this.db.prepare(query).get(email)
-    const user = await this.db.raw(query)

     if (user && await this.verifyPassword(password, user.passwordHash)) {
       return user
@@ -15,6 +20,10 @@ export class AuthService {
   private async verifyPassword(password: string, hash: string): Promise<boolean> {
     return await bcrypt.compare(password, hash)
   }
+
+  async logout(sessionId: string): Promise<void> {
+    await this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId)
+  }
 }`
}

function determineReviewApproval(
  reviewer: string,
  options: { shouldFindCriticalIssues: boolean; mockIssues: any[] }
): boolean {
  if (options.shouldFindCriticalIssues && reviewer === 'claude-security') {
    return false // Security always blocks on critical issues
  }

  if (options.mockIssues.some(issue => issue.severity === 'critical')) {
    return false // Any reviewer blocks on critical issues
  }

  return true // Approve otherwise
}

function generateReviewSummary(
  reviewer: string,
  options: { shouldFindCriticalIssues: boolean; mockIssues: any[] }
): string {
  if (options.shouldFindCriticalIssues) {
    switch (reviewer) {
      case 'claude-security':
        return 'Security vulnerabilities detected in authentication system'
      case 'claude-quality':
        return 'Code quality issues found, needs refactoring'
      case 'claude-architecture':
        return 'Architecture concerns with database access patterns'
      default:
        return 'Issues detected requiring attention'
    }
  }

  switch (reviewer) {
    case 'claude-security':
      return 'Security review passed - no vulnerabilities found'
    case 'claude-quality':
      return 'Code quality meets standards'
    case 'claude-architecture':
      return 'Architecture design is sound'
    default:
      return 'Review completed successfully'
  }
}

function generateReviewIssues(
  reviewer: string,
  options: { shouldFindCriticalIssues: boolean; mockIssues: any[] }
): any[] {
  if (!options.shouldFindCriticalIssues) {
    return []
  }

  switch (reviewer) {
    case 'claude-security':
      return [
        {
          severity: 'critical',
          file: 'src/auth.ts',
          line: 8,
          message: 'SQL injection vulnerability in user query',
          suggestion: 'Use parameterized queries to prevent SQL injection'
        }
      ]
    case 'claude-quality':
      return [
        {
          severity: 'major',
          file: 'src/auth.ts',
          line: 7,
          message: 'Missing input validation for email parameter',
          suggestion: 'Add email format validation before database query'
        }
      ]
    case 'claude-architecture':
      return [
        {
          severity: 'minor',
          file: 'src/auth.ts',
          line: 1,
          message: 'Direct database access in service layer',
          suggestion: 'Consider using repository pattern for data access'
        }
      ]
    default:
      return []
  }
}

function hasBlockingIssues(
  reviewer: string,
  options: { shouldFindCriticalIssues: boolean }
): boolean {
  return options.shouldFindCriticalIssues && reviewer === 'claude-security'
}