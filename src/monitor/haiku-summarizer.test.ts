/**
 * Unit tests for haiku-summarizer.ts - Content summarization with Claude Haiku.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { summarizeWithHaiku, type SummaryType } from './haiku-summarizer.js'

const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'SMITHERS_SUMMARY_THRESHOLD',
  'SMITHERS_SUMMARY_CHAR_THRESHOLD',
  'SMITHERS_SUMMARY_MAX_CHARS',
  'SMITHERS_SUMMARY_MODEL',
] as const

const ORIGINAL_ENV: Record<string, string | undefined> = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
)

function resetEnv(): void {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

function createMockClient(responseText: string, options?: { content?: any[]; error?: Error }) {
  const calls: any[] = []
  const client = {
    messages: {
      create: async (params: any) => {
        calls.push(params)
        if (options?.error) throw options.error
        return {
          content: options?.content ?? [{ type: 'text', text: responseText }],
        }
      },
    },
  }

  return { client, calls }
}

function createContent(lines: number, lineContent: string = 'line'): string {
  return Array.from({ length: lines }, () => lineContent).join('\n') + '\n'
}

describe('summarizeWithHaiku', () => {
  beforeEach(() => {
    clearEnv()
  })

  afterEach(() => {
    resetEnv()
  })

  test('returns original content when below thresholds', async () => {
    const content = createContent(3)
    const { client, calls } = createMockClient('ignored')

    const result = await summarizeWithHaiku(content, 'read', '/log/path', {
      threshold: 10,
      charThreshold: 1000,
      client,
    })

    expect(result.summary).toBe(content)
    expect(result.fullPath).toBe('/log/path')
    expect(calls).toHaveLength(0)
  })

  test('falls back to truncation when above threshold without API key', async () => {
    const content = createContent(2, 'x'.repeat(1200))

    const result = await summarizeWithHaiku(content, 'read', '/log/path', {
      threshold: 1,
    })

    expect(result.summary).toContain('[... truncated, see full output]')
    expect(result.summary.length).toBeLessThan(content.length)
  })

  test('uses client response when available', async () => {
    const { client, calls } = createMockClient('mock summary')
    const content = createContent(60)

    const result = await summarizeWithHaiku(content, 'read', '/log/path', {
      threshold: 1,
      client,
    })

    expect(result.summary).toBe('mock summary')
    expect(calls).toHaveLength(1)
  })

  test('uses correct prompt per summary type', async () => {
    const cases: Array<{ type: SummaryType; expected: string }> = [
      { type: 'read', expected: 'Summarize this file content' },
      { type: 'edit', expected: 'Summarize this code diff' },
      { type: 'result', expected: 'Summarize this AI agent result' },
      { type: 'error', expected: 'Summarize this error' },
      { type: 'output', expected: 'Summarize this output' },
    ]

    for (const { type, expected } of cases) {
      const { client, calls } = createMockClient('summary')
      const content = createContent(80)

      await summarizeWithHaiku(content, type, '/log/path', {
        threshold: 1,
        maxChars: 40,
        client,
      })

      const prompt = calls[0]?.messages?.[0]?.content
      expect(prompt).toContain(expected)
      expect(prompt).toContain('---')
    }
  })

  test('clips long content for summarization', async () => {
    const { client, calls } = createMockClient('summary')
    const content = 'x'.repeat(200)

    await summarizeWithHaiku(content, 'read', '/log/path', {
      threshold: 1,
      maxChars: 40,
      client,
    })

    const prompt = calls[0]?.messages?.[0]?.content
    expect(prompt).toContain('...[content truncated for summarization]...')
  })

  test('falls back to truncation on API error', async () => {
    const { client } = createMockClient('unused', { error: new Error('429: rate limit') })
    const content = createContent(80)

    const result = await summarizeWithHaiku(content, 'read', '/log/path', {
      threshold: 1,
      client,
    })

    expect(result.summary).toContain('[... summarization failed, see full output]')
    expect(result.fullPath).toBe('/log/path')
  })

  test('uses truncation when response has no text blocks', async () => {
    const { client } = createMockClient('unused', { content: [] })
    const content = createContent(80, 'y'.repeat(20))

    const result = await summarizeWithHaiku(content, 'read', '/log/path', {
      threshold: 1,
      client,
    })

    expect(result.summary).toContain('...')
    expect(result.summary.length).toBeLessThan(content.length)
  })

  test('respects SMITHERS_SUMMARY_THRESHOLD env var', async () => {
    process.env['SMITHERS_SUMMARY_THRESHOLD'] = '200'
    const content = createContent(150)

    const result = await summarizeWithHaiku(content, 'read', '/log/path')

    expect(result.summary).toBe(content)
  })

  test('handles mixed line endings', async () => {
    const content = 'line1\r\nline2\rline3\n'

    const result = await summarizeWithHaiku(content, 'read', '/log/path', {
      threshold: 10,
      charThreshold: 1000,
    })

    expect(result.summary).toBe(content)
  })
})
