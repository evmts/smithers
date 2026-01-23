import React, { useRef, useCallback } from 'react'
import { useMount, useUnmount } from '../../../src/reconciler/hooks'
import type { SmithersDB } from '../../../src/db'
import type { Review, ReviewIssue, ReviewApproval } from '../../../src/db/types'
import type { ExecFunction } from '../types'
import { getCommitInfo, getDiff, getWorkingCopyStatus } from '../utils/jjOperations'
import { useIterationTimeout } from '../hooks/useIterationTimeout'

interface ReviewerProps {
  db: SmithersDB
  executionId: string
  exec: ExecFunction
  targetType: 'commit' | 'diff' | 'pr' | 'files'
  targetRef: string
  reviewers: string[]
  parallel?: boolean
  timeoutMs?: number
  blocking?: boolean
  onReviewComplete?: (reviews: Review[]) => void
  onError?: (error: Error) => void
  children?: (state: ReviewerState) => React.ReactNode
}

interface ReviewerState {
  status: 'idle' | 'validating' | 'reviewing' | 'completed' | 'failed'
  reviews: Review[]
  activeAgents: string[]
  progress: number
  errors: Array<{ agent: string; error: string }>
  canProceed: boolean
  blockingIssues: ReviewIssue[]
}

interface ReviewRequest {
  agentId: string
  reviewerName: string
  targetType: ReviewerProps['targetType']
  targetRef: string
  context: {
    commitInfo?: any
    diffContent?: string
    workingCopyStatus?: any
  }
}

/**
 * Reviewer component - orchestrates parallel review agents with JJ integration
 * Follows project patterns: no useState, useRef for non-reactive state
 */
export function Reviewer({
  db,
  executionId,
  exec,
  targetType,
  targetRef,
  reviewers,
  parallel = true,
  timeoutMs = 60000, // 1 minute default
  blocking = false,
  onReviewComplete,
  onError,
  children
}: ReviewerProps) {
  // Non-reactive state using useRef (per project guidelines)
  const stateRef = useRef<ReviewerState>({
    status: 'idle',
    reviews: [],
    activeAgents: [],
    progress: 0,
    errors: [],
    canProceed: false,
    blockingIssues: []
  })

  const agentRefs = useRef<Map<string, string>>(new Map()) // reviewerName -> agentId
  const reviewPromises = useRef<Map<string, Promise<Review>>>(new Map())
  const hasStarted = useRef(false)

  // Throttling support
  const { sleep } = useIterationTimeout(timeoutMs)

  // Prepare context for reviews
  const prepareReviewContext = useCallback(async (): Promise<ReviewRequest['context']> => {
    const context: ReviewRequest['context'] = {}

    try {
      // Get commit information if reviewing a commit
      if (targetType === 'commit') {
        const commitInfo = await getCommitInfo(exec, targetRef)
        context.commitInfo = commitInfo
      }

      // Get diff content
      const diffContent = await getDiff(exec, targetType === 'commit' ? targetRef : undefined)
      context.diffContent = diffContent

      // Get working copy status
      const workingCopyStatus = await getWorkingCopyStatus(exec)
      context.workingCopyStatus = workingCopyStatus

    } catch (error) {
      console.warn('Failed to prepare review context:', error)
      // Continue with partial context
    }

    return context
  }, [exec, targetType, targetRef])

  // Validate pre-review conditions
  const validatePreReview = useCallback(async (): Promise<boolean> => {
    try {
      stateRef.current.status = 'validating'

      // Check if target exists
      if (targetType === 'commit') {
        const commitInfo = await getCommitInfo(exec, targetRef)
        if (!commitInfo) {
          throw new Error(`Commit ${targetRef} not found`)
        }
      }

      // Check for concurrent reviews on same target
      const existingReviews = await db.vcs.getReviews(executionId)
      const concurrentReview = existingReviews.find(r =>
        r.target_type === targetType &&
        r.target_ref === targetRef &&
        !r.approved &&
        r.blocking
      )

      if (concurrentReview) {
        throw new Error(`Review already in progress for ${targetType}:${targetRef}`)
      }

      // Rate limiting check
      const recentReviews = existingReviews.filter(r =>
        Date.now() - r.created_at.getTime() < 60000 // Last minute
      )

      if (recentReviews.length >= 10) { // Max 10 reviews per minute
        throw new Error('Review rate limit exceeded')
      }

      return true

    } catch (error) {
      stateRef.current.status = 'failed'
      stateRef.current.errors.push({
        agent: 'validator',
        error: error instanceof Error ? error.message : 'Validation failed'
      })

      if (onError) {
        onError(error instanceof Error ? error : new Error('Validation failed'))
      }

      return false
    }
  }, [db, executionId, targetType, targetRef, onError])

  // Create individual review
  const createReview = useCallback(async (request: ReviewRequest): Promise<Review> => {
    try {
      // Simulate AI reviewer analysis (in real implementation, would call AI service)
      const analysis = await simulateReviewAnalysis(request)

      // Create review record
      const review: Review = {
        id: `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        execution_id: executionId,
        agent_id: request.agentId,
        target_type: request.targetType,
        target_ref: request.targetRef,
        approved: analysis.approved,
        summary: analysis.summary,
        issues: analysis.issues,
        approvals: analysis.approvals,
        reviewer_model: 'claude-3-5-sonnet-20241022',
        blocking: blocking || analysis.issues.some(i => i.severity === 'critical'),
        posted_to_github: false,
        posted_to_git_notes: false,
        created_at: new Date()
      }

      // Log to database
      await db.vcs.logReview(review)

      // Mark agent as complete
      await db.agents.complete(request.agentId, { review })

      return review

    } catch (error) {
      // Mark agent as failed
      await db.agents.fail(request.agentId, error instanceof Error ? error.message : 'Review failed')

      throw error
    }
  }, [db, executionId, blocking])

  // Start parallel reviews
  const startReviews = useCallback(async (): Promise<void> => {
    if (hasStarted.current) return
    hasStarted.current = true

    try {
      stateRef.current.status = 'reviewing'
      stateRef.current.activeAgents = [...reviewers]

      // Validate pre-conditions
      const isValid = await validatePreReview()
      if (!isValid) return

      // Prepare review context
      const context = await prepareReviewContext()

      // Start reviewer agents
      const reviewPromiseArray = reviewers.map(async (reviewerName) => {
        try {
          // Start agent
          const agentId = await db.agents.start({
            type: 'reviewer',
            name: reviewerName,
            execution_id: executionId,
            metadata: {
              targetType,
              targetRef,
              reviewerModel: 'claude-3-5-sonnet-20241022'
            }
          })

          agentRefs.current.set(reviewerName, agentId)

          // Create review request
          const request: ReviewRequest = {
            agentId,
            reviewerName,
            targetType,
            targetRef,
            context
          }

          // Execute review (with throttling if not parallel)
          if (!parallel) {
            await sleep() // Apply iteration timeout
          }

          const review = await createReview(request)

          // Update state
          stateRef.current.reviews.push(review)
          stateRef.current.progress = (stateRef.current.reviews.length / reviewers.length) * 100

          // Remove from active agents
          const activeIndex = stateRef.current.activeAgents.indexOf(reviewerName)
          if (activeIndex >= 0) {
            stateRef.current.activeAgents.splice(activeIndex, 1)
          }

          return review

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Review failed'

          stateRef.current.errors.push({
            agent: reviewerName,
            error: errorMessage
          })

          // Remove from active agents
          const activeIndex = stateRef.current.activeAgents.indexOf(reviewerName)
          if (activeIndex >= 0) {
            stateRef.current.activeAgents.splice(activeIndex, 1)
          }

          throw error
        }
      })

      // Store promises for potential cancellation
      reviewers.forEach((reviewerName, index) => {
        reviewPromises.current.set(reviewerName, reviewPromiseArray[index])
      })

      // Wait for completion
      const results = await (parallel
        ? Promise.allSettled(reviewPromiseArray)
        : sequentialPromiseExecution(reviewPromiseArray)
      )

      // Process results
      const successfulReviews = results
        .filter((result): result is PromiseFulfilledResult<Review> => result.status === 'fulfilled')
        .map(result => result.value)

      const failedReviews = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')

      // Update final state
      stateRef.current.reviews = successfulReviews
      stateRef.current.status = failedReviews.length > 0 ? 'failed' : 'completed'
      stateRef.current.progress = 100

      // Calculate blocking issues and approval status
      const allIssues = successfulReviews.flatMap(r => r.issues)
      const blockingIssues = allIssues.filter(i =>
        i.severity === 'critical' || (blocking && i.severity === 'major')
      )

      stateRef.current.blockingIssues = blockingIssues
      stateRef.current.canProceed = blockingIssues.length === 0 && successfulReviews.every(r => r.approved)

      // Notify completion
      if (onReviewComplete) {
        onReviewComplete(successfulReviews)
      }

      // Handle failures
      if (failedReviews.length > 0 && onError) {
        const combinedError = new Error(
          `${failedReviews.length} reviews failed: ${failedReviews.map(f => f.reason).join(', ')}`
        )
        onError(combinedError)
      }

    } catch (error) {
      stateRef.current.status = 'failed'

      if (onError) {
        onError(error instanceof Error ? error : new Error('Review process failed'))
      }
    }
  }, [
    reviewers,
    validatePreReview,
    prepareReviewContext,
    createReview,
    parallel,
    sleep,
    onReviewComplete,
    onError,
    db,
    executionId,
    targetType,
    targetRef,
    blocking
  ])

  // Cleanup function
  const cleanup = useCallback(async () => {
    // Cancel any ongoing agent operations
    for (const [reviewerName, agentId] of agentRefs.current) {
      try {
        await db.agents.fail(agentId, 'Review cancelled')
      } catch {
        // Ignore cleanup errors
      }
    }

    agentRefs.current.clear()
    reviewPromises.current.clear()
  }, [db])

  // Component lifecycle
  useMount(() => {
    startReviews()
  })

  useUnmount(() => {
    cleanup()
  })

  // Render function
  if (children) {
    return children(stateRef.current)
  }

  // Default render
  return (
    <div>
      <div>Review Status: {stateRef.current.status}</div>
      <div>Progress: {stateRef.current.progress.toFixed(1)}%</div>
      <div>Active Agents: {stateRef.current.activeAgents.join(', ')}</div>

      {stateRef.current.errors.length > 0 && (
        <div>
          <div>Errors:</div>
          {stateRef.current.errors.map((error, index) => (
            <div key={index}>
              {error.agent}: {error.error}
            </div>
          ))}
        </div>
      )}

      {stateRef.current.reviews.length > 0 && (
        <div>
          <div>Reviews Complete: {stateRef.current.reviews.length}</div>
          {stateRef.current.reviews.map((review, index) => (
            <div key={index}>
              <div>Agent: {review.agent_id}</div>
              <div>Approved: {review.approved ? 'Yes' : 'No'}</div>
              <div>Summary: {review.summary}</div>
              <div>Issues: {review.issues.length}</div>
            </div>
          ))}
        </div>
      )}

      {stateRef.current.blockingIssues.length > 0 && (
        <div>
          <div>Blocking Issues:</div>
          {stateRef.current.blockingIssues.map((issue, index) => (
            <div key={index}>
              <div>{issue.severity}: {issue.message}</div>
              {issue.suggestion && <div>Suggestion: {issue.suggestion}</div>}
            </div>
          ))}
        </div>
      )}

      <div>Can Proceed: {stateRef.current.canProceed ? 'Yes' : 'No'}</div>
    </div>
  )
}

// Helper function for sequential execution
async function sequentialPromiseExecution<T>(promises: Promise<T>[]): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = []

  for (const promise of promises) {
    try {
      const value = await promise
      results.push({ status: 'fulfilled', value })
    } catch (reason) {
      results.push({ status: 'rejected', reason })
    }
  }

  return results
}

// Mock review analysis (in real implementation, would integrate with AI service)
async function simulateReviewAnalysis(request: ReviewRequest): Promise<{
  approved: boolean
  summary: string
  issues: ReviewIssue[]
  approvals: ReviewApproval[]
}> {
  // Simulate analysis time
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))

  const { reviewerName, context } = request

  // Simulate different reviewer behaviors
  const reviewerBehaviors: Record<string, any> = {
    'claude-quality': {
      focusAreas: ['code style', 'complexity', 'maintainability'],
      severityBias: 'minor'
    },
    'claude-security': {
      focusAreas: ['vulnerabilities', 'authentication', 'input validation'],
      severityBias: 'critical'
    },
    'claude-architecture': {
      focusAreas: ['design patterns', 'performance', 'scalability'],
      severityBias: 'major'
    }
  }

  const behavior = reviewerBehaviors[reviewerName] || reviewerBehaviors['claude-quality']
  const diffContent = context.diffContent || ''

  // Generate mock issues based on reviewer type and diff content
  const issues: ReviewIssue[] = []

  if (reviewerName === 'claude-security' && diffContent.includes('password')) {
    issues.push({
      severity: 'critical',
      file: 'src/auth.ts',
      line: 42,
      message: 'Potential security vulnerability in password handling',
      suggestion: 'Use secure password hashing and validation'
    })
  }

  if (reviewerName === 'claude-quality' && diffContent.length > 1000) {
    issues.push({
      severity: 'minor',
      file: 'src/feature.ts',
      line: 15,
      message: 'Consider breaking down large function for better readability',
      suggestion: 'Split function into smaller, focused functions'
    })
  }

  if (reviewerName === 'claude-architecture' && diffContent.includes('database')) {
    issues.push({
      severity: 'major',
      file: 'src/data.ts',
      line: 28,
      message: 'Direct database access violates architectural patterns',
      suggestion: 'Use repository pattern for data access abstraction'
    })
  }

  // Determine approval based on issues
  const hasCriticalIssues = issues.some(i => i.severity === 'critical')
  const hasMajorIssues = issues.some(i => i.severity === 'major')

  const approved = !hasCriticalIssues && (!hasMajorIssues || Math.random() > 0.7)

  const approvals: ReviewApproval[] = approved ? [{
    aspect: behavior.focusAreas[0],
    reason: `${reviewerName} review passed for ${behavior.focusAreas[0]}`
  }] : []

  const summary = approved
    ? `${reviewerName} review passed${issues.length > 0 ? ` with ${issues.length} minor issues` : ''}`
    : `${reviewerName} found ${issues.length} issues requiring attention`

  return {
    approved,
    summary,
    issues,
    approvals
  }
}

export type { ReviewerProps, ReviewerState }