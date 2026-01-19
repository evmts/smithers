/**
 * Tests for src/tui/components/layout/StatusBar.tsx
 * Status bar showing connection state and help hints
 */

import { describe, test, expect } from 'bun:test'
import { StatusBar, type StatusBarProps } from './StatusBar.js'
import { colors } from '../../utils/colors.js'

// Helper to create status bar props
function createProps(overrides: Partial<StatusBarProps> = {}): StatusBarProps {
  return {
    isConnected: true,
    error: null,
    dbPath: '/path/to/smithers.db',
    ...overrides
  }
}

describe('tui/components/layout/StatusBar', () => {
  describe('connection status display', () => {
    test('shows "[Connected]" when isConnected is true', () => {
      const props = createProps({ isConnected: true })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const connectionText = leftBox.props.children[0]
      expect(connectionText.props.content).toBe('[Connected]')
    })

    test('shows "[Disconnected]" when isConnected is false', () => {
      const props = createProps({ isConnected: false })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const connectionText = leftBox.props.children[0]
      expect(connectionText.props.content).toBe('[Disconnected]')
    })

    test('uses green for connected', () => {
      const props = createProps({ isConnected: true })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const connectionText = leftBox.props.children[0]
      expect(connectionText.props.style.fg).toBe(colors.green)
    })

    test('uses red for disconnected', () => {
      const props = createProps({ isConnected: false })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const connectionText = leftBox.props.children[0]
      expect(connectionText.props.style.fg).toBe(colors.red)
    })
  })

  describe('dbPath display', () => {
    test('displays dbPath prop', () => {
      const props = createProps({ dbPath: '/custom/path/db.sqlite' })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const pathText = leftBox.props.children[1]
      expect(pathText.props.content).toBe('/custom/path/db.sqlite')
    })

    test('uses comment color', () => {
      const props = createProps()
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const pathText = leftBox.props.children[1]
      expect(pathText.props.style.fg).toBe(colors.comment)
    })
  })

  describe('error display', () => {
    test('shows error message when error prop is set', () => {
      const props = createProps({ error: 'Connection failed' })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      // Error is third child in the left box when present
      const errorText = leftBox.props.children[2]
      expect(errorText).toBeDefined()
      expect(errorText.props.content).toBe('Error: Connection failed')
    })

    test('prefixes error with "Error: "', () => {
      const props = createProps({ error: 'timeout' })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const errorText = leftBox.props.children[2]
      expect(errorText.props.content).toBe('Error: timeout')
    })

    test('uses red for error', () => {
      const props = createProps({ error: 'Something went wrong' })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const errorText = leftBox.props.children[2]
      expect(errorText.props.style.fg).toBe(colors.red)
    })

    test('does not render error when error is null', () => {
      const props = createProps({ error: null })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      // With null error, there should only be connection status and dbPath
      // The third child should be falsy or undefined
      const children = leftBox.props.children.filter(Boolean)
      expect(children).toHaveLength(2)
    })
  })

  describe('help hints', () => {
    test('displays "Ctrl+C/Ctrl+Q:quit  F1-F6:tabs  j/k:nav  Enter:select"', () => {
      const props = createProps()
      const element = StatusBar(props)

      // Help hints are the second child of the main box
      const helpText = element.props.children[1]
      expect(helpText.props.content).toBe('Ctrl+C/Ctrl+Q:quit  F1-F6:tabs  j/k:nav  Enter:select')
    })

    test('uses comment color', () => {
      const props = createProps()
      const element = StatusBar(props)

      const helpText = element.props.children[1]
      expect(helpText.props.style.fg).toBe(colors.comment)
    })
  })

  describe('layout', () => {
    test('has height of 2', () => {
      const props = createProps()
      const element = StatusBar(props)
      expect(element.props.style.height).toBe(2)
    })

    test('has full width', () => {
      const props = createProps()
      const element = StatusBar(props)
      expect(element.props.style.width).toBe('100%')
    })

    test('uses row flex direction', () => {
      const props = createProps()
      const element = StatusBar(props)
      expect(element.props.style.flexDirection).toBe('row')
    })

    test('justifies content space-between', () => {
      const props = createProps()
      const element = StatusBar(props)
      expect(element.props.style.justifyContent).toBe('space-between')
    })

    test('has left and right padding of 1', () => {
      const props = createProps()
      const element = StatusBar(props)
      expect(element.props.style.paddingLeft).toBe(1)
      expect(element.props.style.paddingRight).toBe(1)
    })
  })

  describe('edge cases', () => {
    test('handles very long dbPath', () => {
      const longPath = '/very/long/path/' + 'a'.repeat(200) + '/smithers.db'
      const props = createProps({ dbPath: longPath })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const pathText = leftBox.props.children[1]
      expect(pathText.props.content).toBe(longPath)
    })

    test('handles very long error message', () => {
      const longError = 'Error: ' + 'a'.repeat(200)
      const props = createProps({ error: longError })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const errorText = leftBox.props.children[2]
      expect(errorText.props.content).toBe(longError)
    })

    test('handles empty dbPath', () => {
      const props = createProps({ dbPath: '' })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const pathText = leftBox.props.children[1]
      expect(pathText.props.content).toBe('')
    })

    test('handles special characters in error', () => {
      const props = createProps({ error: '<script>alert("xss")</script>' })
      const element = StatusBar(props)

      const leftBox = element.props.children[0]
      const errorText = leftBox.props.children[2]
      expect(errorText.props.content).toBe('Error: <script>alert("xss")</script>')
    })
  })
})
