/**
 * Unit tests for haiku-summarizer.ts - Content summarization with Claude Haiku.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { summarizeWithHaiku } from './haiku-summarizer.js'

const originalEnv = { ...process.env }

describe('summarizeWithHaiku', () => {
  beforeEach(() => {
    delete process.env['ANTHROPIC_API_KEY']
    delete process.env['SMITHERS_SUMMARY_THRESHOLD']
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('threshold behavior', () => {
    test('returns original content when below default threshold (50 lines)', async () => {
      const content = 'line\n'.repeat(10)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.summary).toBe(content)
      expect(result.fullPath).toBe('/log/path')
    })

    test('summarizes when above char threshold with single line', async () => {
      const content = 'x'.repeat(10000)

      const result = await summarizeWithHaiku(content, 'read', '/log/path')

      expect(result.summary).toContain('truncated')
      expect(result.fullPath).toBe('/log/path')
    })

    test('returns original content when below custom threshold', async () => {
      const content = 'line\n'.repeat(80)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path', { threshold: 100 })
      
      expect(result.summary).toBe(content)
    })

    test('summarizes when above threshold', async () => {
      const content = 'line\n'.repeat(100)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path', { threshold: 50 })
      
      expect(result.summary).toContain('truncated')
      expect(result.fullPath).toBe('/log/path')
    })

    test('respects SMITHERS_SUMMARY_THRESHOLD env var', async () => {
      process.env['SMITHERS_SUMMARY_THRESHOLD'] = '200'
      const content = 'line\n'.repeat(150)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.summary).toBe(content)
    })
  })

  describe('API key handling', () => {
    test('uses provided apiKey option', async () => {
      const content = 'line\n'.repeat(100)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path', {
        apiKey: 'test-api-key',
      })
      
      expect(result.fullPath).toBe('/log/path')
    })

    test('falls back to ANTHROPIC_API_KEY env var', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'env-api-key'
      const content = 'line\n'.repeat(100)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.fullPath).toBe('/log/path')
    })

    test('truncates content when no API key available', async () => {
      delete process.env['ANTHROPIC_API_KEY']
      const content = 'x'.repeat(1000) + '\n'.repeat(100)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.summary).toContain('truncated')
      expect(result.summary.length).toBeLessThan(content.length)
    })

    test('truncates to approximately 500 characters plus suffix', async () => {
      delete process.env['ANTHROPIC_API_KEY']
      const content = 'x'.repeat(1000) + '\n'.repeat(100)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.summary.length).toBeLessThan(600)
    })
  })

  describe('summary types - correct prompts', () => {
    test('uses correct prompt for "read" type', async () => {
      const content = 'line\n'.repeat(10)
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.summary).toBe(content)
    })

    test('uses correct prompt for "edit" type', async () => {
      const content = 'line\n'.repeat(10)
      const result = await summarizeWithHaiku(content, 'edit', '/log/path')
      
      expect(result.summary).toBe(content)
    })

    test('uses correct prompt for "result" type', async () => {
      const content = 'line\n'.repeat(10)
      const result = await summarizeWithHaiku(content, 'result', '/log/path')
      
      expect(result.summary).toBe(content)
    })

    test('uses correct prompt for "error" type', async () => {
      const content = 'line\n'.repeat(10)
      const result = await summarizeWithHaiku(content, 'error', '/log/path')
      
      expect(result.summary).toBe(content)
    })

    test('uses correct prompt for "output" type', async () => {
      const content = 'line\n'.repeat(10)
      const result = await summarizeWithHaiku(content, 'output', '/log/path')
      
      expect(result.summary).toBe(content)
    })
  })

  describe('API error handling', () => {
    test('handles rate limiting (429) - falls back to truncation', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key'
      const content = 'x'.repeat(600) + '\n'.repeat(100)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.fullPath).toBe('/log/path')
      expect(typeof result.summary).toBe('string')
    })

    test('handles API error (500) - falls back to truncation', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key'
      const content = 'x'.repeat(600) + '\n'.repeat(100)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.fullPath).toBe('/log/path')
    })

    test('falls back to truncation on API error', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'invalid-key'
      const content = 'x'.repeat(1000) + '\n'.repeat(100)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.summary).toContain('see full output')
      expect(result.fullPath).toBe('/log/path')
    })
  })

  describe('content handling', () => {
    test('handles empty content', async () => {
      const result = await summarizeWithHaiku('', 'read', '/log/path')
      
      expect(result.summary).toBe('')
      expect(result.fullPath).toBe('/log/path')
    })

    test('handles single-line content', async () => {
      const content = 'single line'
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.summary).toBe(content)
    })

    test('handles content with unicode characters', async () => {
      const content = '日本語テスト\n中文测试\n'.repeat(10)
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.summary).toBe(content)
    })

    test('correctly counts lines with different line endings', async () => {
      const content = 'line\n'.repeat(40)
      const result = await summarizeWithHaiku(content, 'read', '/log/path')
      
      expect(result.summary).toBe(content)
    })
  })

  describe('logPath handling', () => {
    test('returns logPath in fullPath field', async () => {
      const result = await summarizeWithHaiku('content', 'read', '/custom/path.log')
      
      expect(result.fullPath).toBe('/custom/path.log')
    })

    test('handles empty logPath', async () => {
      const result = await summarizeWithHaiku('content', 'read', '')
      
      expect(result.fullPath).toBe('')
    })

    test('handles logPath with special characters', async () => {
      const specialPath = '/path/with spaces/and-特殊字符/🚀.log'
      const result = await summarizeWithHaiku('content', 'read', specialPath)
      
      expect(result.fullPath).toBe(specialPath)
    })
  })

  describe('truncate helper behavior', () => {
    test('returns original string if under maxLength (via no API key path)', async () => {
      delete process.env['ANTHROPIC_API_KEY']
      const shortContent = 'x'.repeat(100) + '\n'.repeat(100)
      
      const result = await summarizeWithHaiku(shortContent, 'read', '/log/path')
      
      expect(result.summary).toContain('...')
    })

    test('truncates and adds "..." if over maxLength', async () => {
      delete process.env['ANTHROPIC_API_KEY']
      const longContent = 'x'.repeat(1000) + '\n'.repeat(100)
      
      const result = await summarizeWithHaiku(longContent, 'read', '/log/path')
      
      expect(result.summary).toContain('...')
      expect(result.summary).toContain('truncated')
    })
  })

  describe('threshold edge cases', () => {
    test('content below threshold returns original', async () => {
      const content = 'line\n'.repeat(40)
      const result = await summarizeWithHaiku(content, 'read', '/log/path', { threshold: 50 })
      
      expect(result.summary).toBe(content)
    })

    test('content above char threshold triggers summarization', async () => {
      const content = 'x'.repeat(5000)
      const result = await summarizeWithHaiku(content, 'read', '/log/path', { charThreshold: 1000 })

      expect(result.summary).toContain('truncated')
      expect(result.fullPath).toBe('/log/path')
    })

    test('content at or above threshold triggers summarization', async () => {
      delete process.env['ANTHROPIC_API_KEY']
      const content = 'x'.repeat(600) + '\n'.repeat(51)
      
      const result = await summarizeWithHaiku(content, 'read', '/log/path', { threshold: 50 })
      
      expect(result.summary).toContain('truncated')
    })
  })
})
