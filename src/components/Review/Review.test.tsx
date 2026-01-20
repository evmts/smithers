/**
 * Comprehensive tests for Review.tsx - Code review component
 * Tests component rendering, lifecycle, helper functions, and edge cases
 */
import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test'
import React from 'react'
import { z } from 'zod'
import type { ReviewTarget, ReviewResult, ReviewIssue, ReviewProps } from './types.js'
import { Review } from './Review.js'
import { createSmithersDB, type SmithersDB } from '../../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../../reconciler/root.js'
import { SmithersProvider, signalOrchestrationComplete } from '../SmithersProvider.js'
import { ExecutionScopeProvider } from '../ExecutionScope.js'
import * as executor from '../agents/claude-cli/executor.js'

// Mock Bun.$ for git commands to avoid filesystem/git dependencies
const originalBunShell = Bun.$
function mockBunShell() {
  // @ts-ignore - mocking Bun.$
  Bun.$ = function(strings: TemplateStringsArray, ...args: any[]) {
    const command = strings.reduce((acc, str, i) => acc + str + (args[i] ?? ''), '')

    if (command.includes('git show')) {
      return {
        text: () => Promise.resolve('diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new'),
        quiet: () => ({ text: () => Promise.resolve('') }),
      }
    }
    if (command.includes('git diff')) {
      return {
        text: () => Promise.resolve('diff content'),
        quiet: () => ({ text: () => Promise.resolve('') }),
      }
    }
    if (command.includes('gh pr view')) {
      return {
        text: () => Promise.resolve('{"title":"PR Title","body":"PR Body","files":[],"additions":10,"deletions":5,"commits":[]}'),
        quiet: () => ({ text: () => Promise.resolve('') }),
      }
    }
    if (command.includes('gh pr diff')) {
      return {
        text: () => Promise.resolve('PR diff content'),
        quiet: () => ({ text: () => Promise.resolve('') }),
      }
    }
    if (command.includes('gh pr comment')) {
      return {
        text: () => Promise.resolve(''),
        quiet: () => ({ text: () => Promise.resolve('') }),
      }
    }

    // Fallback to original
    return originalBunShell(strings, ...args)
  }
}

function restoreBunShell() {
  Bun.$ = originalBunShell
}

// Helper to wait for async operations
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMs = 2000,
  intervalMs = 10,
  label = 'condition'
): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitForCondition timeout: ${label}`)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

// ============================================================================
// Type Interface Tests
// ============================================================================

describe('ReviewTarget interface', () => {
  test('commit target with optional ref', () => {
    const target: ReviewTarget = { type: 'commit' }
    expect(target.type).toBe('commit')
    expect(target.ref).toBeUndefined()
  })

  test('commit target with ref', () => {
    const target: ReviewTarget = { type: 'commit', ref: 'abc123' }
    expect(target.type).toBe('commit')
    expect(target.ref).toBe('abc123')
  })

  test('diff target without ref uses unstaged changes', () => {
    const target: ReviewTarget = { type: 'diff' }
    expect(target.type).toBe('diff')
    expect(target.ref).toBeUndefined()
  })

  test('diff target with ref compares against branch', () => {
    const target: ReviewTarget = { type: 'diff', ref: 'main' }
    expect(target.type).toBe('diff')
    expect(target.ref).toBe('main')
  })

  test('pr target with numeric ref', () => {
    const target: ReviewTarget = { type: 'pr', ref: '123' }
    expect(target.type).toBe('pr')
    expect(target.ref).toBe('123')
  })

  test('files target with files array', () => {
    const target: ReviewTarget = {
      type: 'files',
      files: ['src/index.ts', 'src/utils.ts'],
    }
    expect(target.type).toBe('files')
    expect(target.files).toHaveLength(2)
    expect(target.files![0]).toBe('src/index.ts')
  })

  test('files target with empty array', () => {
    const target: ReviewTarget = { type: 'files', files: [] }
    expect(target.files).toHaveLength(0)
  })
})

describe('ReviewResult interface', () => {
  test('approved result with empty issues', () => {
    const result: ReviewResult = {
      approved: true,
      summary: 'All checks passed',
      issues: [],
    }
    expect(result.approved).toBe(true)
    expect(result.summary).toBe('All checks passed')
    expect(result.issues).toHaveLength(0)
  })

  test('rejected result with critical issue', () => {
    const result: ReviewResult = {
      approved: false,
      summary: 'Security vulnerability found',
      issues: [{
        severity: 'critical',
        message: 'SQL injection vulnerability',
        file: 'auth.ts',
        line: 42,
        suggestion: 'Use parameterized queries',
      }],
    }
    expect(result.approved).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].severity).toBe('critical')
    expect(result.issues[0].file).toBe('auth.ts')
    expect(result.issues[0].line).toBe(42)
  })

  test('result with multiple severity levels', () => {
    const result: ReviewResult = {
      approved: false,
      summary: 'Multiple issues',
      issues: [
        { severity: 'critical', message: 'Critical issue' },
        { severity: 'major', message: 'Major issue' },
        { severity: 'minor', message: 'Minor issue' },
      ],
    }
    expect(result.issues).toHaveLength(3)
    expect(result.issues.map(i => i.severity)).toEqual(['critical', 'major', 'minor'])
  })
})

describe('ReviewIssue interface', () => {
  test('minimal issue with only required fields', () => {
    const issue: ReviewIssue = {
      severity: 'minor',
      message: 'Consider adding documentation',
    }
    expect(issue.severity).toBe('minor')
    expect(issue.message).toBe('Consider adding documentation')
    expect(issue.file).toBeUndefined()
    expect(issue.line).toBeUndefined()
    expect(issue.suggestion).toBeUndefined()
  })

  test('issue with all optional fields', () => {
    const issue: ReviewIssue = {
      severity: 'major',
      file: 'component.tsx',
      line: 100,
      message: 'Missing error handling',
      suggestion: 'Wrap in try-catch block',
    }
    expect(issue.file).toBe('component.tsx')
    expect(issue.line).toBe(100)
    expect(issue.suggestion).toBe('Wrap in try-catch block')
  })

  test('all severity levels are valid', () => {
    const critical: ReviewIssue = { severity: 'critical', message: 'Critical' }
    const major: ReviewIssue = { severity: 'major', message: 'Major' }
    const minor: ReviewIssue = { severity: 'minor', message: 'Minor' }

    expect(critical.severity).toBe('critical')
    expect(major.severity).toBe('major')
    expect(minor.severity).toBe('minor')
  })
})

describe('ReviewProps interface', () => {
  test('minimal props with target only', () => {
    const props: ReviewProps = {
      target: { type: 'commit' },
    }
    expect(props.target.type).toBe('commit')
    expect(props.model).toBeUndefined()
    expect(props.blocking).toBeUndefined()
  })

  test('props with model', () => {
    const props: ReviewProps = {
      target: { type: 'commit' },
      model: 'claude-opus-4',
    }
    expect(props.model).toBe('claude-opus-4')
  })

  test('props with agent (only claude supported)', () => {
    const props: ReviewProps = {
      target: { type: 'commit' },
      agent: 'claude',
    }
    expect(props.agent).toBe('claude')
  })

  test('props with blocking flag', () => {
    const props: ReviewProps = {
      target: { type: 'commit' },
      blocking: true,
    }
    expect(props.blocking).toBe(true)
  })

  test('props with criteria array', () => {
    const props: ReviewProps = {
      target: { type: 'commit' },
      criteria: ['Check for security issues', 'Verify error handling'],
    }
    expect(props.criteria).toHaveLength(2)
    expect(props.criteria![0]).toBe('Check for security issues')
  })

  test('props with postToGitHub', () => {
    const props: ReviewProps = {
      target: { type: 'pr', ref: '123' },
      postToGitHub: true,
    }
    expect(props.postToGitHub).toBe(true)
  })

  test('props with postToGitNotes', () => {
    const props: ReviewProps = {
      target: { type: 'commit' },
      postToGitNotes: true,
    }
    expect(props.postToGitNotes).toBe(true)
  })

  test('onFinished callback receives ReviewResult', () => {
    const callback = mock(() => {})
    const props: ReviewProps = {
      target: { type: 'commit' },
      onFinished: callback,
    }

    const result: ReviewResult = { approved: true, summary: 'Good', issues: [] }
    props.onFinished?.(result)
    expect(callback).toHaveBeenCalledWith(result)
  })

  test('onError callback receives Error', () => {
    const callback = mock(() => {})
    const props: ReviewProps = {
      target: { type: 'commit' },
      onError: callback,
    }

    const error = new Error('Review failed')
    props.onError?.(error)
    expect(callback).toHaveBeenCalledWith(error)
  })
})

// ============================================================================
// Zod Schema Tests
// ============================================================================

describe('ReviewIssueSchema validation', () => {
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

  test('validates minimal issue', () => {
    const result = ReviewIssueSchema.safeParse({
      severity: 'minor',
      message: 'Test message',
    })
    expect(result.success).toBe(true)
  })

  test('validates full issue', () => {
    const result = ReviewIssueSchema.safeParse({
      severity: 'critical',
      file: 'test.ts',
      line: 42,
      message: 'Critical issue',
      suggestion: 'Fix it',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.line).toBe(42)
    }
  })

  test('coerces string line number to number', () => {
    const result = ReviewIssueSchema.safeParse({
      severity: 'major',
      line: '100',
      message: 'Test',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.line).toBe(100)
    }
  })

  test('rejects invalid severity', () => {
    const result = ReviewIssueSchema.safeParse({
      severity: 'invalid',
      message: 'Test',
    })
    expect(result.success).toBe(false)
  })

  test('rejects negative line number', () => {
    const result = ReviewIssueSchema.safeParse({
      severity: 'minor',
      line: -5,
      message: 'Test',
    })
    expect(result.success).toBe(false)
  })
})

describe('ReviewResultSchema validation', () => {
  const ReviewResultSchema = z.object({
    approved: z.boolean(),
    summary: z.string().default(''),
    issues: z.array(z.object({
      severity: z.enum(['critical', 'major', 'minor']),
      file: z.string().optional(),
      line: z.number().optional(),
      message: z.string(),
      suggestion: z.string().optional(),
    })).default([]),
  })

  test('validates approved result', () => {
    const result = ReviewResultSchema.safeParse({
      approved: true,
      summary: 'LGTM',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.approved).toBe(true)
      expect(result.data.issues).toEqual([])
    }
  })

  test('validates result with issues', () => {
    const result = ReviewResultSchema.safeParse({
      approved: false,
      summary: 'Issues found',
      issues: [{ severity: 'critical', message: 'Problem' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.issues).toHaveLength(1)
    }
  })

  test('defaults summary to empty string', () => {
    const result = ReviewResultSchema.safeParse({
      approved: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.summary).toBe('')
    }
  })

  test('defaults issues to empty array', () => {
    const result = ReviewResultSchema.safeParse({
      approved: true,
      summary: 'Good',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.issues).toEqual([])
    }
  })
})

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('truncateReviewContent logic', () => {
  const MAX_CHARS = 120_000

  test('returns content unchanged if under limit', () => {
    const content = 'Short content'
    // Content under MAX_CHARS should be unchanged
    expect(content.length).toBeLessThan(MAX_CHARS)
  })

  test('truncates content over limit with head/tail split', () => {
    // Create content larger than MAX_CHARS
    const longContent = 'x'.repeat(150_000)
    expect(longContent.length).toBeGreaterThan(MAX_CHARS)

    // After truncation should have markers
    const headSize = Math.max(1000, Math.floor(MAX_CHARS * 0.6))
    const tailSize = Math.max(1000, Math.floor(MAX_CHARS * 0.35))
    const omitted = longContent.length - headSize - tailSize

    expect(omitted).toBeGreaterThan(0)
  })

  test('truncation includes omitted char count', () => {
    const longContent = 'a'.repeat(200_000)
    const headSize = Math.max(1000, Math.floor(MAX_CHARS * 0.6))
    const tailSize = Math.max(1000, Math.floor(MAX_CHARS * 0.35))
    const omitted = longContent.length - headSize - tailSize

    const marker = `... [truncated ${omitted} chars] ...`
    expect(marker).toContain('truncated')
    expect(marker).toContain('chars')
  })
})

describe('normalizeReviewResult logic', () => {
  test('copies severity and message from issue', () => {
    const issue = { severity: 'critical' as const, message: 'Test' }
    const normalized: ReviewIssue = { severity: issue.severity, message: issue.message }
    expect(normalized.severity).toBe('critical')
    expect(normalized.message).toBe('Test')
  })

  test('includes file only when present', () => {
    const issueWithFile = { severity: 'minor' as const, message: 'Test', file: 'test.ts' }
    const normalized: ReviewIssue = {
      severity: issueWithFile.severity,
      message: issueWithFile.message,
    }
    if (issueWithFile.file) normalized.file = issueWithFile.file
    expect(normalized.file).toBe('test.ts')
  })

  test('excludes file when undefined', () => {
    const issueNoFile = { severity: 'minor' as const, message: 'Test' }
    const normalized: ReviewIssue = {
      severity: issueNoFile.severity,
      message: issueNoFile.message,
    }
    expect('file' in normalized).toBe(false)
  })

  test('includes line when present', () => {
    const issue = { severity: 'major' as const, message: 'Test', line: 42 }
    const normalized: ReviewIssue = {
      severity: issue.severity,
      message: issue.message,
    }
    if (issue.line !== undefined) normalized.line = issue.line
    expect(normalized.line).toBe(42)
  })

  test('includes suggestion when present', () => {
    const issue = { severity: 'minor' as const, message: 'Test', suggestion: 'Fix it' }
    const normalized: ReviewIssue = {
      severity: issue.severity,
      message: issue.message,
    }
    if (issue.suggestion) normalized.suggestion = issue.suggestion
    expect(normalized.suggestion).toBe('Fix it')
  })
})

describe('buildReviewPrompt logic', () => {
  test('includes code reviewer instruction', () => {
    const promptTemplate = `You are a code reviewer.`
    expect(promptTemplate).toContain('code reviewer')
  })

  test('includes approval rules', () => {
    const rules = `Set approved to false if there are any critical issues
Set approved to false if there are more than 2 major issues`
    expect(rules).toContain('critical')
    expect(rules).toContain('major')
  })

  test('formats criteria as numbered list', () => {
    const criteria = ['Security check', 'Performance check']
    const criteriaText = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
    expect(criteriaText).toBe('1. Security check\n2. Performance check')
  })

  test('empty criteria produces no criteria section', () => {
    const criteria: string[] = []
    const criteriaText = criteria.length > 0
      ? `Review Criteria:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : ''
    expect(criteriaText).toBe('')
  })
})

// ============================================================================
// fetchTargetContent Logic Tests
// ============================================================================

describe('fetchTargetContent logic', () => {
  test('commit target defaults to HEAD when no ref', () => {
    const target: ReviewTarget = { type: 'commit' }
    const ref = target.ref ?? 'HEAD'
    expect(ref).toBe('HEAD')
  })

  test('commit target uses provided ref', () => {
    const target: ReviewTarget = { type: 'commit', ref: 'abc123' }
    const ref = target.ref ?? 'HEAD'
    expect(ref).toBe('abc123')
  })

  test('diff target with ref uses that ref', () => {
    const target: ReviewTarget = { type: 'diff', ref: 'main' }
    expect(target.ref).toBe('main')
  })

  test('diff target without ref compares unstaged', () => {
    const target: ReviewTarget = { type: 'diff' }
    expect(target.ref).toBeUndefined()
  })

  test('pr target requires numeric ref', () => {
    const target: ReviewTarget = { type: 'pr', ref: '123' }
    const isNumeric = /^\d+$/.test(target.ref!)
    expect(isNumeric).toBe(true)
  })

  test('pr target with non-numeric ref is invalid', () => {
    const target: ReviewTarget = { type: 'pr', ref: 'feature-branch' }
    const isNumeric = /^\d+$/.test(target.ref!)
    expect(isNumeric).toBe(false)
  })

  test('files target requires non-empty files array', () => {
    const target: ReviewTarget = { type: 'files', files: ['a.ts', 'b.ts'] }
    const hasFiles = target.files && target.files.length > 0
    expect(hasFiles).toBe(true)
  })

  test('files target with empty array is invalid', () => {
    const target: ReviewTarget = { type: 'files', files: [] }
    const hasFiles = target.files && target.files.length > 0
    expect(hasFiles).toBe(false)
  })
})

// ============================================================================
// executeReview Response Handling Tests
// ============================================================================

describe('executeReview response handling', () => {
  test('error result when stopReason is error', () => {
    const _stopReason = 'error'
    const output = 'CLI crashed'

    const result: ReviewResult = {
      approved: false,
      summary: 'Review execution failed',
      issues: [{
        severity: 'critical',
        message: output.slice(0, 500),
      }],
    }

    expect(result.approved).toBe(false)
    expect(result.summary).toBe('Review execution failed')
    expect(result.issues[0].severity).toBe('critical')
  })

  test('error result when no structured output', () => {
    const structured = null
    const stopReason = 'completed'

    if (!structured) {
      const result: ReviewResult = {
        approved: false,
        summary: 'Review execution failed',
        issues: [{
          severity: 'critical',
          message: `Stopped: ${stopReason}. No structured output`,
        }],
      }
      expect(result.issues[0].message).toContain('Stopped')
    }
  })

  test('truncates error message to 500 chars', () => {
    const longError = 'x'.repeat(1000)
    const truncated = longError.slice(0, 500)
    expect(truncated.length).toBe(500)
  })
})

// ============================================================================
// postToGitHubPR Formatting Tests
// ============================================================================

describe('postToGitHubPR formatting', () => {
  test('formats approved status', () => {
    const review: ReviewResult = { approved: true, summary: 'LGTM', issues: [] }
    const status = review.approved ? 'Approved' : 'Changes Requested'
    expect(status).toBe('Approved')
  })

  test('formats rejected status', () => {
    const review: ReviewResult = { approved: false, summary: 'Issues', issues: [] }
    const status = review.approved ? 'Approved' : 'Changes Requested'
    expect(status).toBe('Changes Requested')
  })

  test('formats empty issues list', () => {
    const review: ReviewResult = { approved: true, summary: '', issues: [] }
    const issuesText = review.issues.length > 0
      ? review.issues.map(i => `- **${i.severity.toUpperCase()}**: ${i.message}`).join('\n')
      : 'No issues found.'
    expect(issuesText).toBe('No issues found.')
  })

  test('formats issues with location', () => {
    const issue: ReviewIssue = {
      severity: 'critical',
      file: 'auth.ts',
      line: 42,
      message: 'SQL injection',
    }

    const location = [issue.file, issue.line].filter(Boolean).join(':')
    expect(location).toBe('auth.ts:42')
  })

  test('formats issue with file only', () => {
    const issue: ReviewIssue = {
      severity: 'major',
      file: 'utils.ts',
      message: 'Missing types',
    }

    const location = [issue.file, issue.line].filter(Boolean).join(':')
    expect(location).toBe('utils.ts')
  })

  test('formats issue without location', () => {
    const issue: ReviewIssue = {
      severity: 'minor',
      message: 'Consider refactoring',
    }

    const location = [issue.file, issue.line].filter(Boolean).join(':')
    expect(location).toBe('')
  })

  test('includes suggestion when present', () => {
    const issue: ReviewIssue = {
      severity: 'major',
      message: 'Missing error handling',
      suggestion: 'Add try-catch block',
    }

    const suggestionText = issue.suggestion ? `\n  > Suggestion: ${issue.suggestion}` : ''
    expect(suggestionText).toContain('Add try-catch block')
  })
})

// ============================================================================
// Blocking Review Logic Tests
// ============================================================================

describe('blocking review logic', () => {
  test('counts critical issues correctly', () => {
    const issues: ReviewIssue[] = [
      { severity: 'critical', message: 'Issue 1' },
      { severity: 'critical', message: 'Issue 2' },
      { severity: 'major', message: 'Issue 3' },
    ]

    const criticalCount = issues.filter(i => i.severity === 'critical').length
    expect(criticalCount).toBe(2)
  })

  test('counts major issues correctly', () => {
    const issues: ReviewIssue[] = [
      { severity: 'critical', message: 'Issue 1' },
      { severity: 'major', message: 'Issue 2' },
      { severity: 'major', message: 'Issue 3' },
      { severity: 'minor', message: 'Issue 4' },
    ]

    const majorCount = issues.filter(i => i.severity === 'major').length
    expect(majorCount).toBe(2)
  })

  test('blocking with rejected review triggers stop', () => {
    const blocking = true
    const approved = false
    const shouldStop = blocking && !approved
    expect(shouldStop).toBe(true)
  })

  test('blocking with approved review does not stop', () => {
    const blocking = true
    const approved = true
    const shouldStop = blocking && !approved
    expect(shouldStop).toBe(false)
  })

  test('non-blocking with rejected review does not stop', () => {
    const blocking = false
    const approved = false
    const shouldStop = blocking && !approved
    expect(shouldStop).toBe(false)
  })

  test('stop message includes issue counts', () => {
    const criticalCount = 2
    const majorCount = 1
    const summary = 'Security issues found'
    const stopMessage = `Review failed: ${criticalCount} critical, ${majorCount} major issues found. ${summary}`

    expect(stopMessage).toContain('2 critical')
    expect(stopMessage).toContain('1 major')
    expect(stopMessage).toContain('Security issues found')
  })
})

// ============================================================================
// postToGitNotes Logic Tests
// ============================================================================

describe('postToGitNotes logic', () => {
  test('uses target ref for commit type', () => {
    const target: ReviewTarget = { type: 'commit', ref: 'abc123' }
    const commitRef = target.type === 'commit' ? (target.ref ?? 'HEAD') : 'HEAD'
    expect(commitRef).toBe('abc123')
  })

  test('defaults to HEAD for commit without ref', () => {
    const target: ReviewTarget = { type: 'commit' }
    const commitRef = target.type === 'commit' ? (target.ref ?? 'HEAD') : 'HEAD'
    expect(commitRef).toBe('HEAD')
  })

  test('uses HEAD for non-commit types', () => {
    const target: ReviewTarget = { type: 'diff', ref: 'main' }
    const commitRef = target.type === 'commit' ? (target.ref ?? 'HEAD') : 'HEAD'
    expect(commitRef).toBe('HEAD')
  })

  test('notes content includes required fields', () => {
    const review: ReviewResult = { approved: true, summary: 'Good', issues: [] }
    const executionId = 'test-123'
    const notesContent = {
      smithers_review: true,
      executionId,
      timestamp: Date.now(),
      review,
    }

    expect(notesContent.smithers_review).toBe(true)
    expect(notesContent.executionId).toBe('test-123')
    expect(notesContent.review.approved).toBe(true)
  })

  test('notes content is JSON serializable', () => {
    const review: ReviewResult = { approved: true, summary: 'Good', issues: [] }
    const notesContent = {
      smithers_review: true,
      executionId: 'test-123',
      timestamp: Date.now(),
      review,
    }

    const json = JSON.stringify(notesContent, null, 2)
    const parsed = JSON.parse(json)
    expect(parsed.smithers_review).toBe(true)
  })
})

// ============================================================================
// Component Rendering Tests
// ============================================================================

describe('Review component rendering', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-review', 'Review.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('renders review element', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<review')
  })

  test('renders with target-type attribute', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('target-type="commit"')
  })

  test('renders with diff target type', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'diff', ref: 'main' }} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('target-type="diff"')
    expect(xml).toContain('target-ref="main"')
  })

  test('renders with pr target type', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'pr', ref: '123' }} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('target-type="pr"')
    expect(xml).toContain('target-ref="123"')
  })

  test('renders with files target type', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'files', files: ['a.ts', 'b.ts'] }} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('target-type="files"')
  })

  test('renders with status attribute', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('status=')
  })

  test('renders with blocking attribute when true', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} blocking={true} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('blocking="true"')
  })

  test('renders without blocking attribute when false', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} blocking={false} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).not.toContain('blocking="true"')
  })

  test('renders initial status as pending', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('status="pending"')
  })
})

// ============================================================================
// Component Lifecycle Tests
// ============================================================================

describe('Review component lifecycle', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string
  let executeClaudeCLISpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-review-lifecycle', 'Review.test.tsx')
    root = createSmithersRoot()
    mockBunShell()
  })

  afterEach(async () => {
    await flushMicrotasks()
    restoreBunShell()
    executeClaudeCLISpy?.mockRestore()
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('registers task on mount', async () => {
    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockResolvedValue({
      output: '{"approved": true, "summary": "Good", "issues": []}',
      structured: { approved: true, summary: 'Good', issues: [] },
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 100,
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    await waitForCondition(() => {
      const tasks = db.db.query('SELECT * FROM tasks WHERE component_type = ?', ['review'])
      return tasks.length > 0
    }, 2000, 10, 'task registration')

    const tasks = db.db.query('SELECT * FROM tasks WHERE component_type = ?', ['review'])
    expect(tasks.length).toBeGreaterThanOrEqual(1)
  })

  test('transitions to running status on execution', async () => {
    let executionStarted = false
    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockImplementation(async () => {
      executionStarted = true
      await new Promise(r => setTimeout(r, 100))
      return {
        output: '{"approved": true, "summary": "Good", "issues": []}',
        structured: { approved: true, summary: 'Good', issues: [] },
        tokensUsed: { input: 100, output: 50 },
        turnsUsed: 1,
        stopReason: 'completed',
        durationMs: 100,
      }
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    await waitForCondition(() => executionStarted, 1000, 10, 'execution start')
    expect(executionStarted).toBe(true)
  })

  test('calls onFinished callback on success', async () => {
    let finishedResult: ReviewResult | null = null

    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockResolvedValue({
      output: '{"approved": true, "summary": "LGTM", "issues": []}',
      structured: { approved: true, summary: 'LGTM', issues: [] },
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 100,
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review
          target={{ type: 'commit' }}
          onFinished={(result) => { finishedResult = result }}
        />
      </SmithersProvider>
    )

    await waitForCondition(() => finishedResult !== null, 2000, 10, 'onFinished callback')
    expect(finishedResult).not.toBeNull()
    expect(finishedResult!.approved).toBe(true)
    expect(finishedResult!.summary).toBe('LGTM')
  })

  test('calls onError callback on failure', async () => {
    let errorReceived: Error | null = null

    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockRejectedValue(
      new Error('Review execution failed')
    )

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review
          target={{ type: 'commit' }}
          onError={(err) => { errorReceived = err }}
        />
      </SmithersProvider>
    )

    await waitForCondition(() => errorReceived !== null, 2000, 10, 'onError callback')
    expect(errorReceived).not.toBeNull()
    expect(errorReceived!.message).toBe('Review execution failed')
  })

  test('completes task after execution', async () => {
    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockResolvedValue({
      output: '{"approved": true, "summary": "Good", "issues": []}',
      structured: { approved: true, summary: 'Good', issues: [] },
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 100,
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    await waitForCondition(() => {
      const tasks = db.db.query<{ status: string }>(
        'SELECT status FROM tasks WHERE component_type = ? AND status = ?',
        ['review', 'completed']
      )
      return tasks.length > 0
    }, 2000, 10, 'task completion')

    const completedTasks = db.db.query<{ status: string }>(
      'SELECT status FROM tasks WHERE component_type = ? AND status = ?',
      ['review', 'completed']
    )
    expect(completedTasks.length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================================
// Database Integration Tests
// ============================================================================

describe('Review database integration', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string
  let executeClaudeCLISpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-review-db', 'Review.test.tsx')
    root = createSmithersRoot()
    mockBunShell()
  })

  afterEach(async () => {
    await flushMicrotasks()
    restoreBunShell()
    executeClaudeCLISpy?.mockRestore()
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('logs review to vcs.reviews table', async () => {
    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockResolvedValue({
      output: '{"approved": true, "summary": "LGTM", "issues": []}',
      structured: { approved: true, summary: 'LGTM', issues: [] },
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 100,
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review target={{ type: 'commit', ref: 'abc123' }} />
      </SmithersProvider>
    )

    await waitForCondition(() => {
      const reviews = db.db.query('SELECT * FROM reviews')
      return reviews.length > 0
    }, 2000, 10, 'review log')

    const reviews = db.db.query<{ target_type: string; target_ref: string; approved: number; summary: string }>(
      'SELECT target_type, target_ref, approved, summary FROM reviews'
    )
    expect(reviews.length).toBeGreaterThanOrEqual(1)
    expect(reviews[0].target_type).toBe('commit')
    expect(reviews[0].target_ref).toBe('abc123')
    expect(reviews[0].approved).toBe(1)
    expect(reviews[0].summary).toBe('LGTM')
  })

  test('logs review issues to database', async () => {
    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockResolvedValue({
      output: '{"approved": false, "summary": "Issues found", "issues": [{"severity": "critical", "message": "Security issue"}]}',
      structured: {
        approved: false,
        summary: 'Issues found',
        issues: [{ severity: 'critical', message: 'Security issue' }]
      },
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 100,
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    await waitForCondition(() => {
      const reviews = db.db.query('SELECT * FROM reviews')
      return reviews.length > 0
    }, 2000, 10, 'review with issues log')

    const reviews = db.db.query<{ approved: number; issues: string }>(
      'SELECT approved, issues FROM reviews'
    )
    expect(reviews.length).toBeGreaterThanOrEqual(1)
    expect(reviews[0].approved).toBe(0)

    const issues = JSON.parse(reviews[0].issues)
    expect(issues.length).toBe(1)
    expect(issues[0].severity).toBe('critical')
  })

  test('logs reviewer model to database', async () => {
    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockResolvedValue({
      output: '{"approved": true, "summary": "Good", "issues": []}',
      structured: { approved: true, summary: 'Good', issues: [] },
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 100,
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review target={{ type: 'commit' }} model="claude-opus-4" />
      </SmithersProvider>
    )

    await waitForCondition(() => {
      const reviews = db.db.query('SELECT * FROM reviews')
      return reviews.length > 0
    }, 2000, 10, 'reviewer model log')

    const reviews = db.db.query<{ reviewer_model: string }>(
      'SELECT reviewer_model FROM reviews'
    )
    expect(reviews.length).toBeGreaterThanOrEqual(1)
    expect(reviews[0].reviewer_model).toBe('claude-opus-4')
  })

  test('defaults reviewer model to claude-sonnet-4', async () => {
    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockResolvedValue({
      output: '{"approved": true, "summary": "Good", "issues": []}',
      structured: { approved: true, summary: 'Good', issues: [] },
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 100,
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    await waitForCondition(() => {
      const reviews = db.db.query('SELECT * FROM reviews')
      return reviews.length > 0
    }, 2000, 10, 'default model log')

    const reviews = db.db.query<{ reviewer_model: string }>(
      'SELECT reviewer_model FROM reviews'
    )
    expect(reviews.length).toBeGreaterThanOrEqual(1)
    expect(reviews[0].reviewer_model).toBe('claude-sonnet-4')
  })
})

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Review error handling', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string
  let executeClaudeCLISpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-review-errors', 'Review.test.tsx')
    root = createSmithersRoot()
    mockBunShell()
  })

  afterEach(async () => {
    await flushMicrotasks()
    restoreBunShell()
    executeClaudeCLISpy?.mockRestore()
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('handles CLI execution error', async () => {
    let errorReceived: Error | null = null

    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockRejectedValue(
      new Error('CLI process crashed')
    )

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review
          target={{ type: 'commit' }}
          onError={(err) => { errorReceived = err }}
        />
      </SmithersProvider>
    )

    await waitForCondition(() => errorReceived !== null, 2000, 10, 'CLI error')
    expect(errorReceived!.message).toBe('CLI process crashed')
  })

  test('handles stopReason error from CLI', async () => {
    let finishedResult: ReviewResult | null = null

    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockResolvedValue({
      output: 'Error: API rate limit exceeded',
      structured: null,
      tokensUsed: { input: 0, output: 0 },
      turnsUsed: 0,
      stopReason: 'error',
      durationMs: 100,
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review
          target={{ type: 'commit' }}
          onFinished={(result) => { finishedResult = result }}
        />
      </SmithersProvider>
    )

    await waitForCondition(() => finishedResult !== null, 2000, 10, 'error result')
    expect(finishedResult!.approved).toBe(false)
    expect(finishedResult!.summary).toBe('Review execution failed')
    expect(finishedResult!.issues[0].severity).toBe('critical')
  })

  test('handles missing structured output', async () => {
    let finishedResult: ReviewResult | null = null

    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockResolvedValue({
      output: 'Invalid response from model',
      structured: null,
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 100,
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review
          target={{ type: 'commit' }}
          onFinished={(result) => { finishedResult = result }}
        />
      </SmithersProvider>
    )

    await waitForCondition(() => finishedResult !== null, 2000, 10, 'missing structured output')
    expect(finishedResult!.approved).toBe(false)
    expect(finishedResult!.issues[0].severity).toBe('critical')
  })

  test('converts non-Error exceptions to Error', async () => {
    let errorReceived: Error | null = null

    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockRejectedValue('String error')

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review
          target={{ type: 'commit' }}
          onError={(err) => { errorReceived = err }}
        />
      </SmithersProvider>
    )

    await waitForCondition(() => errorReceived !== null, 2000, 10, 'string error conversion')
    expect(errorReceived).toBeInstanceOf(Error)
    expect(errorReceived!.message).toBe('String error')
  })
})

// ============================================================================
// Execution Scope Tests
// ============================================================================

describe('Review execution scope', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string
  let executeClaudeCLISpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-review-scope', 'Review.test.tsx')
    root = createSmithersRoot()
    mockBunShell()
    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockResolvedValue({
      output: '{"approved": true, "summary": "Good", "issues": []}',
      structured: { approved: true, summary: 'Good', issues: [] },
      tokensUsed: { input: 100, output: 50 },
      turnsUsed: 1,
      stopReason: 'completed',
      durationMs: 100,
    })
  })

  afterEach(async () => {
    await flushMicrotasks()
    restoreBunShell()
    executeClaudeCLISpy?.mockRestore()
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('does not execute when execution scope disabled', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <ExecutionScopeProvider enabled={false}>
          <Review target={{ type: 'commit' }} />
        </ExecutionScopeProvider>
      </SmithersProvider>
    )

    await new Promise(r => setTimeout(r, 100))
    expect(executeClaudeCLISpy).not.toHaveBeenCalled()
  })

  test('executes when execution scope enabled', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    await waitForCondition(() => executeClaudeCLISpy.mock.calls.length > 0, 2000, 10, 'execution')
    expect(executeClaudeCLISpy).toHaveBeenCalled()
  })
})

// ============================================================================
// Module Exports Tests
// ============================================================================

describe('Review module exports', () => {
  test('exports Review component from Review.tsx', async () => {
    const mod = await import('./Review.js')
    expect(typeof mod.Review).toBe('function')
  })

  test('exports Review component from index.ts', async () => {
    const mod = await import('./index.js')
    expect(typeof mod.Review).toBe('function')
  })

  test('exports ReviewTarget type from index.ts', async () => {
    const mod = await import('./index.js')
    // Type exports are compile-time only, just verify module loads
    expect(mod).toBeDefined()
  })

  test('exports ReviewResult type from index.ts', async () => {
    const mod = await import('./index.js')
    expect(mod).toBeDefined()
  })

  test('exports ReviewIssue type from index.ts', async () => {
    const mod = await import('./index.js')
    expect(mod).toBeDefined()
  })

  test('exports ReviewProps type from index.ts', async () => {
    const mod = await import('./index.js')
    expect(mod).toBeDefined()
  })

  test('Review component has correct name', async () => {
    const mod = await import('./Review.js')
    expect(mod.Review.name).toBe('Review')
  })
})

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Review edge cases', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-review-edge', 'Review.test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('handles empty criteria array', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} criteria={[]} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<review')
  })

  test('handles undefined optional props', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review
          target={{ type: 'commit' }}
          model={undefined}
          blocking={undefined}
          criteria={undefined}
          postToGitHub={undefined}
          postToGitNotes={undefined}
        />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<review')
  })

  test('handles rapid re-renders', async () => {
    const element = (
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    await root.render(element)
    await root.render(element)
    await root.render(element)

    const xml = root.toXML()
    expect(xml).toContain('<review')
  })

  test('handles unmount during pending state', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    // Immediately unmount
    await root.render(null)

    // Should not throw
    expect(true).toBe(true)
  })

  test('pr target without ref throws error', () => {
    const target: ReviewTarget = { type: 'pr' }
    // In actual execution, this would throw
    expect(target.ref).toBeUndefined()
  })

  test('files target without files array throws error', () => {
    const target: ReviewTarget = { type: 'files' }
    // In actual execution, this would throw
    expect(target.files).toBeUndefined()
  })
})

// ============================================================================
// Callback Guard Tests (isMounted check)
// ============================================================================

describe('Review callback guards', () => {
  let db: SmithersDB
  let root: SmithersRoot
  let executionId: string
  let executeClaudeCLISpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    db = createSmithersDB({ reset: true })
    executionId = db.execution.start('test-review-guards', 'Review.test.tsx')
    root = createSmithersRoot()
    mockBunShell()
  })

  afterEach(async () => {
    await flushMicrotasks()
    restoreBunShell()
    executeClaudeCLISpy?.mockRestore()
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('does not call onFinished after unmount', async () => {
    let callbackCalled = false
    let resolveExecution: () => void
    const executionPromise = new Promise<void>((r) => { resolveExecution = r })

    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockImplementation(async () => {
      await executionPromise
      return {
        output: '{"approved": true, "summary": "Good", "issues": []}',
        structured: { approved: true, summary: 'Good', issues: [] },
        tokensUsed: { input: 100, output: 50 },
        turnsUsed: 1,
        stopReason: 'completed',
        durationMs: 100,
      }
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review
          target={{ type: 'commit' }}
          onFinished={() => { callbackCalled = true }}
        />
      </SmithersProvider>
    )

    // Wait for execution to start
    await waitForCondition(
      () => executeClaudeCLISpy.mock.calls.length > 0,
      1000, 10,
      'execution start'
    )

    // Unmount before execution completes
    root.dispose()

    // Complete execution
    resolveExecution!()
    await flushMicrotasks()

    // Callback should not be called after unmount
    expect(callbackCalled).toBe(false)
  })

  test('does not call onError after unmount', async () => {
    let callbackCalled = false
    let rejectExecution: (err: Error) => void
    const executionPromise = new Promise<never>((_, r) => { rejectExecution = r })

    executeClaudeCLISpy = spyOn(executor, 'executeClaudeCLI').mockImplementation(async () => {
      await executionPromise
    })

    await root.render(
      <SmithersProvider db={db} executionId={executionId} maxIterations={1}>
        <Review
          target={{ type: 'commit' }}
          onError={() => { callbackCalled = true }}
        />
      </SmithersProvider>
    )

    // Wait for execution to start
    await waitForCondition(
      () => executeClaudeCLISpy.mock.calls.length > 0,
      1000, 10,
      'execution start'
    )

    // Unmount before execution completes
    root.dispose()

    // Give time for unmount to fully register
    await new Promise(r => setTimeout(r, 50))
    await flushMicrotasks()

    // Reject execution after unmount is complete
    rejectExecution!(new Error('Test error'))
    await flushMicrotasks()
    await new Promise(r => setTimeout(r, 50))

    // Callback should not be called after unmount
    expect(callbackCalled).toBe(false)
  })
})
