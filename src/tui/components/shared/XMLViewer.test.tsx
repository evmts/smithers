/**
 * Tests for src/tui/components/shared/XMLViewer.tsx
 * XML syntax highlighting viewer
 */

import { describe, test, expect } from 'bun:test'
import { XMLViewer, type XMLViewerProps } from './XMLViewer.js'

function createProps(overrides: Partial<XMLViewerProps> = {}): XMLViewerProps {
  return {
    xml: '<root><child>content</child></root>',
    ...overrides
  }
}

describe('tui/components/shared/XMLViewer', () => {
  describe('rendering', () => {
    test('renders scrollbox container', () => {
      const props = createProps()
      const element = XMLViewer(props)
      expect(element.type).toBe('scrollbox')
    })

    test('has focused prop set to true', () => {
      const props = createProps()
      const element = XMLViewer(props)
      expect(element.props.focused).toBe(true)
    })

    test('has flexGrow style', () => {
      const props = createProps()
      const element = XMLViewer(props)
      expect(element.props.style.flexGrow).toBe(1)
    })
  })

  describe('props interface', () => {
    test('accepts xml string', () => {
      const props = createProps({ xml: '<test/>' })
      const element = XMLViewer(props)
      expect(element).toBeDefined()
    })

    test('accepts maxLines number', () => {
      const props = createProps({ maxLines: 50 })
      const element = XMLViewer(props)
      expect(element).toBeDefined()
    })
  })

  describe('edge cases', () => {
    test('handles empty xml', () => {
      const props = createProps({ xml: '' })
      const element = XMLViewer(props)
      expect(element).toBeDefined()
      expect(element.type).toBe('scrollbox')
    })

    test('handles xml with many lines', () => {
      const lines = Array.from({ length: 200 }, (_, i) => `<line${i}/>`).join('\n')
      const props = createProps({ xml: lines })
      const element = XMLViewer(props)
      expect(element).toBeDefined()
    })

    test('handles xml with special characters', () => {
      const props = createProps({ xml: '<tag attr="value &amp; more">text</tag>' })
      const element = XMLViewer(props)
      expect(element).toBeDefined()
    })
  })
})
