/**
 * Unit tests for capture.ts - content classification and template generation
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  classifyContent,
  extractCommitHash,
  extractTitle,
  extractSummary,
  inferPriority,
  toKebabCase,
  generateReviewTemplate,
  generateIssueTemplate,
  generateTodoItem,
  generateFilePath,
  writeCapture,
  capture,
  type CaptureContext,
  type GeneratedCapture,
} from './capture.js'

describe('classifyContent', () => {
  test('classifies commit hash + bug language as review', () => {
    const ctx: CaptureContext = {
      content: 'Commit abc1234 has a bug in auth.ts:45',
    }
    const result = classifyContent(ctx)
    expect(result.type).toBe('review')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  test('classifies explicit prompt request as prompt', () => {
    const ctx: CaptureContext = {
      content: 'Put this in PROMPT.md: important context for later',
    }
    const result = classifyContent(ctx)
    expect(result.type).toBe('prompt')
    expect(result.confidence).toBe(1.0)
  })

  test('classifies feature language without commits as issue', () => {
    const ctx: CaptureContext = {
      content: 'We should add support for WebSockets to improve real-time functionality',
    }
    const result = classifyContent(ctx)
    expect(result.type).toBe('issue')
    expect(result.confidence).toBeGreaterThan(0.3)
  })

  test('classifies urgent checkbox patterns as todo', () => {
    const ctx: CaptureContext = {
      content: '- [ ] Must fix broken tests before release',
    }
    const result = classifyContent(ctx)
    expect(result.type).toBe('todo')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  test('boosts review confidence when commitHash provided', () => {
    const ctx: CaptureContext = {
      content: 'This change looks suspicious',
      commitHash: 'abc1234',
    }
    const result = classifyContent(ctx)
    expect(result.type).toBe('review')
    expect(result.reasoning).toContain('Commit hash provided: abc1234')
  })

  test('includes reasoning for classification', () => {
    const ctx: CaptureContext = {
      content: 'Commit f691852 has an error in parser.ts:100',
    }
    const result = classifyContent(ctx)
    expect(result.reasoning.length).toBeGreaterThan(0)
  })
})

describe('extractCommitHash', () => {
  test('extracts 7-character hash', () => {
    expect(extractCommitHash('Commit abc1234 has bug')).toBe('abc1234')
  })

  test('extracts 40-character hash', () => {
    // Valid 40-char git SHA-1 hash
    const fullHash = 'abc1234def5678abc1234def5678abc1234def56'
    expect(extractCommitHash(`Review ${fullHash}`)).toBe(fullHash)
  })

  test('returns undefined for no hash', () => {
    expect(extractCommitHash('No hash here')).toBeUndefined()
  })

  test('extracts first hash when multiple present', () => {
    expect(extractCommitHash('abc1234 and def5678')).toBe('abc1234')
  })
})

describe('extractTitle', () => {
  test('extracts first line as title', () => {
    expect(extractTitle('Add WebSocket Support\n\nMore details here')).toBe('Add WebSocket Support')
  })

  test('removes markdown heading prefix', () => {
    expect(extractTitle('# My Title\n\nContent')).toBe('My Title')
    expect(extractTitle('### Heading\n\nContent')).toBe('Heading')
  })

  test('truncates long titles', () => {
    const longTitle = 'A'.repeat(100)
    const result = extractTitle(longTitle)
    expect(result.length).toBeLessThanOrEqual(80)
    expect(result).toEndWith('...')
  })

  test('returns Untitled for empty content', () => {
    expect(extractTitle('')).toBe('Untitled')
  })
})

describe('extractSummary', () => {
  test('skips title and gets first paragraph', () => {
    const content = `# Title

This is the summary paragraph.

More content here.`
    expect(extractSummary(content)).toBe('This is the summary paragraph.')
  })

  test('truncates long summaries', () => {
    const longSummary = 'B'.repeat(300)
    const result = extractSummary(longSummary, 100)
    expect(result.length).toBeLessThanOrEqual(100)
    expect(result).toEndWith('...')
  })

  test('skips bullet points for summary', () => {
    const content = `Title
- bullet point
* another bullet
The actual summary here.`
    expect(extractSummary(content)).toBe('The actual summary here.')
  })
})

describe('inferPriority', () => {
  test('detects high priority keywords', () => {
    expect(inferPriority('This is critical!')).toBe('high')
    expect(inferPriority('URGENT: fix now')).toBe('high')
    expect(inferPriority('P0 blocker')).toBe('high')
    expect(inferPriority('Must fix immediately')).toBe('high')
  })

  test('detects medium priority keywords', () => {
    expect(inferPriority('Should fix this soon')).toBe('medium')
    expect(inferPriority('This is important')).toBe('medium')
    expect(inferPriority('P1 issue')).toBe('medium')
  })

  test('defaults to low priority', () => {
    expect(inferPriority('Maybe look at this later')).toBe('low')
    expect(inferPriority('Nice to have')).toBe('low')
  })
})

describe('toKebabCase', () => {
  test('converts spaces to hyphens', () => {
    expect(toKebabCase('Add WebSocket Support')).toBe('add-websocket-support')
  })

  test('removes special characters', () => {
    expect(toKebabCase("Fix bug! (urgent)")).toBe('fix-bug-urgent')
  })

  test('collapses multiple hyphens', () => {
    expect(toKebabCase('foo   bar---baz')).toBe('foo-bar-baz')
  })

  test('truncates to 50 characters', () => {
    const long = 'this is a very long title that should be truncated'
    expect(toKebabCase(long).length).toBeLessThanOrEqual(50)
  })

  test('lowercases output', () => {
    expect(toKebabCase('UPPERCASE TITLE')).toBe('uppercase-title')
  })
})

describe('generateReviewTemplate', () => {
  test('includes commit hash in title', () => {
    const ctx: CaptureContext = {
      content: 'Bug found in auth module',
      commitHash: 'abc1234',
    }
    const result = generateReviewTemplate(ctx)
    expect(result).toContain('# Code Review for Commit abc1234')
  })

  test('includes commit message when provided', () => {
    const ctx: CaptureContext = {
      content: 'Review content',
      commitHash: 'abc1234',
      commitMessage: 'Fix authentication bug',
    }
    const result = generateReviewTemplate(ctx)
    expect(result).toContain('**Commit Message:** Fix authentication bug')
  })

  test('includes date header', () => {
    const ctx: CaptureContext = { content: 'Content' }
    const result = generateReviewTemplate(ctx)
    expect(result).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2}/)
  })

  test('includes issues found section', () => {
    const ctx: CaptureContext = { content: 'The bug is in line 45' }
    const result = generateReviewTemplate(ctx)
    expect(result).toContain('### Issues Found')
    expect(result).toContain('The bug is in line 45')
  })
})

describe('generateIssueTemplate', () => {
  test('includes title from context', () => {
    const ctx: CaptureContext = {
      content: 'Details here',
      title: 'Add WebSocket Support',
    }
    const result = generateIssueTemplate(ctx)
    expect(result).toContain('# Add WebSocket Support')
  })

  test('includes priority in metadata', () => {
    const ctx: CaptureContext = {
      content: 'Details',
      priority: 'high',
    }
    const result = generateIssueTemplate(ctx)
    expect(result).toContain('<priority>high</priority>')
  })

  test('infers priority from content when not provided', () => {
    const ctx: CaptureContext = {
      content: 'This is critical to fix',
    }
    const result = generateIssueTemplate(ctx)
    expect(result).toContain('<priority>high</priority>')
  })

  test('includes acceptance criteria section', () => {
    const ctx: CaptureContext = { content: 'Feature request' }
    const result = generateIssueTemplate(ctx)
    expect(result).toContain('## Acceptance Criteria')
  })
})

describe('generateTodoItem', () => {
  test('formats as checkbox item', () => {
    const ctx: CaptureContext = {
      content: 'Fix the broken tests',
    }
    const result = generateTodoItem(ctx)
    expect(result).toContain('- [ ] Fix the broken tests')
  })

  test('includes priority section header', () => {
    const ctx: CaptureContext = {
      content: 'Urgent task',
      priority: 'high',
    }
    const result = generateTodoItem(ctx)
    expect(result).toContain('## High Priority')
  })

  test('handles multiple lines', () => {
    const ctx: CaptureContext = {
      content: 'Task 1\nTask 2\nTask 3',
    }
    const result = generateTodoItem(ctx)
    expect(result).toContain('- [ ] Task 1')
    expect(result).toContain('- [ ] Task 2')
    expect(result).toContain('- [ ] Task 3')
  })

  test('removes existing checkbox prefix', () => {
    const ctx: CaptureContext = {
      content: '- [ ] Already has checkbox',
    }
    const result = generateTodoItem(ctx)
    // Should not have double checkbox
    expect(result).not.toContain('- [ ] - [ ]')
    expect(result).toContain('- [ ] Already has checkbox')
  })
})

describe('integration: classification accuracy', () => {
  const testCases: Array<{ content: string; expected: string; description: string }> = [
    {
      content: 'Commit f691852 has a bug in parser.ts:100',
      expected: 'review',
      description: 'commit + bug + file ref',
    },
    {
      content: 'We should implement WebSocket support for real-time updates',
      expected: 'issue',
      description: 'feature language',
    },
    {
      content: '- [ ] Must fix failing tests before merge',
      expected: 'todo',
      description: 'checkbox + urgent',
    },
    {
      content: 'Add this to PROMPT.md for future reference',
      expected: 'prompt',
      description: 'explicit prompt mention',
    },
    {
      content: 'The error in abc1234 breaks authentication',
      expected: 'review',
      description: 'commit hash + error',
    },
    {
      content: 'Create a new rate limiting module',
      expected: 'issue',
      description: 'create language',
    },
    {
      content: 'ASAP: fix the production bug',
      expected: 'todo',
      description: 'urgent keyword',
    },
  ]

  for (const { content, expected, description } of testCases) {
    test(`classifies "${description}" as ${expected}`, () => {
      const result = classifyContent({ content })
      expect(result.type).toBe(expected)
    })
  }
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('classifyContent - edge cases', () => {
  test('handles empty content', () => {
    const ctx: CaptureContext = { content: '' }
    const result = classifyContent(ctx)
    expect(result.type).toBe('issue') // Default fallback
    expect(result.confidence).toBe(0)
    expect(result.reasoning).toBeDefined()
  })

  test('handles whitespace-only content', () => {
    const ctx: CaptureContext = { content: '   \n\t  ' }
    const result = classifyContent(ctx)
    expect(result.type).toBe('issue') // Default fallback
    expect(result.confidence).toBe(0)
  })

  test('handles very long content', () => {
    const longContent = 'Fix this bug '.repeat(1000)
    const ctx: CaptureContext = { content: longContent }
    const result = classifyContent(ctx)
    expect(result.type).toBeDefined()
    expect(result.confidence).toBeGreaterThan(0)
  })

  test('handles content with many matching patterns', () => {
    const ctx: CaptureContext = {
      content: 'Commit abc1234 has a bug. We should implement a fix. - [ ] Must do this urgently!',
    }
    const result = classifyContent(ctx)
    // Should pick one type based on scoring
    expect(['review', 'issue', 'todo', 'prompt']).toContain(result.type)
  })

  test('handles unicode content', () => {
    const ctx: CaptureContext = {
      content: '日本語のコミットメッセージ abc1234',
    }
    const result = classifyContent(ctx)
    expect(result.type).toBe('review') // Has commit hash
  })

  test('handles content with special characters', () => {
    const ctx: CaptureContext = {
      content: 'Fix bug in auth.ts:45 - handle `null` values & "quotes"',
    }
    const result = classifyContent(ctx)
    expect(result.type).toBe('review') // "auth.ts:45" triggers file:line pattern -> review
    expect(result.confidence).toBeGreaterThan(0)
  })

  test('confidence is capped at 1.0', () => {
    const ctx: CaptureContext = {
      content: 'Put this in PROMPT.md: critical bug urgent asap must fix now',
      commitHash: 'abc1234',
    }
    const result = classifyContent(ctx)
    expect(result.confidence).toBeLessThanOrEqual(1.0)
  })
})

describe('extractCommitHash - edge cases', () => {
  test('handles mixed case hash', () => {
    expect(extractCommitHash('Commit AbC1234')).toBe('AbC1234')
  })

  test('handles hash at start of string', () => {
    expect(extractCommitHash('abc1234 is the commit')).toBe('abc1234')
  })

  test('handles hash at end of string', () => {
    expect(extractCommitHash('The commit is abc1234')).toBe('abc1234')
  })

  test('ignores strings that look like hashes but are not', () => {
    // Less than 7 chars
    expect(extractCommitHash('abc123')).toBeUndefined()
  })

  test('handles hash surrounded by special chars', () => {
    expect(extractCommitHash('(abc1234)')).toBe('abc1234')
    expect(extractCommitHash('[abc1234]')).toBe('abc1234')
  })
})

describe('extractTitle - edge cases', () => {
  test('handles multiple heading levels', () => {
    expect(extractTitle('## Subheading')).toBe('Subheading')
    expect(extractTitle('#### Deep heading')).toBe('Deep heading')
  })

  test('handles title with leading whitespace', () => {
    expect(extractTitle('   Spaced Title')).toBe('Spaced Title')
  })

  test('handles only whitespace lines before content', () => {
    expect(extractTitle('\n\n\nActual Title')).toBe('Actual Title')
  })

  test('handles title with special markdown chars', () => {
    expect(extractTitle('**Bold Title**')).toBe('**Bold Title**')
    expect(extractTitle('`Code Title`')).toBe('`Code Title`')
  })
})

describe('extractSummary - edge cases', () => {
  test('handles content with only heading', () => {
    const content = '# Just a heading'
    const result = extractSummary(content)
    expect(result).toBe('# Just a heading')
  })

  test('handles content with only bullets', () => {
    const content = `Title
- bullet 1
- bullet 2
- bullet 3`
    const result = extractSummary(content)
    // Falls back to title
    expect(result).toBe('Title')
  })

  test('handles content with empty lines', () => {
    const content = `Title



Actual summary after blank lines.`
    const result = extractSummary(content)
    expect(result).toBe('Actual summary after blank lines.')
  })

  test('respects custom maxLength', () => {
    const content = `Title\n${'x'.repeat(50)}`
    const result = extractSummary(content, 20)
    expect(result.length).toBeLessThanOrEqual(20)
    expect(result).toEndWith('...')
  })
})

describe('inferPriority - edge cases', () => {
  test('is case insensitive', () => {
    expect(inferPriority('CRITICAL issue')).toBe('high')
    expect(inferPriority('Urgent fix')).toBe('high')
    expect(inferPriority('SHOULD fix')).toBe('medium')
  })

  test('handles multiple priority keywords (first wins)', () => {
    // High takes precedence over medium
    expect(inferPriority('critical and should fix')).toBe('high')
  })

  test('handles priority in middle of text', () => {
    expect(inferPriority('This is a critical bug in production')).toBe('high')
  })
})

describe('toKebabCase - edge cases', () => {
  test('handles empty string', () => {
    expect(toKebabCase('')).toBe('')
  })

  test('handles only special characters', () => {
    expect(toKebabCase('!@#$%^&*()')).toBe('')
  })

  test('handles numbers', () => {
    expect(toKebabCase('Issue 123')).toBe('issue-123')
  })

  test('handles leading/trailing hyphens', () => {
    // The implementation preserves leading/trailing hyphens (they become part of the slug)
    expect(toKebabCase('-leading and trailing-')).toBe('-leading-and-trailing-')
  })

  test('handles consecutive special chars', () => {
    expect(toKebabCase('word!!!word')).toBe('wordword')
  })
})

describe('generatePromptMd', () => {
  test('trims and adds newline', async () => {
    const ctx: CaptureContext = { content: '  some content  ' }
    const { generatePromptMd } = await import('./capture.js')
    const result = generatePromptMd(ctx)
    expect(result).toBe('some content\n')
  })

  test('handles multiline content', async () => {
    const ctx: CaptureContext = { content: 'line1\nline2\nline3' }
    const { generatePromptMd } = await import('./capture.js')
    const result = generatePromptMd(ctx)
    expect(result).toBe('line1\nline2\nline3\n')
  })
})

describe('PATTERNS', () => {
  test('exports PATTERNS constant', async () => {
    const { PATTERNS } = await import('./capture.js')
    expect(PATTERNS).toBeDefined()
    expect(PATTERNS.review).toBeDefined()
    expect(PATTERNS.issue).toBeDefined()
    expect(PATTERNS.todo).toBeDefined()
    expect(PATTERNS.prompt).toBeDefined()
  })
})

// ============================================================================
// File I/O Tests
// ============================================================================

describe('generateFilePath', () => {
  test('generates review path with timestamp and hash', async () => {
    const ctx: CaptureContext = {
      content: 'Review content',
      commitHash: 'abc1234def',
    }
    const path = await generateFilePath('review', ctx, '/tmp/test-capture')
    expect(path).toMatch(/^\/tmp\/test-capture\/reviews\/\d{8}_\d{6}_abc1234\.md$/)
  })

  test('generates review path extracting hash from content', async () => {
    const ctx: CaptureContext = {
      content: 'Review commit f691852 changes',
    }
    const path = await generateFilePath('review', ctx, '/tmp/test-capture')
    expect(path).toMatch(/^\/tmp\/test-capture\/reviews\/\d{8}_\d{6}_f691852\.md$/)
  })

  test('generates review path with "manual" when no hash', async () => {
    const ctx: CaptureContext = {
      content: 'Review without hash',
    }
    const path = await generateFilePath('review', ctx, '/tmp/test-capture')
    expect(path).toMatch(/^\/tmp\/test-capture\/reviews\/\d{8}_\d{6}_manual\.md$/)
  })

  test('generates issue path with kebab-case title', async () => {
    const ctx: CaptureContext = {
      content: 'Issue details',
      title: 'Add WebSocket Support',
    }
    const path = await generateFilePath('issue', ctx, '/tmp/test-capture')
    expect(path).toBe('/tmp/test-capture/issues/add-websocket-support.md')
  })

  test('generates issue path extracting title from content', async () => {
    const ctx: CaptureContext = {
      content: 'Improve Error Handling\n\nMore details here',
    }
    const path = await generateFilePath('issue', ctx, '/tmp/test-capture')
    expect(path).toBe('/tmp/test-capture/issues/improve-error-handling.md')
  })

  test('generates todo path as TODO.md', async () => {
    const ctx: CaptureContext = { content: 'Task item' }
    const path = await generateFilePath('todo', ctx, '/tmp/test-capture')
    expect(path).toBe('/tmp/test-capture/TODO.md')
  })

  test('generates prompt path as PROMPT.md', async () => {
    const ctx: CaptureContext = { content: 'Context info' }
    const path = await generateFilePath('prompt', ctx, '/tmp/test-capture')
    expect(path).toBe('/tmp/test-capture/PROMPT.md')
  })
})

describe('writeCapture', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'capture-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test('writes new file', async () => {
    const generated: GeneratedCapture = {
      type: 'issue',
      filePath: join(tempDir, 'issues', 'test-issue.md'),
      content: '# Test Issue\n\nContent here',
      isAppend: false,
    }

    await writeCapture(generated)

    const written = await Bun.file(generated.filePath).text()
    expect(written).toBe('# Test Issue\n\nContent here')
  })

  test('creates parent directories', async () => {
    const generated: GeneratedCapture = {
      type: 'review',
      filePath: join(tempDir, 'deep', 'nested', 'path', 'review.md'),
      content: 'Review content',
      isAppend: false,
    }

    await writeCapture(generated)

    const written = await Bun.file(generated.filePath).text()
    expect(written).toBe('Review content')
  })

  test('appends to existing file', async () => {
    const filePath = join(tempDir, 'TODO.md')
    await Bun.write(filePath, '## Existing\n\n- [ ] Task 1')

    const generated: GeneratedCapture = {
      type: 'todo',
      filePath,
      content: '\n## New\n\n- [ ] Task 2',
      isAppend: true,
    }

    await writeCapture(generated)

    const written = await Bun.file(filePath).text()
    // writeCapture adds a separator newline between existing and new content
    expect(written).toBe('## Existing\n\n- [ ] Task 1\n\n## New\n\n- [ ] Task 2')
  })

  test('appends to empty file', async () => {
    const filePath = join(tempDir, 'PROMPT.md')
    await Bun.write(filePath, '')

    const generated: GeneratedCapture = {
      type: 'prompt',
      filePath,
      content: 'New content',
      isAppend: true,
    }

    await writeCapture(generated)

    const written = await Bun.file(filePath).text()
    expect(written).toBe('New content')
  })

  test('appends to non-existent file (creates it)', async () => {
    const filePath = join(tempDir, 'new-file.md')

    const generated: GeneratedCapture = {
      type: 'todo',
      filePath,
      content: '- [ ] First task',
      isAppend: true,
    }

    await writeCapture(generated)

    const written = await Bun.file(filePath).text()
    expect(written).toBe('- [ ] First task')
  })

  test('overwrites existing file when not appending', async () => {
    const filePath = join(tempDir, 'overwrite.md')
    await Bun.write(filePath, 'Old content')

    const generated: GeneratedCapture = {
      type: 'issue',
      filePath,
      content: 'New content',
      isAppend: false,
    }

    await writeCapture(generated)

    const written = await Bun.file(filePath).text()
    expect(written).toBe('New content')
  })
})

describe('capture (full integration)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'capture-integration-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test('captures review type correctly', async () => {
    const result = await capture({
      content: 'Commit abc1234 has a bug in auth.ts:45',
      cwd: tempDir,
    })

    expect(result.type).toBe('review')
    expect(result.filePath).toContain('/reviews/')
    expect(result.filePath).toContain('abc1234')
    expect(result.isAppend).toBe(false)
    expect(result.content).toContain('# Code Review for Commit')
  })

  test('captures issue type correctly', async () => {
    const result = await capture({
      content: 'We should add WebSocket support for real-time features',
      cwd: tempDir,
    })

    expect(result.type).toBe('issue')
    expect(result.filePath).toContain('/issues/')
    expect(result.isAppend).toBe(false)
    expect(result.content).toContain('## Problem Statement')
  })

  test('captures todo type correctly', async () => {
    const result = await capture({
      content: '- [ ] Must fix critical bug immediately',
      cwd: tempDir,
    })

    expect(result.type).toBe('todo')
    expect(result.filePath).toEndWith('TODO.md')
    expect(result.isAppend).toBe(true)
    expect(result.content).toContain('- [ ]')
  })

  test('captures prompt type correctly', async () => {
    const result = await capture({
      content: 'Put this in PROMPT.md: important context',
      cwd: tempDir,
    })

    expect(result.type).toBe('prompt')
    expect(result.filePath).toEndWith('PROMPT.md')
    expect(result.content).toContain('important context')
  })

  test('sets isAppend true for prompt when PROMPT.md exists', async () => {
    // Create existing PROMPT.md
    await Bun.write(join(tempDir, 'PROMPT.md'), 'Existing content')

    const result = await capture({
      content: 'Add this to PROMPT.md: more context',
      cwd: tempDir,
    })

    expect(result.type).toBe('prompt')
    expect(result.isAppend).toBe(true)
  })

  test('sets isAppend false for prompt when PROMPT.md does not exist', async () => {
    const result = await capture({
      content: 'Put this in PROMPT.md: first entry',
      cwd: tempDir,
    })

    expect(result.type).toBe('prompt')
    expect(result.isAppend).toBe(false)
  })
})
