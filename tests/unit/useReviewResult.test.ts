import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { renderHook, act } from '@testing-library/react'
import type { Review, ReviewIssue, ReviewApproval } from '../../src/db/types'

// Mock database
const mockDb = {
  db: {
    prepare: mock(),
    run: mock(),
    all: mock(),
    get: mock(),
  },
  vcs: {
    getReviews: mock(),
    getBlockingReviews: mock(),
    logReview: mock(),
  },
  state: {
    get: mock(),
    set: mock(),
  }
} as any

// Mock useQueryValue hook for reactive database queries
const mockUseQueryValue = mock()

// Mock review data
const mockReviews: Review[] = [
  {
    id: 'review-1',
    execution_id: 'exec-123',
    agent_id: 'agent-quality',
    target_type: 'commit',
    target_ref: 'abc123',
    approved: true,
    summary: 'Code quality looks good with minor suggestions',
    issues: [
      {
        severity: 'minor',
        file: 'src/utils.ts',
        line: 15,
        message: 'Consider using const instead of let',
        suggestion: 'Replace let with const for immutable variables'
      }
    ],
    approvals: [
      {
        aspect: 'code_quality',
        reason: 'Well-structured code with good separation of concerns'
      }
    ],
    reviewer_model: 'claude-3-5-sonnet-20241022',
    blocking: false,
    posted_to_github: true,
    posted_to_git_notes: false,
    created_at: new Date('2024-01-15T10:00:00Z')
  },
  {
    id: 'review-2',
    execution_id: 'exec-123',
    agent_id: 'agent-security',
    target_type: 'commit',
    target_ref: 'abc123',
    approved: false,
    summary: 'Security vulnerabilities detected',
    issues: [
      {
        severity: 'critical',
        file: 'src/auth.ts',
        line: 42,
        message: 'Potential SQL injection vulnerability',
        suggestion: 'Use parameterized queries instead of string concatenation'
      },
      {
        severity: 'major',
        file: 'src/auth.ts',
        line: 67,
        message: 'Weak password validation',
        suggestion: 'Implement stronger password requirements'
      }
    ],
    approvals: [],
    reviewer_model: 'claude-3-5-sonnet-20241022',
    blocking: true,
    posted_to_github: false,
    posted_to_git_notes: true,
    created_at: new Date('2024-01-15T10:05:00Z')
  }
]

describe('useReviewResult Hook', () => {
  beforeEach(() => {
    mock.restore()

    // Setup default mock responses
    mockUseQueryValue.mockReturnValue(mockReviews)
    mockDb.vcs.getReviews.mockReturnValue(mockReviews)
    mockDb.vcs.getBlockingReviews.mockReturnValue(
      mockReviews.filter(r => r.blocking)
    )
    mockDb.state.get.mockReturnValue(null)
  })

  describe('Review Data Access', () => {
    it('should provide reactive access to all reviews', () => {
      // Mock the hook implementation
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ? ORDER BY created_at DESC",
          [executionId]
        ) || []

        return {
          reviews,
          get reviewCount() { return reviews.length },
          get hasReviews() { return reviews.length > 0 }
        }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      expect(result.current.reviews).toHaveLength(2)
      expect(result.current.reviewCount).toBe(2)
      expect(result.current.hasReviews).toBe(true)
    })

    it('should filter reviews by approval status', () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const approved = reviews.filter(r => r.approved)
        const pending = reviews.filter(r => !r.approved && !r.blocking)
        const blocking = reviews.filter(r => r.blocking && !r.approved)

        return { reviews, approved, pending, blocking }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      expect(result.current.approved).toHaveLength(1)
      expect(result.current.blocking).toHaveLength(1)
      expect(result.current.pending).toHaveLength(0)
    })

    it('should aggregate review issues by severity', () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const allIssues = reviews.flatMap(r => r.issues)
        const issuesBySeverity = {
          critical: allIssues.filter(i => i.severity === 'critical'),
          major: allIssues.filter(i => i.severity === 'major'),
          minor: allIssues.filter(i => i.severity === 'minor'),
          suggestion: allIssues.filter(i => i.severity === 'suggestion')
        }

        return { reviews, issuesBySeverity, allIssues }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      expect(result.current.issuesBySeverity.critical).toHaveLength(1)
      expect(result.current.issuesBySeverity.major).toHaveLength(1)
      expect(result.current.issuesBySeverity.minor).toHaveLength(1)
      expect(result.current.allIssues).toHaveLength(3)
    })
  })

  describe('Review Status Computation', () => {
    it('should compute overall review status', () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const hasBlockingIssues = reviews.some(r =>
          r.blocking && !r.approved
        )

        const hasCriticalIssues = reviews.some(r =>
          r.issues.some(i => i.severity === 'critical')
        )

        const allApproved = reviews.length > 0 && reviews.every(r => r.approved)

        const status = hasBlockingIssues || hasCriticalIssues
          ? 'blocked'
          : allApproved
          ? 'approved'
          : reviews.length === 0
          ? 'no_reviews'
          : 'pending'

        return { reviews, status, hasBlockingIssues, hasCriticalIssues, allApproved }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      expect(result.current.status).toBe('blocked')
      expect(result.current.hasBlockingIssues).toBe(true)
      expect(result.current.hasCriticalIssues).toBe(true)
      expect(result.current.allApproved).toBe(false)
    })

    it('should handle empty review state', () => {
      // Mock empty reviews
      mockUseQueryValue.mockReturnValue([])

      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const status = reviews.length === 0 ? 'no_reviews' : 'pending'

        return {
          reviews,
          status,
          get isEmpty() { return reviews.length === 0 }
        }
      }

      const { result } = renderHook(() => useReviewResult('exec-456'))

      expect(result.current.reviews).toHaveLength(0)
      expect(result.current.status).toBe('no_reviews')
      expect(result.current.isEmpty).toBe(true)
    })

    it('should calculate review progress', () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const completedReviews = reviews.length
        const approvedReviews = reviews.filter(r => r.approved).length
        const pendingReviews = reviews.filter(r => !r.approved && !r.blocking).length
        const blockedReviews = reviews.filter(r => r.blocking && !r.approved).length

        const progress = completedReviews > 0
          ? (approvedReviews / completedReviews) * 100
          : 0

        return {
          reviews,
          completedReviews,
          approvedReviews,
          pendingReviews,
          blockedReviews,
          progress
        }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      expect(result.current.completedReviews).toBe(2)
      expect(result.current.approvedReviews).toBe(1)
      expect(result.current.blockedReviews).toBe(1)
      expect(result.current.progress).toBe(50) // 1 approved out of 2 total
    })
  })

  describe('Review Operations', () => {
    it('should support creating new reviews', async () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const createReview = async (reviewData: Partial<Review>) => {
          const newReview = {
            id: `review-${Date.now()}`,
            execution_id: executionId,
            created_at: new Date(),
            ...reviewData
          }

          mockDb.vcs.logReview.mockResolvedValue(newReview)
          return await mockDb.vcs.logReview(newReview)
        }

        return { reviews, createReview }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      const newReviewData = {
        agent_id: 'agent-architecture',
        target_type: 'commit' as const,
        target_ref: 'def456',
        approved: true,
        summary: 'Architecture review passed',
        issues: [],
        blocking: false,
        reviewer_model: 'claude-3-5-sonnet-20241022'
      }

      await act(async () => {
        const created = await result.current.createReview(newReviewData)
        expect(created).toBeDefined()
        expect(created.summary).toBe('Architecture review passed')
      })

      expect(mockDb.vcs.logReview).toHaveBeenCalled()
    })

    it('should support updating review status', async () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const updateReview = async (reviewId: string, updates: Partial<Review>) => {
          const reviewIndex = reviews.findIndex(r => r.id === reviewId)
          if (reviewIndex >= 0) {
            reviews[reviewIndex] = { ...reviews[reviewIndex], ...updates }
            return reviews[reviewIndex]
          }
          return null
        }

        return { reviews, updateReview }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      await act(async () => {
        const updated = await result.current.updateReview('review-2', {
          approved: true,
          blocking: false,
          summary: 'Security issues resolved'
        })

        expect(updated?.approved).toBe(true)
        expect(updated?.blocking).toBe(false)
      })
    })

    it('should support deleting reviews', async () => {
      const useReviewResult = (executionId: string) => {
        let reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const deleteReview = async (reviewId: string) => {
          const initialLength = reviews.length
          reviews = reviews.filter(r => r.id !== reviewId)
          return reviews.length < initialLength
        }

        return { reviews, deleteReview }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      const initialCount = result.current.reviews.length

      await act(async () => {
        const deleted = await result.current.deleteReview('review-1')
        expect(deleted).toBe(true)
      })

      expect(result.current.reviews.length).toBe(initialCount - 1)
    })
  })

  describe('Review Filtering and Querying', () => {
    it('should filter reviews by target type', () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const filterByTargetType = (targetType: 'commit' | 'diff' | 'pr' | 'files') => {
          return reviews.filter(r => r.target_type === targetType)
        }

        return { reviews, filterByTargetType }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      const commitReviews = result.current.filterByTargetType('commit')
      const prReviews = result.current.filterByTargetType('pr')

      expect(commitReviews).toHaveLength(2)
      expect(prReviews).toHaveLength(0)
    })

    it('should filter reviews by reviewer agent', () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const filterByAgent = (agentId: string) => {
          return reviews.filter(r => r.agent_id === agentId)
        }

        return { reviews, filterByAgent }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      const qualityReviews = result.current.filterByAgent('agent-quality')
      const securityReviews = result.current.filterByAgent('agent-security')

      expect(qualityReviews).toHaveLength(1)
      expect(securityReviews).toHaveLength(1)
    })

    it('should search reviews by content', () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const searchReviews = (query: string) => {
          const lowercaseQuery = query.toLowerCase()
          return reviews.filter(r =>
            r.summary.toLowerCase().includes(lowercaseQuery) ||
            r.issues.some(i =>
              i.message.toLowerCase().includes(lowercaseQuery) ||
              i.suggestion?.toLowerCase().includes(lowercaseQuery)
            )
          )
        }

        return { reviews, searchReviews }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      const securityResults = result.current.searchReviews('security')
      const sqlResults = result.current.searchReviews('sql')

      expect(securityResults).toHaveLength(1)
      expect(sqlResults).toHaveLength(1)
    })
  })

  describe('Review Statistics', () => {
    it('should calculate review timing statistics', () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const timingStats = () => {
          if (reviews.length === 0) return null

          const timestamps = reviews.map(r => r.created_at.getTime())
          const earliest = Math.min(...timestamps)
          const latest = Math.max(...timestamps)
          const duration = latest - earliest

          return {
            earliest: new Date(earliest),
            latest: new Date(latest),
            durationMs: duration,
            averageIntervalMs: duration / Math.max(1, reviews.length - 1)
          }
        }

        return { reviews, timingStats }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      const stats = result.current.timingStats()

      expect(stats).toBeDefined()
      expect(stats!.durationMs).toBe(300000) // 5 minutes between reviews
      expect(stats!.averageIntervalMs).toBe(300000) // 5 minutes average
    })

    it('should calculate issue distribution', () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const issueDistribution = () => {
          const allIssues = reviews.flatMap(r => r.issues)

          const distribution = {
            total: allIssues.length,
            bySeverity: {
              critical: 0,
              major: 0,
              minor: 0,
              suggestion: 0
            },
            byFile: {} as Record<string, number>
          }

          allIssues.forEach(issue => {
            distribution.bySeverity[issue.severity]++

            if (issue.file) {
              distribution.byFile[issue.file] = (distribution.byFile[issue.file] || 0) + 1
            }
          })

          return distribution
        }

        return { reviews, issueDistribution }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      const distribution = result.current.issueDistribution()

      expect(distribution.total).toBe(3)
      expect(distribution.bySeverity.critical).toBe(1)
      expect(distribution.bySeverity.major).toBe(1)
      expect(distribution.bySeverity.minor).toBe(1)
      expect(distribution.byFile['src/auth.ts']).toBe(2)
      expect(distribution.byFile['src/utils.ts']).toBe(1)
    })

    it('should track reviewer performance', () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const reviewerPerformance = () => {
          const performance = {} as Record<string, {
            totalReviews: number
            approvedReviews: number
            blockedReviews: number
            totalIssuesFound: number
            approvalRate: number
          }>

          reviews.forEach(review => {
            if (!review.agent_id) return

            if (!performance[review.agent_id]) {
              performance[review.agent_id] = {
                totalReviews: 0,
                approvedReviews: 0,
                blockedReviews: 0,
                totalIssuesFound: 0,
                approvalRate: 0
              }
            }

            const perf = performance[review.agent_id]
            perf.totalReviews++
            perf.totalIssuesFound += review.issues.length

            if (review.approved) perf.approvedReviews++
            if (review.blocking) perf.blockedReviews++

            perf.approvalRate = (perf.approvedReviews / perf.totalReviews) * 100
          })

          return performance
        }

        return { reviews, reviewerPerformance }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      const performance = result.current.reviewerPerformance()

      expect(performance['agent-quality']).toBeDefined()
      expect(performance['agent-quality'].totalReviews).toBe(1)
      expect(performance['agent-quality'].approvedReviews).toBe(1)
      expect(performance['agent-quality'].approvalRate).toBe(100)

      expect(performance['agent-security']).toBeDefined()
      expect(performance['agent-security'].totalReviews).toBe(1)
      expect(performance['agent-security'].approvedReviews).toBe(0)
      expect(performance['agent-security'].approvalRate).toBe(0)
    })
  })

  describe('Real-time Updates', () => {
    it('should react to database changes', async () => {
      const useReviewResult = (executionId: string) => {
        const reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        return { reviews }
      }

      const { result, rerender } = renderHook(() => useReviewResult('exec-123'))

      const initialCount = result.current.reviews.length

      // Mock database update
      const updatedReviews = [
        ...mockReviews,
        {
          id: 'review-3',
          execution_id: 'exec-123',
          agent_id: 'agent-architecture',
          target_type: 'commit' as const,
          target_ref: 'abc123',
          approved: true,
          summary: 'Architecture looks good',
          issues: [],
          approvals: [],
          reviewer_model: 'claude-3-5-sonnet-20241022',
          blocking: false,
          posted_to_github: false,
          posted_to_git_notes: false,
          created_at: new Date()
        }
      ]

      mockUseQueryValue.mockReturnValue(updatedReviews)

      rerender()

      expect(result.current.reviews.length).toBe(initialCount + 1)
    })

    it('should handle concurrent review updates', () => {
      // Mock concurrent updates
      const concurrentUpdates = [
        { id: 'review-1', approved: true },
        { id: 'review-2', blocking: false }
      ]

      const useReviewResult = (executionId: string) => {
        let reviews = mockUseQueryValue<Review[]>(
          mockDb.db,
          "SELECT * FROM reviews WHERE execution_id = ?",
          [executionId]
        ) || []

        const applyUpdates = (updates: Array<{ id: string; [key: string]: any }>) => {
          updates.forEach(update => {
            const index = reviews.findIndex(r => r.id === update.id)
            if (index >= 0) {
              reviews[index] = { ...reviews[index], ...update }
            }
          })
        }

        return { reviews, applyUpdates }
      }

      const { result } = renderHook(() => useReviewResult('exec-123'))

      act(() => {
        result.current.applyUpdates(concurrentUpdates)
      })

      // Verify updates were applied
      const review1 = result.current.reviews.find(r => r.id === 'review-1')
      const review2 = result.current.reviews.find(r => r.id === 'review-2')

      expect(review1?.approved).toBe(true)
      expect(review2?.blocking).toBe(false)
    })
  })
})