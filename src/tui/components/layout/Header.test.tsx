/**
 * Tests for src/tui/components/layout/Header.tsx
 * Header component showing execution info and branding
 */

import { describe, test, expect } from 'bun:test'
import { Header, type HeaderProps } from './Header.js'

// Helper to create header props
function createProps(overrides: Partial<HeaderProps> = {}): HeaderProps {
  return {
    executionName: 'test-execution',
    status: 'running',
    ...overrides
  }
}

describe('tui/components/layout/Header', () => {
  describe('rendering', () => {
    test('renders "Smithers TUI" branding text', () => {
      const props = createProps()
      const element = Header(props)
      
      // Header returns a box with children
      expect(element).toBeDefined()
      expect(element.props.children).toBeDefined()
      
      // First child is the branding text
      const brandingText = element.props.children[0]
      expect(brandingText.props.content).toBe('Smithers TUI')
    })

    test('renders execution name', () => {
      const props = createProps({ executionName: 'my-workflow' })
      const element = Header(props)
      
      // Second child is a box containing execution name and status
      const infoBox = element.props.children[1]
      const execNameText = infoBox.props.children[0]
      expect(execNameText.props.content).toBe('my-workflow')
    })

    test('renders status in brackets', () => {
      const props = createProps({ status: 'completed' })
      const element = Header(props)
      
      const infoBox = element.props.children[1]
      const statusText = infoBox.props.children[1]
      expect(statusText.props.content).toBe('[completed]')
    })

    test('applies bold styling to branding', () => {
      const props = createProps()
      const element = Header(props)
      
      const brandingText = element.props.children[0]
      // TextAttributes.BOLD = 1
      expect(brandingText.props.style.attributes).toBe(1)
    })
  })

  describe('status colors (getStatusColor)', () => {
    test('returns green (#9ece6a) for "running"', () => {
      const props = createProps({ status: 'running' })
      const element = Header(props)
      
      const infoBox = element.props.children[1]
      const statusText = infoBox.props.children[1]
      expect(statusText.props.style.fg).toBe('#9ece6a')
    })

    test('returns teal (#73daca) for "completed"', () => {
      const props = createProps({ status: 'completed' })
      const element = Header(props)
      
      const infoBox = element.props.children[1]
      const statusText = infoBox.props.children[1]
      expect(statusText.props.style.fg).toBe('#73daca')
    })

    test('returns red (#f7768e) for "failed"', () => {
      const props = createProps({ status: 'failed' })
      const element = Header(props)
      
      const infoBox = element.props.children[1]
      const statusText = infoBox.props.children[1]
      expect(statusText.props.style.fg).toBe('#f7768e')
    })

    test('returns orange (#e0af68) for "pending"', () => {
      const props = createProps({ status: 'pending' })
      const element = Header(props)
      
      const infoBox = element.props.children[1]
      const statusText = infoBox.props.children[1]
      expect(statusText.props.style.fg).toBe('#e0af68')
    })

    test('returns gray (#565f89) for unknown status', () => {
      const props = createProps({ status: 'unknown-status' })
      const element = Header(props)
      
      const infoBox = element.props.children[1]
      const statusText = infoBox.props.children[1]
      expect(statusText.props.style.fg).toBe('#565f89')
    })
  })

  describe('layout', () => {
    test('uses row flex direction', () => {
      const props = createProps()
      const element = Header(props)
      expect(element.props.style.flexDirection).toBe('row')
    })

    test('justifies content space-between', () => {
      const props = createProps()
      const element = Header(props)
      expect(element.props.style.justifyContent).toBe('space-between')
    })

    test('has height of 2', () => {
      const props = createProps()
      const element = Header(props)
      expect(element.props.style.height).toBe(2)
    })

    test('has full width', () => {
      const props = createProps()
      const element = Header(props)
      expect(element.props.style.width).toBe('100%')
    })

    test('has left and right padding of 1', () => {
      const props = createProps()
      const element = Header(props)
      expect(element.props.style.paddingLeft).toBe(1)
      expect(element.props.style.paddingRight).toBe(1)
    })
  })

  describe('props', () => {
    test('displays executionName prop', () => {
      const props = createProps({ executionName: 'custom-exec' })
      const element = Header(props)
      
      const infoBox = element.props.children[1]
      const execNameText = infoBox.props.children[0]
      expect(execNameText.props.content).toBe('custom-exec')
    })

    test('applies color based on status prop', () => {
      const props = createProps({ status: 'failed' })
      const element = Header(props)
      
      const infoBox = element.props.children[1]
      const statusText = infoBox.props.children[1]
      expect(statusText.props.content).toBe('[failed]')
      expect(statusText.props.style.fg).toBe('#f7768e')
    })
  })

  describe('edge cases', () => {
    test('handles empty executionName', () => {
      const props = createProps({ executionName: '' })
      const element = Header(props)
      
      const infoBox = element.props.children[1]
      const execNameText = infoBox.props.children[0]
      expect(execNameText.props.content).toBe('')
    })

    test('handles very long executionName', () => {
      const longName = 'a'.repeat(200)
      const props = createProps({ executionName: longName })
      const element = Header(props)
      
      const infoBox = element.props.children[1]
      const execNameText = infoBox.props.children[0]
      expect(execNameText.props.content).toBe(longName)
    })

    test('handles special characters in executionName', () => {
      const props = createProps({ executionName: 'test<>&"\'chars' })
      const element = Header(props)
      
      const infoBox = element.props.children[1]
      const execNameText = infoBox.props.children[0]
      expect(execNameText.props.content).toBe('test<>&"\'chars')
    })
  })
})
