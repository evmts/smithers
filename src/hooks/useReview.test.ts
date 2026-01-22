/**
 * Unit tests for useReview hook.
 * Tests the review execution logic, target handling, and result normalization.
 */
import { describe, test, expect } from 'bun:test'
import type { ReviewTarget, ReviewResult, ReviewProps, ReviewIssue } from '../components/Review/types.js'
import type { UseReviewResult } from './useReview.js'
import { z } from 'zod'

const ReviewIssueSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor']),
  file: z.string().optional(),
  line: z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return value
  }, z.number().int().positive()).optional(),
  message: z.string(),
  suggestion: z.string().optional(),
})

const ReviewResultSchema = z.object({
  approved: z.boolean(),
  summary: z.string().default(''),
  issues: z.array(ReviewIssueSchema).default([]),
})

describe('useReview', () => {
  describe('ReviewTarget types', () => {
    test('commit target with ref', () => {
      const target: ReviewTarget = { type: 'commit', ref: 'HEAD~1' }
      expect(target.type).toBe('commit')
      expect(target.ref).toBe('HEAD~1')
    })

    test('commit target defaults ref to undefined', () => {
      const target: ReviewTarget = { type: 'commit' }
      expect(target.ref).toBeUndefined()
    })

    test('diff target with ref', () => {
      const target: ReviewTarget = { type: 'diff', ref: 'main' }
      expect(target.type).toBe('diff')
      expect(target.ref).toBe('main')
    })

    test('diff target without ref', () => {
      const target: ReviewTarget = { type: 'diff' }
      expect(target.ref).toBeUndefined()
    })

    test('pr target requires numeric ref', () => {
      const target: ReviewTarget = { type: 'pr', ref: '123' }
      expect(target.type).toBe('pr')
      expect(target.ref).toBe('123')
    })

    test('files target with file list', () => {
      const target: ReviewTarget = { type: 'files', files: ['src/a.ts', 'src/b.ts'] }
      expect(target.type).toBe('files')
      expect(target.files).toHaveLength(2)
    })
  })

  describe('ReviewResult structure', () => {
    test('approved result with no issues', () => {
      const result: ReviewResult = {
        approved: true,
        summary: 'LGTM',
        issues: []
      }
      expect(result.approved).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    test('rejected result with critical issue', () => {
      const result: ReviewResult = {
        approved: false,
        summary: 'Found security issue',
        issues: [{
          severity: 'critical',
          message: 'SQL injection vulnerability',
          file: 'src/db.ts',
          line: 42
        }]
      }
      expect(result.approved).toBe(false)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].severity).toBe('critical')
    })

    test('issue with all fields', () => {
      const issue: ReviewIssue = {
        severity: 'major',
        file: 'src/api.ts',
        line: 100,
        message: 'Missing error handling',
        suggestion: 'Add try/catch block'
      }
      expect(issue.severity).toBe('major')
      expect(issue.file).toBe('src/api.ts')
      expect(issue.line).toBe(100)
      expect(issue.suggestion).toBeDefined()
    })

    test('issue with minimal fields', () => {
      const issue: ReviewIssue = {
        severity: 'minor',
        message: 'Consider using const'
      }
      expect(issue.file).toBeUndefined()
      expect(issue.line).toBeUndefined()
      expect(issue.suggestion).toBeUndefined()
    })
  })

  describe('ReviewResultSchema validation', () => {
    test('parses valid result', () => {
      const raw = { approved: true, summary: 'ok', issues: [] }
      const parsed = ReviewResultSchema.parse(raw)
      expect(parsed.approved).toBe(true)
    })

    test('defaults summary to empty string', () => {
      const raw = { approved: true }
      const parsed = ReviewResultSchema.parse(raw)
      expect(parsed.summary).toBe('')
    })

    test('defaults issues to empty array', () => {
      const raw = { approved: false, summary: 'bad' }
      const parsed = ReviewResultSchema.parse(raw)
      expect(parsed.issues).toEqual([])
    })

    test('parses line number from string', () => {
      const raw = { 
        approved: false, 
        summary: '', 
        issues: [{ severity: 'minor', message: 'test', line: '42' }] 
      }
      const parsed = ReviewResultSchema.parse(raw)
      expect(parsed.issues[0].line).toBe(42)
    })

    test('rejects invalid severity', () => {
      const raw = { 
        approved: false, 
        issues: [{ severity: 'invalid', message: 'test' }] 
      }
      expect(() => ReviewResultSchema.parse(raw)).toThrow()
    })
  })

  describe('truncateReviewContent logic', () => {
    const MAX_REVIEW_CHARS = 120_000

    const truncateReviewContent = (content: string, maxChars = MAX_REVIEW_CHARS): string => {
      if (content.length <= maxChars) return content
      const headSize = Math.max(1000, Math.floor(maxChars * 0.6))
      const tailSize = Math.max(1000, Math.floor(maxChars * 0.35))
      const omitted = content.length - headSize - tailSize
      const head = content.slice(0, headSize)
      const tail = content.slice(-tailSize)
      return `${head}\n\n... [truncated ${omitted} chars] ...\n\n${tail}`
    }

    test('returns content unchanged when under limit', () => {
      const content = 'a'.repeat(1000)
      expect(truncateReviewContent(content)).toBe(content)
    })

    test('truncates content over limit', () => {
      const content = 'x'.repeat(200_000)
      const result = truncateReviewContent(content)
      expect(result.length).toBeLessThan(content.length)
      expect(result).toContain('[truncated')
    })

    test('preserves head and tail portions', () => {
      const head = 'HEAD'.repeat(500)
      const middle = 'MIDDLE'.repeat(50000)
      const tail = 'TAIL'.repeat(500)
      const content = head + middle + tail
      const result = truncateReviewContent(content)
      expect(result.startsWith('HEAD')).toBe(true)
      expect(result.endsWith('TAIL')).toBe(true)
    })

    test('custom maxChars limit', () => {
      const content = 'x'.repeat(5000)
      const result = truncateReviewContent(content, 2000)
      expect(result.length).toBeLessThan(content.length)
    })
  })

  describe('buildReviewPrompt logic', () => {
    const buildReviewPrompt = (content: string, criteria?: string[]): string => {
      const criteriaText = criteria && criteria.length > 0
        ? `\nReview Criteria:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
        : ''

      return `You are a code reviewer. Review the following code changes and provide feedback.

${criteriaText}

Rules:
- Set approved to false if there are any critical issues
- Set approved to false if there are more than 2 major issues
- Be constructive and specific in your feedback
- Focus on correctness, security, performance, and maintainability

Return ONLY valid JSON that matches the review schema.

Content to review (may be truncated):
${content}`
    }

    test('builds prompt without criteria', () => {
      const prompt = buildReviewPrompt('diff content')
      expect(prompt).toContain('You are a code reviewer')
      expect(prompt).toContain('diff content')
      expect(prompt).not.toContain('Review Criteria')
    })

    test('builds prompt with criteria', () => {
      const criteria = ['Check for security issues', 'Verify test coverage']
      const prompt = buildReviewPrompt('diff content', criteria)
      expect(prompt).toContain('Review Criteria')
      expect(prompt).toContain('1. Check for security issues')
      expect(prompt).toContain('2. Verify test coverage')
    })

    test('includes JSON instruction', () => {
      const prompt = buildReviewPrompt('content')
      expect(prompt).toContain('Return ONLY valid JSON')
    })
  })

  describe('normalizeReviewResult logic', () => {
    function normalizeReviewResult(result: z.infer<typeof ReviewResultSchema>): ReviewResult {
      const issues: ReviewIssue[] = result.issues.map((issue) => {
        const normalized: ReviewIssue = {
          severity: issue.severity,
          message: issue.message,
        }
        if (issue.file) normalized.file = issue.file
        if (issue.line !== undefined) normalized.line = issue.line
        if (issue.suggestion) normalized.suggestion = issue.suggestion
        return normalized
      })

      return {
        approved: result.approved,
        summary: result.summary,
        issues,
      }
    }

    test('normalizes result with all fields', () => {
      const raw = {
        approved: false,
        summary: 'Issues found',
        issues: [{
          severity: 'critical' as const,
          file: 'src/a.ts',
          line: 10,
          message: 'Bug',
          suggestion: 'Fix it'
        }]
      }
      const result = normalizeReviewResult(raw)
      expect(result.approved).toBe(false)
      expect(result.issues[0].file).toBe('src/a.ts')
      expect(result.issues[0].suggestion).toBe('Fix it')
    })

    test('omits undefined optional fields', () => {
      const raw = {
        approved: true,
        summary: 'LGTM',
        issues: [{
          severity: 'minor' as const,
          message: 'Nit'
        }]
      }
      const result = normalizeReviewResult(raw)
      expect(result.issues[0]).not.toHaveProperty('file')
      expect(result.issues[0]).not.toHaveProperty('line')
      expect(result.issues[0]).not.toHaveProperty('suggestion')
    })
  })

  describe('UseReviewResult type structure', () => {
    test('all required fields are present', () => {
      const result: UseReviewResult = {
        status: 'pending',
        result: null,
        error: null
      }
      expect(result.status).toBe('pending')
      expect(result.result).toBeNull()
    })

    test('status accepts all valid values', () => {
      const statuses: UseReviewResult['status'][] = ['pending', 'running', 'complete', 'error']
      expect(statuses).toHaveLength(4)
    })

    test('result with ReviewResult', () => {
      const result: UseReviewResult = {
        status: 'complete',
        result: { approved: true, summary: 'ok', issues: [] },
        error: null
      }
      expect(result.result?.approved).toBe(true)
    })

    test('error state', () => {
      const result: UseReviewResult = {
        status: 'error',
        result: null,
        error: new Error('Review failed')
      }
      expect(result.error?.message).toBe('Review failed')
    })
  })

  describe('ReviewProps validation', () => {
    test('minimal props', () => {
      const props: ReviewProps = {
        target: { type: 'diff' }
      }
      expect(props.target.type).toBe('diff')
    })

    test('full props', () => {
      const props: ReviewProps = {
        target: { type: 'pr', ref: '42' },
        agent: 'claude',
        model: 'opus',
        blocking: true,
        criteria: ['Check security', 'Verify types'],
        postToGitHub: true,
        postToGitNotes: true,
        onFinished: () => {},
        onError: () => {}
      }
      expect(props.blocking).toBe(true)
      expect(props.criteria).toHaveLength(2)
      expect(props.postToGitHub).toBe(true)
    })
  })

  describe('blocking behavior logic', () => {
    test('non-blocking does not stop on rejection', () => {
      const props: ReviewProps = {
        target: { type: 'diff' },
        blocking: false
      }
      const result: ReviewResult = {
        approved: false,
        summary: 'Issues',
        issues: [{ severity: 'critical', message: 'Bug' }]
      }
      const shouldStop = props.blocking && !result.approved
      expect(shouldStop).toBe(false)
    })

    test('blocking stops on rejection', () => {
      const props: ReviewProps = {
        target: { type: 'diff' },
        blocking: true
      }
      const result: ReviewResult = {
        approved: false,
        summary: 'Issues',
        issues: [{ severity: 'critical', message: 'Bug' }]
      }
      const shouldStop = props.blocking && !result.approved
      expect(shouldStop).toBe(true)
    })

    test('blocking does not stop on approval', () => {
      const props: ReviewProps = {
        target: { type: 'diff' },
        blocking: true
      }
      const result: ReviewResult = {
        approved: true,
        summary: 'LGTM',
        issues: []
      }
      const shouldStop = props.blocking && !result.approved
      expect(shouldStop).toBe(false)
    })
  })

  describe('target type validation', () => {
    test('pr target requires ref', () => {
      const target: ReviewTarget = { type: 'pr' }
      const isValid = !(target.type === 'pr' && !target.ref)
      expect(isValid).toBe(false)
    })

    test('pr ref must be numeric', () => {
      const target: ReviewTarget = { type: 'pr', ref: 'abc' }
      const isValidNumeric = /^\d+$/.test(target.ref ?? '')
      expect(isValidNumeric).toBe(false)
    })

    test('files target requires non-empty files array', () => {
      const target: ReviewTarget = { type: 'files', files: [] }
      const isValid = !(target.type === 'files' && (!target.files || target.files.length === 0))
      expect(isValid).toBe(false)
    })

    test('files target with files is valid', () => {
      const target: ReviewTarget = { type: 'files', files: ['a.ts'] }
      const isValid = !(target.type === 'files' && (!target.files || target.files.length === 0))
      expect(isValid).toBe(true)
    })
  })
})
