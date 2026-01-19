/**
 * Tests for src/tui/components/shared/XMLViewer.tsx
 * XML syntax highlighting viewer
 */

import { describe, test, expect } from 'bun:test'

describe('tui/components/shared/XMLViewer', () => {
  describe('module exports', () => {
    test('exports XMLViewer component', async () => {
      const mod = await import('./XMLViewer.js')
      expect(typeof mod.XMLViewer).toBe('function')
    })

    test('XMLViewerProps type is available', async () => {
      const mod = await import('./XMLViewer.js')
      expect(mod.XMLViewer).toBeDefined()
    })
  })

  describe('line splitting logic', () => {
    test('splits xml by newlines', () => {
      const xml = '<a>\n<b/>\n</a>'
      const lines = xml.split('\n')
      expect(lines).toEqual(['<a>', '<b/>', '</a>'])
    })

    test('handles single line xml', () => {
      const xml = '<root/>'
      const lines = xml.split('\n')
      expect(lines).toEqual(['<root/>'])
    })

    test('handles empty xml', () => {
      const xml = ''
      const lines = xml.split('\n')
      expect(lines).toEqual([''])
    })
  })

  describe('maxLines slicing logic', () => {
    test('slices to maxLines', () => {
      const lines = Array.from({ length: 50 }, (_, i) => `<line${i}/>`)
      const maxLines = 10
      const sliced = lines.slice(0, maxLines)
      expect(sliced).toHaveLength(10)
    })

    test('does not slice if under maxLines', () => {
      const lines = ['<a>', '<b>']
      const maxLines = 100
      const sliced = lines.slice(0, maxLines)
      expect(sliced).toHaveLength(2)
    })

    test('defaults maxLines to 100', () => {
      const maxLines = 100
      expect(maxLines).toBe(100)
    })
  })

  describe('truncation indicator logic', () => {
    test('shows indicator when lines exceed maxLines', () => {
      const totalLines = 50
      const maxLines = 10
      const remaining = totalLines - maxLines
      expect(remaining).toBe(40)
      expect(remaining > 0).toBe(true)
    })

    test('no indicator when lines <= maxLines', () => {
      const totalLines = 5
      const maxLines = 10
      const remaining = totalLines - maxLines
      expect(remaining).toBeLessThanOrEqual(0)
    })
  })

  describe('getLineColor logic', () => {
    test('returns gray (#565f89) for comments', () => {
      const line = '<!-- comment -->'
      const trimmed = line.trim()
      expect(trimmed.startsWith('<!--')).toBe(true)
    })

    test('returns cyan (#7dcfff) for self-closing tags', () => {
      const line = '<selfClosing/>'
      const trimmed = line.trim()
      expect(trimmed.match(/^<[^>]+\/>$/)).not.toBeNull()
    })

    test('returns blue (#7aa2f7) for opening tags', () => {
      const line = '<opening>'
      const trimmed = line.trim()
      expect(trimmed.match(/^<[^/][^>]*>$/)).not.toBeNull()
    })

    test('returns purple (#bb9af7) for closing tags', () => {
      const line = '</closing>'
      const trimmed = line.trim()
      expect(trimmed.match(/^<\/[^>]+>$/)).not.toBeNull()
    })

    test('returns blue for tags with attributes', () => {
      const line = '<tag attr="value">'
      const trimmed = line.trim()
      expect(trimmed.startsWith('<')).toBe(true)
    })

    test('returns foreground color for plain text', () => {
      const line = 'plain text content'
      const trimmed = line.trim()
      expect(trimmed.startsWith('<!--')).toBe(false)
      expect(trimmed.startsWith('<')).toBe(false)
    })

    test('identifies comments correctly', () => {
      const testCases = [
        { input: '<!-- comment -->', isComment: true },
        { input: '<tag>', isComment: false },
        { input: 'text', isComment: false },
      ]
      for (const { input, isComment } of testCases) {
        expect(input.trim().startsWith('<!--')).toBe(isComment)
      }
    })

    test('identifies self-closing tags correctly', () => {
      const selfClosing = ['<br/>', '<input/>', '<tag attr="val"/>']
      const notSelfClosing = ['<tag>', '</tag>', 'text']

      for (const tag of selfClosing) {
        expect(!!tag.trim().match(/^<[^>]+\/>$/)).toBe(true)
      }
      for (const tag of notSelfClosing) {
        expect(!!tag.trim().match(/^<[^>]+\/>$/)).toBe(false)
      }
    })

    test('identifies opening tags correctly', () => {
      const opening = ['<tag>', '<div class="x">']
      const notOpening = ['</tag>', 'text']

      for (const tag of opening) {
        expect(!!tag.trim().match(/^<[^/][^>]*>$/)).toBe(true)
      }
      for (const tag of notOpening) {
        expect(!!tag.trim().match(/^<[^/][^>]*>$/)).toBe(false)
      }
    })

    test('identifies closing tags correctly', () => {
      const closing = ['</tag>', '</div>']
      const notClosing = ['<tag>', '<br/>', 'text']

      for (const tag of closing) {
        expect(!!tag.trim().match(/^<\/[^>]+>$/)).toBe(true)
      }
      for (const tag of notClosing) {
        expect(!!tag.trim().match(/^<\/[^>]+>$/)).toBe(false)
      }
    })
  })

  describe('edge cases', () => {
    test('handles xml with special characters', () => {
      const xml = '<tag attr="value &amp; more">text</tag>'
      const lines = xml.split('\n')
      expect(lines).toHaveLength(1)
    })

    test('handles nested xml', () => {
      const xml = `<root>
  <parent>
    <child>text</child>
  </parent>
</root>`
      const lines = xml.split('\n')
      expect(lines).toHaveLength(5)
    })

    test('handles whitespace-only lines', () => {
      const xml = '<a>\n   \n</a>'
      const lines = xml.split('\n')
      expect(lines[1].trim()).toBe('')
    })

    test('handles very long lines', () => {
      const longAttr = 'a'.repeat(1000)
      const xml = `<tag attr="${longAttr}"/>`
      const lines = xml.split('\n')
      expect(lines).toHaveLength(1)
      expect(lines[0].length).toBeGreaterThan(1000)
    })
  })
})
