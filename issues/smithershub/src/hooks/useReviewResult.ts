import { useRef, useCallback } from 'react'
import { useQueryValue } from 'smithers-orchestrator/db'
import type { Review, ReviewIssue, ReviewApproval } from '../../../src/db/types'
import type { SmithersDB } from '../../../src/db'

/**
 * Hook for reactive access to review results and analysis
 * Follows project pattern: no useState, SQLite + useQueryValue for reactivity
 */
export function useReviewResult(db: SmithersDB, executionId: string) {
  // Non-reactive state in useRef (per project guidelines)
  const stateRef = useRef({
    lastExecutionId: executionId,
    filterCache: new Map<string, Review[]>(),
    statsCache: new Map<string, any>()
  })

  // Reactive queries via useQueryValue (auto-rerenders on DB changes)
  const reviews = useQueryValue<Review[]>(
    db.db,
    "SELECT * FROM reviews WHERE execution_id = ? ORDER BY created_at DESC",
    [executionId]
  ) || []

  const blockingReviews = useQueryValue<Review[]>(
    db.db,
    "SELECT * FROM reviews WHERE execution_id = ? AND blocking = 1 AND approved = 0",
    [executionId]
  ) || []

  // Clear cache if execution ID changed
  if (stateRef.current.lastExecutionId !== executionId) {
    stateRef.current.filterCache.clear()
    stateRef.current.statsCache.clear()
    stateRef.current.lastExecutionId = executionId
  }

  // Computed properties with getter pattern (no useState)
  const computed = {
    get reviewCount() { return reviews.length },
    get hasReviews() { return reviews.length > 0 },

    // Review status aggregation
    get approvedReviews() { return reviews.filter(r => r.approved) },
    get pendingReviews() { return reviews.filter(r => !r.approved && !r.blocking) },
    get blockedReviews() { return reviews.filter(r => r.blocking && !r.approved) },

    // Overall status computation
    get status() {
      const hasBlockingIssues = blockingReviews.length > 0
      const hasCriticalIssues = reviews.some(r =>
        r.issues.some(i => i.severity === 'critical')
      )
      const allApproved = reviews.length > 0 && reviews.every(r => r.approved)

      if (hasBlockingIssues || hasCriticalIssues) return 'blocked'
      if (allApproved) return 'approved'
      if (reviews.length === 0) return 'no_reviews'
      return 'pending'
    },

    // Progress calculation
    get progress() {
      if (reviews.length === 0) return 0
      return (this.approvedReviews.length / reviews.length) * 100
    },

    // Issue aggregation
    get allIssues() {
      return reviews.flatMap(r => r.issues)
    },

    get issuesBySeverity() {
      const allIssues = this.allIssues
      return {
        critical: allIssues.filter(i => i.severity === 'critical'),
        major: allIssues.filter(i => i.severity === 'major'),
        minor: allIssues.filter(i => i.severity === 'minor'),
        suggestion: allIssues.filter(i => i.severity === 'suggestion')
      }
    },

    // Reviewer performance analysis
    get reviewerPerformance() {
      const cacheKey = `reviewer_perf_${executionId}`
      const cached = stateRef.current.statsCache.get(cacheKey)

      if (cached) return cached

      const performance = {} as Record<string, {
        totalReviews: number
        approvedReviews: number
        blockedReviews: number
        totalIssuesFound: number
        approvalRate: number
        averageIssuesPerReview: number
      }>

      reviews.forEach(review => {
        if (!review.agent_id) return

        if (!performance[review.agent_id]) {
          performance[review.agent_id] = {
            totalReviews: 0,
            approvedReviews: 0,
            blockedReviews: 0,
            totalIssuesFound: 0,
            approvalRate: 0,
            averageIssuesPerReview: 0
          }
        }

        const perf = performance[review.agent_id]
        perf.totalReviews++
        perf.totalIssuesFound += review.issues.length

        if (review.approved) perf.approvedReviews++
        if (review.blocking) perf.blockedReviews++

        perf.approvalRate = (perf.approvedReviews / perf.totalReviews) * 100
        perf.averageIssuesPerReview = perf.totalIssuesFound / perf.totalReviews
      })

      stateRef.current.statsCache.set(cacheKey, performance)
      return performance
    },

    // Timing statistics
    get timingStats() {
      const cacheKey = `timing_${executionId}`
      const cached = stateRef.current.statsCache.get(cacheKey)

      if (cached) return cached

      if (reviews.length === 0) return null

      const timestamps = reviews.map(r => r.created_at.getTime())
      const earliest = Math.min(...timestamps)
      const latest = Math.max(...timestamps)
      const duration = latest - earliest

      const stats = {
        earliest: new Date(earliest),
        latest: new Date(latest),
        durationMs: duration,
        averageIntervalMs: duration / Math.max(1, reviews.length - 1),
        reviewsPerHour: reviews.length > 1 ? (reviews.length - 1) / (duration / (1000 * 60 * 60)) : 0
      }

      stateRef.current.statsCache.set(cacheKey, stats)
      return stats
    },

    // Issue distribution analysis
    get issueDistribution() {
      const cacheKey = `issue_dist_${executionId}`
      const cached = stateRef.current.statsCache.get(cacheKey)

      if (cached) return cached

      const allIssues = this.allIssues

      const distribution = {
        total: allIssues.length,
        bySeverity: {
          critical: 0,
          major: 0,
          minor: 0,
          suggestion: 0
        },
        byFile: {} as Record<string, number>,
        byReviewer: {} as Record<string, number>
      }

      allIssues.forEach(issue => {
        distribution.bySeverity[issue.severity]++

        if (issue.file) {
          distribution.byFile[issue.file] = (distribution.byFile[issue.file] || 0) + 1
        }
      })

      reviews.forEach(review => {
        if (review.agent_id && review.issues.length > 0) {
          distribution.byReviewer[review.agent_id] =
            (distribution.byReviewer[review.agent_id] || 0) + review.issues.length
        }
      })

      stateRef.current.statsCache.set(cacheKey, distribution)
      return distribution
    }
  }

  // Operations (following project pattern: return functions, not reactive state)
  const createReview = useCallback(async (reviewData: Partial<Review>): Promise<Review> => {
    const newReview = {
      id: `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      execution_id: executionId,
      created_at: new Date(),
      posted_to_github: false,
      posted_to_git_notes: false,
      ...reviewData
    } as Review

    await db.vcs.logReview(newReview)

    // Clear caches
    stateRef.current.filterCache.clear()
    stateRef.current.statsCache.clear()

    return newReview
  }, [db, executionId])

  const updateReview = useCallback(async (reviewId: string, updates: Partial<Review>): Promise<Review | null> => {
    // Find existing review
    const existing = reviews.find(r => r.id === reviewId)
    if (!existing) return null

    const updatedReview = { ...existing, ...updates }

    // Update in database (simplified - in real implementation would use UPDATE query)
    await db.vcs.logReview(updatedReview)

    // Clear caches
    stateRef.current.filterCache.clear()
    stateRef.current.statsCache.clear()

    return updatedReview
  }, [db, reviews])

  const deleteReview = useCallback(async (reviewId: string): Promise<boolean> => {
    try {
      // In real implementation, would use DELETE query
      db.db.run("DELETE FROM reviews WHERE id = ?", [reviewId])

      // Clear caches
      stateRef.current.filterCache.clear()
      stateRef.current.statsCache.clear()

      return true
    } catch {
      return false
    }
  }, [db])

  // Filtering functions with caching
  const filterByTargetType = useCallback((targetType: 'commit' | 'diff' | 'pr' | 'files'): Review[] => {
    const cacheKey = `target_${targetType}`
    const cached = stateRef.current.filterCache.get(cacheKey)

    if (cached) return cached

    const filtered = reviews.filter(r => r.target_type === targetType)
    stateRef.current.filterCache.set(cacheKey, filtered)

    return filtered
  }, [reviews])

  const filterByAgent = useCallback((agentId: string): Review[] => {
    const cacheKey = `agent_${agentId}`
    const cached = stateRef.current.filterCache.get(cacheKey)

    if (cached) return cached

    const filtered = reviews.filter(r => r.agent_id === agentId)
    stateRef.current.filterCache.set(cacheKey, filtered)

    return filtered
  }, [reviews])

  const searchReviews = useCallback((query: string): Review[] => {
    const cacheKey = `search_${query}`
    const cached = stateRef.current.filterCache.get(cacheKey)

    if (cached) return cached

    const lowercaseQuery = query.toLowerCase()
    const filtered = reviews.filter(r =>
      r.summary.toLowerCase().includes(lowercaseQuery) ||
      r.issues.some(i =>
        i.message.toLowerCase().includes(lowercaseQuery) ||
        (i.suggestion && i.suggestion.toLowerCase().includes(lowercaseQuery))
      ) ||
      (r.approvals && r.approvals.some(a =>
        a.reason.toLowerCase().includes(lowercaseQuery)
      ))
    )

    stateRef.current.filterCache.set(cacheKey, filtered)
    return filtered
  }, [reviews])

  // Validation functions
  const validateForMerge = useCallback((): {
    canMerge: boolean
    blockingIssues: ReviewIssue[]
    warnings: string[]
  } => {
    const blockingIssues = computed.allIssues.filter(i =>
      i.severity === 'critical' || (i.severity === 'major' && reviews.some(r => r.blocking))
    )

    const warnings: string[] = []

    if (reviews.length === 0) {
      warnings.push('No reviews have been conducted')
    }

    if (computed.issuesBySeverity.major.length > 0) {
      warnings.push(`${computed.issuesBySeverity.major.length} major issues found`)
    }

    if (computed.issuesBySeverity.minor.length > 5) {
      warnings.push(`High number of minor issues (${computed.issuesBySeverity.minor.length})`)
    }

    const recentReviews = reviews.filter(r =>
      Date.now() - r.created_at.getTime() < 24 * 60 * 60 * 1000 // 24 hours
    )

    if (recentReviews.length === 0 && reviews.length > 0) {
      warnings.push('All reviews are older than 24 hours')
    }

    return {
      canMerge: blockingIssues.length === 0 && computed.status === 'approved',
      blockingIssues,
      warnings
    }
  }, [reviews, computed])

  const getReviewSummary = useCallback((): {
    totalReviews: number
    approvalRate: number
    criticalIssues: number
    majorIssues: number
    minorIssues: number
    mostActiveReviewer: string | null
    averageReviewTime: number
    recommendation: 'approve' | 'needs_work' | 'block'
  } => {
    const criticalCount = computed.issuesBySeverity.critical.length
    const majorCount = computed.issuesBySeverity.major.length
    const minorCount = computed.issuesBySeverity.minor.length

    // Find most active reviewer
    const reviewerCounts = {} as Record<string, number>
    reviews.forEach(r => {
      if (r.agent_id) {
        reviewerCounts[r.agent_id] = (reviewerCounts[r.agent_id] || 0) + 1
      }
    })

    const mostActiveReviewer = Object.entries(reviewerCounts).reduce((max, [reviewer, count]) =>
      count > (max[1] || 0) ? [reviewer, count] : max, ['', 0]
    )[0] || null

    // Calculate average review time
    const timingStats = computed.timingStats
    const averageReviewTime = timingStats ? timingStats.averageIntervalMs : 0

    // Determine recommendation
    let recommendation: 'approve' | 'needs_work' | 'block' = 'approve'

    if (criticalCount > 0 || blockingReviews.length > 0) {
      recommendation = 'block'
    } else if (majorCount > 0 || minorCount > 10) {
      recommendation = 'needs_work'
    }

    return {
      totalReviews: reviews.length,
      approvalRate: computed.progress,
      criticalIssues: criticalCount,
      majorIssues: majorCount,
      minorIssues: minorCount,
      mostActiveReviewer,
      averageReviewTime,
      recommendation
    }
  }, [reviews, computed, blockingReviews])

  // Return object with getters (following project pattern)
  return {
    // Reactive data
    reviews,
    blockingReviews,

    // Computed properties
    get reviewCount() { return computed.reviewCount },
    get hasReviews() { return computed.hasReviews },
    get status() { return computed.status },
    get progress() { return computed.progress },
    get approvedReviews() { return computed.approvedReviews },
    get pendingReviews() { return computed.pendingReviews },
    get blockedReviews() { return computed.blockedReviews },
    get allIssues() { return computed.allIssues },
    get issuesBySeverity() { return computed.issuesBySeverity },
    get reviewerPerformance() { return computed.reviewerPerformance },
    get timingStats() { return computed.timingStats },
    get issueDistribution() { return computed.issueDistribution },

    // Operations
    createReview,
    updateReview,
    deleteReview,

    // Filtering
    filterByTargetType,
    filterByAgent,
    searchReviews,

    // Analysis
    validateForMerge,
    getReviewSummary,

    // Utilities
    clearCache: () => {
      stateRef.current.filterCache.clear()
      stateRef.current.statsCache.clear()
    }
  }
}

export type ReviewResultHook = ReturnType<typeof useReviewResult>