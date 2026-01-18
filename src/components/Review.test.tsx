/**
 * Unit tests for Review.tsx - Code review component interface tests.
 */
import { describe, test, expect, mock } from 'bun:test'
import type { ReviewTarget, ReviewResult, ReviewIssue, ReviewProps } from './Review'

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

describe('Review component', () => {
  test('exports Review function', async () => {
    const { Review } = await import('./Review')
    expect(typeof Review).toBe('function')
  })

  test('Review is a valid Solid component', async () => {
    const { Review } = await import('./Review')
    expect(Review.length).toBeLessThanOrEqual(1)
  })
})
