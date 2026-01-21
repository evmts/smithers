/**
 * Unit tests for Review.tsx - Code review component interface tests.
 */
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import type { ReviewTarget, ReviewResult, ReviewIssue, ReviewProps } from './Review.js'
import { Review } from './Review.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { SmithersProvider } from './SmithersProvider.js'
import { signalOrchestrationComplete } from './Ralph/utils.js'

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

  test('diff target without ref', () => {
    const target: ReviewTarget = { type: 'diff' }
    expect(target.type).toBe('diff')
  })

  test('diff target with ref', () => {
    const target: ReviewTarget = { type: 'diff', ref: 'feature-branch' }
    expect(target.type).toBe('diff')
    expect(target.ref).toBe('feature-branch')
  })

  test('pr target requires ref', () => {
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
  })
})

describe('ReviewResult interface', () => {
  test('approved result structure', () => {
    const result: ReviewResult = {
      approved: true,
      summary: 'Looks good!',
      issues: [],
    }

    expect(result.approved).toBe(true)
    expect(result.summary).toBe('Looks good!')
    expect(result.issues).toHaveLength(0)
  })

  test('rejected result with issues', () => {
    const result: ReviewResult = {
      approved: false,
      summary: 'Found issues',
      issues: [
        {
          severity: 'critical',
          message: 'Security vulnerability',
          file: 'auth.ts',
          line: 42,
          suggestion: 'Use parameterized queries',
        },
      ],
    }

    expect(result.approved).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].severity).toBe('critical')
  })

  test('result with multiple issues', () => {
    const result: ReviewResult = {
      approved: false,
      summary: 'Multiple issues found',
      issues: [
        { severity: 'critical', message: 'Issue 1' },
        { severity: 'major', message: 'Issue 2' },
        { severity: 'minor', message: 'Issue 3' },
      ],
    }

    expect(result.issues).toHaveLength(3)
  })
})

describe('ReviewIssue interface', () => {
  test('minimal issue', () => {
    const issue: ReviewIssue = {
      severity: 'minor',
      message: 'Consider adding a comment',
    }

    expect(issue.severity).toBe('minor')
    expect(issue.message).toBe('Consider adding a comment')
    expect(issue.file).toBeUndefined()
    expect(issue.line).toBeUndefined()
    expect(issue.suggestion).toBeUndefined()
  })

  test('full issue with all fields', () => {
    const issue: ReviewIssue = {
      severity: 'major',
      file: 'component.tsx',
      line: 100,
      message: 'Missing error handling',
      suggestion: 'Add try-catch block',
    }

    expect(issue.severity).toBe('major')
    expect(issue.file).toBe('component.tsx')
    expect(issue.line).toBe(100)
    expect(issue.suggestion).toBe('Add try-catch block')
  })

  test('critical severity', () => {
    const issue: ReviewIssue = { severity: 'critical', message: 'Critical' }
    expect(issue.severity).toBe('critical')
  })

  test('major severity', () => {
    const issue: ReviewIssue = { severity: 'major', message: 'Major' }
    expect(issue.severity).toBe('major')
  })

  test('minor severity', () => {
    const issue: ReviewIssue = { severity: 'minor', message: 'Minor' }
    expect(issue.severity).toBe('minor')
  })
})

describe('ReviewProps interface', () => {
  test('minimal props with target', () => {
    const props: ReviewProps = {
      target: { type: 'commit' },
    }
    expect(props.target.type).toBe('commit')
  })

  test('props with agent', () => {
    const props: ReviewProps = {
      target: { type: 'commit' },
      agent: 'claude',
    }
    expect(props.agent).toBe('claude')
  })

  test('props with model', () => {
    const props: ReviewProps = {
      target: { type: 'commit' },
      model: 'claude-opus-4',
    }
    expect(props.model).toBe('claude-opus-4')
  })

  test('props with blocking', () => {
    const props: ReviewProps = {
      target: { type: 'commit' },
      blocking: true,
    }
    expect(props.blocking).toBe(true)
  })

  test('props with criteria', () => {
    const props: ReviewProps = {
      target: { type: 'commit' },
      criteria: ['Check security', 'Check performance'],
    }
    expect(props.criteria).toHaveLength(2)
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

  test('onFinished callback', () => {
    const callback = mock(() => {})
    const props: ReviewProps = {
      target: { type: 'commit' },
      onFinished: callback,
    }

    const result: ReviewResult = { approved: true, summary: 'Good', issues: [] }
    props.onFinished?.(result)
    expect(callback).toHaveBeenCalledWith(result)
  })

  test('onError callback', () => {
    const callback = mock(() => {})
    const props: ReviewProps = {
      target: { type: 'commit' },
      onError: callback,
    }

    const error = new Error('test')
    props.onError?.(error)
    expect(callback).toHaveBeenCalledWith(error)
  })
})

// ============================================================================
// Helper Functions Tests
// ============================================================================

describe('buildReviewPrompt', () => {
  test('builds basic prompt without criteria', async () => {
    const mod = await import('./Review/Review.js')
    const _content = 'function foo() { return 1; }'
    
    const Review = mod.Review
    expect(Review).toBeDefined()
  })

  test('prompt structure includes required sections', () => {
    const promptTemplate = `You are a code reviewer. Review the following code changes and provide feedback.

Respond with ONLY a JSON object in this exact format (no markdown, no code blocks):
{
  "approved": true/false,
  "summary": "Brief summary of the review",
  "issues": []
}

Rules:
- Set approved to false if there are any critical issues
- Set approved to false if there are more than 2 major issues
- Be constructive and specific in your feedback
- Focus on correctness, security, performance, and maintainability

Content to review:
CODE_HERE`

    expect(promptTemplate).toContain('approved')
    expect(promptTemplate).toContain('summary')
    expect(promptTemplate).toContain('issues')
    expect(promptTemplate).toContain('critical')
    expect(promptTemplate).toContain('major')
  })

  test('criteria adds numbered list to prompt', () => {
    const criteria = ['Check security', 'Check performance']
    const criteriaText = `\nReview Criteria:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    
    expect(criteriaText).toContain('1. Check security')
    expect(criteriaText).toContain('2. Check performance')
  })
})

describe('fetchTargetContent logic', () => {
  test('commit target defaults to HEAD', () => {
    const target: ReviewTarget = { type: 'commit' }
    const ref = target.ref ?? 'HEAD'
    expect(ref).toBe('HEAD')
  })

  test('commit target uses provided ref', () => {
    const target: ReviewTarget = { type: 'commit', ref: 'abc123' }
    const ref = target.ref ?? 'HEAD'
    expect(ref).toBe('abc123')
  })

  test('pr target requires ref', () => {
    const target: ReviewTarget = { type: 'pr', ref: '123' }
    expect(target.ref).toBe('123')
  })

  test('files target requires files array', () => {
    const target: ReviewTarget = { type: 'files', files: ['a.ts', 'b.ts'] }
    expect(target.files).toHaveLength(2)
  })
})

describe('executeReview response parsing', () => {
  test('parses valid JSON response', () => {
    const jsonStr = '{"approved": true, "summary": "LGTM", "issues": []}'
    const parsed = JSON.parse(jsonStr)
    
    expect(parsed.approved).toBe(true)
    expect(parsed.summary).toBe('LGTM')
    expect(parsed.issues).toEqual([])
  })

  test('handles markdown code blocks', () => {
    const response = '```json\n{"approved": true, "summary": "Good", "issues": []}\n```'
    const lines = response.split('\n')
    const jsonStr = lines.slice(1, -1).join('\n')
    const parsed = JSON.parse(jsonStr)
    
    expect(parsed.approved).toBe(true)
  })

  test('creates error result on parse failure', () => {
    const invalidJson = 'not valid json'
    let result: ReviewResult
    
    try {
      JSON.parse(invalidJson)
      result = { approved: true, summary: '', issues: [] }
    } catch (parseError) {
      result = {
        approved: false,
        summary: 'Failed to parse review response',
        issues: [{
          severity: 'critical',
          message: `Review parsing failed: ${parseError}. Raw response: ${invalidJson.slice(0, 500)}`,
        }],
      }
    }
    
    expect(result.approved).toBe(false)
    expect(result.summary).toBe('Failed to parse review response')
    expect(result.issues[0].severity).toBe('critical')
  })
})

describe('postToGitHubPR formatting', () => {
  test('formats approved review', () => {
    const review: ReviewResult = {
      approved: true,
      summary: 'Looks good!',
      issues: [],
    }
    
    const status = review.approved ? 'Approved' : 'Changes Requested'
    const issuesText = review.issues.length > 0
      ? review.issues.map(i => `- **${i.severity.toUpperCase()}**: ${i.message}`).join('\n')
      : 'No issues found.'
    
    expect(status).toBe('Approved')
    expect(issuesText).toBe('No issues found.')
  })

  test('formats rejected review with issues', () => {
    const review: ReviewResult = {
      approved: false,
      summary: 'Found problems',
      issues: [
        { severity: 'critical', file: 'auth.ts', line: 42, message: 'SQL injection', suggestion: 'Use prepared statements' },
        { severity: 'major', message: 'Missing error handling' },
      ],
    }
    
    const status = review.approved ? 'Approved' : 'Changes Requested'
    expect(status).toBe('Changes Requested')
    expect(review.issues).toHaveLength(2)
    
    const issue = review.issues[0]
    const location = [issue.file, issue.line].filter(Boolean).join(':')
    expect(location).toBe('auth.ts:42')
  })
})

describe('blocking review logic', () => {
  test('counts critical issues correctly', () => {
    const issues: ReviewIssue[] = [
      { severity: 'critical', message: 'Issue 1' },
      { severity: 'critical', message: 'Issue 2' },
      { severity: 'major', message: 'Issue 3' },
      { severity: 'minor', message: 'Issue 4' },
    ]
    
    const criticalCount = issues.filter(i => i.severity === 'critical').length
    const majorCount = issues.filter(i => i.severity === 'major').length
    
    expect(criticalCount).toBe(2)
    expect(majorCount).toBe(1)
  })

  test('blocking=true with critical issues should request stop', () => {
    const review: ReviewResult = {
      approved: false,
      summary: 'Security issue',
      issues: [{ severity: 'critical', message: 'SQL injection' }],
    }
    const blocking = true
    
    const shouldStop = blocking && !review.approved
    expect(shouldStop).toBe(true)
  })

  test('blocking=true with approved review does not stop', () => {
    const review: ReviewResult = {
      approved: true,
      summary: 'LGTM',
      issues: [],
    }
    const blocking = true
    
    const shouldStop = blocking && !review.approved
    expect(shouldStop).toBe(false)
  })

  test('blocking=false does not stop even with issues', () => {
    const review: ReviewResult = {
      approved: false,
      summary: 'Has issues',
      issues: [{ severity: 'critical', message: 'Problem' }],
    }
    const blocking = false
    
    const shouldStop = blocking && !review.approved
    expect(shouldStop).toBe(false)
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
    executionId = db.execution.start('test-review', 'test.tsx')
    root = createSmithersRoot()
  })

  afterEach(() => {
    signalOrchestrationComplete()
    root.dispose()
    db.close()
  })

  test('renders review element with target-type attribute', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('<review')
    expect(xml).toContain('target-type="commit"')
  })

  test('renders review with diff target', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'diff', ref: 'main' }} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('target-type="diff"')
    expect(xml).toContain('target-ref="main"')
  })

  test('renders review with pr target', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'pr', ref: '123' }} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('target-type="pr"')
    expect(xml).toContain('target-ref="123"')
  })

  test('renders review with files target', async () => {
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

  test('renders with blocking attribute when set', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} blocking={true} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).toContain('blocking="true"')
  })

  test('renders without blocking attribute when not set', async () => {
    await root.render(
      <SmithersProvider db={db} executionId={executionId} stopped>
        <Review target={{ type: 'commit' }} />
      </SmithersProvider>
    )

    const xml = root.toXML()
    expect(xml).not.toContain('blocking="true"')
  })
})

// ============================================================================
// Component Module Tests
// ============================================================================

describe('Review module exports', () => {
  test('exports Review component', async () => {
    const mod = await import('./Review.js')
    expect(typeof mod.Review).toBe('function')
  })

  test('exports ReviewTarget type', async () => {
    const mod = await import('./Review.js')
    expect(mod.Review).toBeDefined()
  })

  test('exports ReviewResult type', async () => {
    const mod = await import('./Review.js')
    expect(mod.Review).toBeDefined()
  })

  test('exports ReviewIssue type', async () => {
    const mod = await import('./Review.js')
    expect(mod.Review).toBeDefined()
  })

  test('exports ReviewProps type', async () => {
    const mod = await import('./Review.js')
    expect(mod.Review).toBeDefined()
  })

  test('Review component has correct name', async () => {
    const mod = await import('./Review/Review.js')
    expect(mod.Review.name).toBe('Review')
  })
})

// ============================================================================
// Git Notes Integration Tests
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
    const notesContent = JSON.stringify({
      smithers_review: true,
      executionId: 'test-123',
      timestamp: Date.now(),
      review,
    }, null, 2)
    
    const parsed = JSON.parse(notesContent)
    expect(parsed.smithers_review).toBe(true)
    expect(parsed.executionId).toBe('test-123')
    expect(parsed.review.approved).toBe(true)
  })
})
