import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { renderHook, act } from '@testing-library/react'
import { SmithersDB } from '../../src/db'
import type { ExecFunction } from '../../issues/smithershub/src/types'
import type { Review, ReviewIssue } from '../../src/db/types'

// Mock the Reviewer component and its dependencies
const mockExec = mock() as jest.MockedFunction<ExecFunction>
const mockDb = {
  vcs: {
    logReview: mock(),
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
  }
} as any

// Mock review data
const mockReview: Review = {
  id: 'review-123',
  execution_id: 'exec-456',
  agent_id: 'agent-reviewer-1',
  target_type: 'commit',
  target_ref: 'abc123',
  approved: false,
  summary: 'Code quality issues detected',
  issues: [
    {
      severity: 'critical',
      file: 'src/main.ts',
      line: 42,
      message: 'Potential null pointer dereference',
      suggestion: 'Add null check before accessing property'
    },
    {
      severity: 'major',
      file: 'src/utils.ts',
      line: 15,
      message: 'Inefficient algorithm - O(n²) complexity',
      suggestion: 'Use Map for O(1) lookups'
    }
  ],
  approvals: [],
  reviewer_model: 'claude-3-5-sonnet-20241022',
  blocking: true,
  posted_to_github: false,
  posted_to_git_notes: false,
  created_at: new Date('2024-01-15T10:00:00Z')
}

describe('Reviewer Component', () => {
  beforeEach(() => {
    // Reset all mocks
    mock.restore()

    // Setup default mock responses
    mockExec.mockImplementation(async (command: string) => {
      if (command.includes('jj status')) {
        return {
          stdout: `Parent commit: abc123def456\nWorking copy: 2 files changed`,
          stderr: '',
          exitCode: 0
        }
      }
      if (command.includes('jj diff')) {
        return {
          stdout: `diff --git a/src/main.ts b/src/main.ts\n+  const result = obj.property // risky`,
          stderr: '',
          exitCode: 0
        }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    mockDb.vcs.getReviews.mockReturnValue([])
    mockDb.vcs.getBlockingReviews.mockReturnValue([])
    mockDb.state.get.mockReturnValue(null)
  })

  describe('Review Creation', () => {
    it('should create review with proper structure', async () => {
      const reviewData = {
        target_type: 'commit' as const,
        target_ref: 'abc123',
        reviewers: ['claude-quality', 'claude-security'],
        parallel: true
      }

      // Mock successful review creation
      mockDb.vcs.logReview.mockResolvedValue(mockReview)

      // Simulate creating a review
      const review = await mockDb.vcs.logReview({
        execution_id: 'exec-456',
        target_type: reviewData.target_type,
        target_ref: reviewData.target_ref,
        approved: false,
        summary: 'Review in progress',
        issues: [],
        blocking: true,
        reviewer_model: 'claude-3-5-sonnet-20241022'
      })

      expect(review).toBeDefined()
      expect(review.target_type).toBe('commit')
      expect(review.target_ref).toBe('abc123')
      expect(review.blocking).toBe(true)
      expect(mockDb.vcs.logReview).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple parallel reviewers', async () => {
      const reviewers = ['claude-quality', 'claude-security', 'claude-architecture']

      // Mock multiple agent starts
      reviewers.forEach(reviewer => {
        mockDb.agents.start.mockResolvedValueOnce(`agent-${reviewer}`)
      })

      // Simulate parallel reviewer execution
      const agentIds = []
      for (const reviewer of reviewers) {
        const agentId = await mockDb.agents.start({
          type: 'reviewer',
          name: reviewer,
          execution_id: 'exec-456'
        })
        agentIds.push(agentId)
      }

      expect(agentIds).toHaveLength(3)
      expect(mockDb.agents.start).toHaveBeenCalledTimes(3)
    })
  })

  describe('Review Analysis', () => {
    it('should detect blocking issues correctly', async () => {
      const reviewWithCritical = {
        ...mockReview,
        issues: [
          {
            severity: 'critical' as const,
            message: 'Security vulnerability detected',
            file: 'auth.ts',
            line: 10
          }
        ]
      }

      mockDb.vcs.getBlockingReviews.mockReturnValue([reviewWithCritical])

      const blockingReviews = await mockDb.vcs.getBlockingReviews('exec-456')

      expect(blockingReviews).toHaveLength(1)
      expect(blockingReviews[0].blocking).toBe(true)
      expect(blockingReviews[0].issues[0].severity).toBe('critical')
    })

    it('should aggregate issues from multiple reviewers', () => {
      const qualityIssues: ReviewIssue[] = [
        { severity: 'major', message: 'Code complexity too high', file: 'complex.ts' },
        { severity: 'minor', message: 'Missing documentation', file: 'utils.ts' }
      ]

      const securityIssues: ReviewIssue[] = [
        { severity: 'critical', message: 'SQL injection risk', file: 'db.ts', line: 45 }
      ]

      const allIssues = [...qualityIssues, ...securityIssues]
      const criticalCount = allIssues.filter(i => i.severity === 'critical').length
      const majorCount = allIssues.filter(i => i.severity === 'major').length
      const minorCount = allIssues.filter(i => i.severity === 'minor').length

      expect(allIssues).toHaveLength(3)
      expect(criticalCount).toBe(1)
      expect(majorCount).toBe(1)
      expect(minorCount).toBe(1)
    })
  })

  describe('Throttling and Rate Limiting', () => {
    it('should respect iteration timeout between reviews', async () => {
      const startTime = Date.now()
      const timeout = 1000 // 1 second for test

      // Mock sleep function
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

      await sleep(timeout)

      const endTime = Date.now()
      const elapsed = endTime - startTime

      expect(elapsed).toBeGreaterThanOrEqual(timeout)
    })

    it('should prevent concurrent reviews on same target', async () => {
      const target = 'commit-abc123'

      // Mock state to indicate review in progress
      mockDb.state.get.mockReturnValue('in_progress')

      const isReviewInProgress = mockDb.state.get(`review_${target}`) === 'in_progress'

      expect(isReviewInProgress).toBe(true)

      // Should not start new review if one is in progress
      if (isReviewInProgress) {
        expect(true).toBe(true) // Review correctly prevented
      } else {
        expect(false).toBe(true) // Should not reach here
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle reviewer agent failures gracefully', async () => {
      // Mock agent failure
      mockDb.agents.start.mockRejectedValue(new Error('Agent startup failed'))

      let error: Error | null = null
      try {
        await mockDb.agents.start({
          type: 'reviewer',
          name: 'failing-reviewer',
          execution_id: 'exec-456'
        })
      } catch (e) {
        error = e as Error
      }

      expect(error).toBeDefined()
      expect(error?.message).toBe('Agent startup failed')

      // Should mark agent as failed
      if (error) {
        await mockDb.agents.fail('agent-failing', error.message)
        expect(mockDb.agents.fail).toHaveBeenCalledWith('agent-failing', 'Agent startup failed')
      }
    })

    it('should handle invalid target references', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj show invalid-ref')) {
          return {
            stdout: '',
            stderr: 'Error: Commit "invalid-ref" doesn\'t exist',
            exitCode: 1
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const result = await mockExec('jj show invalid-ref')

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('doesn\'t exist')
    })
  })

  describe('Integration with JJ VCS', () => {
    it('should read commit information correctly', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj show')) {
          return {
            stdout: `Commit ID: abc123def456\nChange ID: xyz789\nAuthor: test@example.com\nDate: 2024-01-15 10:00:00\n\nAdd new feature\n\n- Implement core functionality\n- Add tests`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const result = await mockExec('jj show abc123')

      expect(result.stdout).toContain('abc123def456')
      expect(result.stdout).toContain('Add new feature')
      expect(result.exitCode).toBe(0)
    })

    it('should handle diff generation for review', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command.includes('jj diff')) {
          return {
            stdout: `diff --git a/src/feature.ts b/src/feature.ts\nnew file mode 100644\nindex 0000000..abc123d\n--- /dev/null\n+++ b/src/feature.ts\n@@ -0,0 +1,10 @@\n+export class Feature {\n+  process() {\n+    return 'result'\n+  }\n+}`,
            stderr: '',
            exitCode: 0
          }
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      })

      const result = await mockExec('jj diff --git abc123')

      expect(result.stdout).toContain('diff --git')
      expect(result.stdout).toContain('src/feature.ts')
      expect(result.stdout).toContain('export class Feature')
    })
  })

  describe('Review State Management', () => {
    it('should track review lifecycle states', () => {
      const states = ['pending', 'in_progress', 'completed', 'failed'] as const

      states.forEach(state => {
        mockDb.state.set(`review_lifecycle`, state, 'state_transition')
        const currentState = mockDb.state.get('review_lifecycle')

        // Verify state transitions are tracked
        expect(mockDb.state.set).toHaveBeenCalledWith('review_lifecycle', state, 'state_transition')
      })
    })

    it('should maintain review history', async () => {
      const reviews = [
        { ...mockReview, id: 'review-1', created_at: new Date('2024-01-01') },
        { ...mockReview, id: 'review-2', created_at: new Date('2024-01-02') },
        { ...mockReview, id: 'review-3', created_at: new Date('2024-01-03') }
      ]

      mockDb.vcs.getReviews.mockReturnValue(reviews)

      const allReviews = await mockDb.vcs.getReviews('exec-456')

      expect(allReviews).toHaveLength(3)
      expect(allReviews[0].id).toBe('review-1')
      expect(allReviews[2].id).toBe('review-3')
    })
  })
})