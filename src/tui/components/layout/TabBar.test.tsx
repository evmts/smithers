/**
 * Tests for src/tui/components/layout/TabBar.tsx
 * Tab bar for navigation between views
 */

import { describe, test, expect } from 'bun:test'
import { TabBar, type TabBarProps } from './TabBar.js'
import type { TabInfo, TabKey } from '../../appNavigation.js'
import { colors } from '../../utils/colors.js'
import { TextAttributes } from '@opentui/core'

// Sample tabs for testing
const SAMPLE_TABS: TabInfo[] = [
  { key: 'timeline', label: 'Timeline', shortcut: 'F1' },
  { key: 'frames', label: 'Frames', shortcut: 'F2' },
  { key: 'database', label: 'Database', shortcut: 'F3' },
]

// Helper to create tab bar props
function createProps(overrides: Partial<TabBarProps> = {}): TabBarProps {
  return {
    tabs: SAMPLE_TABS,
    activeTab: 'timeline',
    onTabChange: () => {},
    ...overrides
  }
}

describe('tui/components/layout/TabBar', () => {
  describe('tab rendering', () => {
    test('renders all tabs from props', () => {
      const props = createProps()
      const element = TabBar(props)

      // element is a box containing tab boxes
      const tabBoxes = element.props.children
      expect(tabBoxes).toHaveLength(3)
    })

    test('renders shortcut label (e.g., "F1:")', () => {
      const props = createProps()
      const element = TabBar(props)

      const firstTabBox = element.props.children[0]
      const shortcutText = firstTabBox.props.children[0]
      expect(shortcutText.props.content).toBe('F1:')
    })

    test('renders tab label', () => {
      const props = createProps()
      const element = TabBar(props)

      const firstTabBox = element.props.children[0]
      const labelText = firstTabBox.props.children[1]
      expect(labelText.props.content).toBe('Timeline')
    })

    test('uses unique keys for each tab', () => {
      const props = createProps()
      const element = TabBar(props)

      const tabBoxes = element.props.children
      const keys = tabBoxes.map((box: { key: string }) => box.key)
      expect(keys).toEqual(['timeline', 'frames', 'database'])
    })
  })

  describe('active tab styling', () => {
    test('applies blue to active tab label', () => {
      const props = createProps({ activeTab: 'timeline' })
      const element = TabBar(props)

      const firstTabBox = element.props.children[0]
      const labelText = firstTabBox.props.children[1]
      expect(labelText.props.style.fg).toBe(colors.blue)
    })

    test('applies gray to inactive tab labels', () => {
      const props = createProps({ activeTab: 'timeline' })
      const element = TabBar(props)

      // Second tab is inactive
      const secondTabBox = element.props.children[1]
      const labelText = secondTabBox.props.children[1]
      expect(labelText.props.style.fg).toBe(colors.fgDark)
    })

    test('applies background to active tab', () => {
      const props = createProps({ activeTab: 'frames' })
      const element = TabBar(props)

      // Second tab should be active
      const secondTabBox = element.props.children[1]
      const labelText = secondTabBox.props.children[1]
      expect(labelText.props.style.backgroundColor).toBe(colors.bgHighlight)
    })

    test('applies bold to active tab label', () => {
      const props = createProps({ activeTab: 'timeline' })
      const element = TabBar(props)

      const firstTabBox = element.props.children[0]
      const labelText = firstTabBox.props.children[1]
      expect(labelText.props.style.attributes).toBe(TextAttributes.BOLD)
    })

    test('no background for inactive tabs', () => {
      const props = createProps({ activeTab: 'timeline' })
      const element = TabBar(props)

      // Second tab is inactive
      const secondTabBox = element.props.children[1]
      const labelText = secondTabBox.props.children[1]
      expect(labelText.props.style.backgroundColor).toBeUndefined()
    })
  })

  describe('shortcut styling', () => {
    test('shortcut always uses comment color', () => {
      const props = createProps()
      const element = TabBar(props)

      const firstTabBox = element.props.children[0]
      const shortcutText = firstTabBox.props.children[0]
      expect(shortcutText.props.style.fg).toBe(colors.comment)
    })

    test('shortcut color unchanged by active state', () => {
      const props = createProps({ activeTab: 'timeline' })
      const element = TabBar(props)

      // Active tab's shortcut
      const activeTabBox = element.props.children[0]
      const activeShortcut = activeTabBox.props.children[0]
      expect(activeShortcut.props.style.fg).toBe(colors.comment)

      // Inactive tab's shortcut
      const inactiveTabBox = element.props.children[1]
      const inactiveShortcut = inactiveTabBox.props.children[0]
      expect(inactiveShortcut.props.style.fg).toBe(colors.comment)
    })
  })

  describe('layout', () => {
    test('has height of 1', () => {
      const props = createProps()
      const element = TabBar(props)
      expect(element.props.style.height).toBe(1)
    })

    test('has full width', () => {
      const props = createProps()
      const element = TabBar(props)
      expect(element.props.style.width).toBe('100%')
    })

    test('uses row flex direction', () => {
      const props = createProps()
      const element = TabBar(props)
      expect(element.props.style.flexDirection).toBe('row')
    })

    test('has left padding of 1', () => {
      const props = createProps()
      const element = TabBar(props)
      expect(element.props.style.paddingLeft).toBe(1)
    })

    test('tabs have marginRight of 2', () => {
      const props = createProps()
      const element = TabBar(props)

      const firstTabBox = element.props.children[0]
      expect(firstTabBox.props.style.marginRight).toBe(2)
    })
  })

  describe('props', () => {
    test('receives tabs array prop', () => {
      const customTabs: TabInfo[] = [
        { key: 'chat', label: 'Chat', shortcut: 'F4' }
      ]
      const props = createProps({ tabs: customTabs })
      const element = TabBar(props)

      expect(element.props.children).toHaveLength(1)
      const tabBox = element.props.children[0]
      const labelText = tabBox.props.children[1]
      expect(labelText.props.content).toBe('Chat')
    })

    test('receives activeTab prop', () => {
      const props = createProps({ activeTab: 'database' })
      const element = TabBar(props)

      // Third tab should be active
      const thirdTabBox = element.props.children[2]
      const labelText = thirdTabBox.props.children[1]
      expect(labelText.props.style.fg).toBe(colors.blue)
    })

    test('receives onTabChange callback (currently unused)', () => {
      const mockCallback = () => {}
      const props = createProps({ onTabChange: mockCallback })
      // Currently the component does not use onTabChange, but it accepts it
      const element = TabBar(props)
      expect(element).toBeDefined()
    })
  })

  describe('edge cases', () => {
    test('handles empty tabs array', () => {
      const props = createProps({ tabs: [] })
      const element = TabBar(props)

      expect(element.props.children).toHaveLength(0)
    })

    test('handles single tab', () => {
      const singleTab: TabInfo[] = [{ key: 'timeline', label: 'Timeline', shortcut: 'F1' }]
      const props = createProps({ tabs: singleTab })
      const element = TabBar(props)

      expect(element.props.children).toHaveLength(1)
    })

    test('handles very long tab labels', () => {
      const longLabelTab: TabInfo[] = [
        { key: 'test' as TabKey, label: 'A'.repeat(50), shortcut: 'F1' }
      ]
      const props = createProps({ tabs: longLabelTab })
      const element = TabBar(props)

      const tabBox = element.props.children[0]
      const labelText = tabBox.props.children[1]
      expect(labelText.props.content).toBe('A'.repeat(50))
    })

    test('handles activeTab not in tabs array', () => {
      // When activeTab doesn't match, no tab is highlighted as active
      const props = createProps({ activeTab: 'nonexistent' as TabKey })
      const element = TabBar(props)

      // All tabs should be inactive (gray color)
      const tabBoxes = element.props.children
      for (const tabBox of tabBoxes) {
        const labelText = tabBox.props.children[1]
        expect(labelText.props.style.fg).toBe(colors.fgDark)
      }
    })
  })
})
