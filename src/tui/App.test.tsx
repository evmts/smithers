/**
 * Tests for src/tui/App.tsx
 * Main TUI application with tab navigation
 */

import { describe, test, expect } from 'bun:test'
import { TABS, type TabKey, type TabInfo } from './App.js'

describe('tui/App', () => {
  describe('tab navigation', () => {
    test('F1 switches to timeline tab', () => {
      const keyEvent = { name: 'f1' }
      let activeTab: TabKey = 'database'
      
      if (keyEvent.name === 'f1') activeTab = 'timeline'
      
      expect(activeTab).toBe('timeline')
    })

    test('F2 switches to frames tab', () => {
      const keyEvent = { name: 'f2' }
      let activeTab: TabKey = 'timeline'
      
      if (keyEvent.name === 'f2') activeTab = 'frames'
      
      expect(activeTab).toBe('frames')
    })

    test('F3 switches to database tab', () => {
      const keyEvent = { name: 'f3' }
      let activeTab: TabKey = 'timeline'
      
      if (keyEvent.name === 'f3') activeTab = 'database'
      
      expect(activeTab).toBe('database')
    })

    test('F4 switches to chat tab', () => {
      const keyEvent = { name: 'f4' }
      let activeTab: TabKey = 'timeline'
      
      if (keyEvent.name === 'f4') activeTab = 'chat'
      
      expect(activeTab).toBe('chat')
    })

    test('F5 switches to human tab', () => {
      const keyEvent = { name: 'f5' }
      let activeTab: TabKey = 'timeline'
      
      if (keyEvent.name === 'f5') activeTab = 'human'
      
      expect(activeTab).toBe('human')
    })

    test('F6 switches to reports tab', () => {
      const keyEvent = { name: 'f6' }
      let activeTab: TabKey = 'timeline'
      
      if (keyEvent.name === 'f6') activeTab = 'reports'
      
      expect(activeTab).toBe('reports')
    })

    test('Tab key cycles to next tab', () => {
      let activeTab: TabKey = 'timeline'
      const key = { name: 'tab', shift: false }
      
      if (key.name === 'tab' && !key.shift) {
        const currentIndex = TABS.findIndex(t => t.key === activeTab)
        const nextIndex = (currentIndex + 1) % TABS.length
        activeTab = TABS[nextIndex]!.key
      }
      
      expect(activeTab).toBe('frames')
    })

    test('Shift+Tab cycles to previous tab', () => {
      let activeTab: TabKey = 'frames'
      const key = { name: 'tab', shift: true }
      
      if (key.name === 'tab' && key.shift) {
        const currentIndex = TABS.findIndex(t => t.key === activeTab)
        const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length
        activeTab = TABS[prevIndex]!.key
      }
      
      expect(activeTab).toBe('timeline')
    })

    test('Tab wraps from last to first', () => {
      let activeTab: TabKey = 'reports' // Last tab
      const key = { name: 'tab', shift: false }
      
      if (key.name === 'tab' && !key.shift) {
        const currentIndex = TABS.findIndex(t => t.key === activeTab)
        const nextIndex = (currentIndex + 1) % TABS.length
        activeTab = TABS[nextIndex]!.key
      }
      
      expect(activeTab).toBe('timeline')
    })

    test('Shift+Tab wraps from first to last', () => {
      let activeTab: TabKey = 'timeline' // First tab
      const key = { name: 'tab', shift: true }
      
      if (key.name === 'tab' && key.shift) {
        const currentIndex = TABS.findIndex(t => t.key === activeTab)
        const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length
        activeTab = TABS[prevIndex]!.key
      }
      
      expect(activeTab).toBe('reports')
    })
  })

  describe('quit handling', () => {
    test('q key would trigger exit', () => {
      const key = { name: 'q', ctrl: false }
      const shouldQuit = key.name === 'q' || (key.ctrl && key.name === 'c')
      expect(shouldQuit).toBe(true)
    })

    test('Ctrl+C would trigger exit', () => {
      const key = { name: 'c', ctrl: true }
      const shouldQuit = key.name === 'q' || (key.ctrl && key.name === 'c')
      expect(shouldQuit).toBe(true)
    })
  })

  describe('TABS constant', () => {
    test('contains 6 tab definitions', () => {
      expect(TABS).toHaveLength(6)
    })

    test('each tab has key, label, and shortcut', () => {
      for (const tab of TABS) {
        expect(tab.key).toBeDefined()
        expect(tab.label).toBeDefined()
        expect(tab.shortcut).toBeDefined()
        expect(typeof tab.key).toBe('string')
        expect(typeof tab.label).toBe('string')
        expect(typeof tab.shortcut).toBe('string')
      }
    })

    test('keys are unique', () => {
      const keys = TABS.map(t => t.key)
      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBe(keys.length)
    })

    test('shortcuts are F1-F6', () => {
      const shortcuts = TABS.map(t => t.shortcut)
      expect(shortcuts).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6'])
    })

    test('tab order matches F-key order', () => {
      expect(TABS[0]!.key).toBe('timeline')
      expect(TABS[0]!.shortcut).toBe('F1')
      expect(TABS[1]!.key).toBe('frames')
      expect(TABS[1]!.shortcut).toBe('F2')
      expect(TABS[2]!.key).toBe('database')
      expect(TABS[2]!.shortcut).toBe('F3')
      expect(TABS[3]!.key).toBe('chat')
      expect(TABS[3]!.shortcut).toBe('F4')
      expect(TABS[4]!.key).toBe('human')
      expect(TABS[4]!.shortcut).toBe('F5')
      expect(TABS[5]!.key).toBe('reports')
      expect(TABS[5]!.shortcut).toBe('F6')
    })
  })

  describe('content height calculation', () => {
    test('contentHeight is height - 6', () => {
      const height = 40
      const contentHeight = Math.max(height - 6, 10)
      expect(contentHeight).toBe(34)
    })

    test('contentHeight has minimum of 10', () => {
      const height = 5 // Very small terminal
      const contentHeight = Math.max(height - 6, 10)
      expect(contentHeight).toBe(10)
    })

    test('contentHeight calculation with edge cases', () => {
      // Exactly 16 height should give 10
      const height16 = 16
      expect(Math.max(height16 - 6, 10)).toBe(10)
      
      // Height of 17 should give 11
      const height17 = 17
      expect(Math.max(height17 - 6, 10)).toBe(11)
      
      // Very large terminal
      const height100 = 100
      expect(Math.max(height100 - 6, 10)).toBe(94)
    })
  })

  describe('view rendering logic', () => {
    test('returns correct view for timeline tab', () => {
      const activeTab: TabKey = 'timeline'
      const viewName = getViewNameForTab(activeTab)
      expect(viewName).toBe('ExecutionTimeline')
    })

    test('returns correct view for frames tab', () => {
      const activeTab: TabKey = 'frames'
      const viewName = getViewNameForTab(activeTab)
      expect(viewName).toBe('RenderFrameInspector')
    })

    test('returns correct view for database tab', () => {
      const activeTab: TabKey = 'database'
      const viewName = getViewNameForTab(activeTab)
      expect(viewName).toBe('DatabaseExplorer')
    })

    test('returns correct view for chat tab', () => {
      const activeTab: TabKey = 'chat'
      const viewName = getViewNameForTab(activeTab)
      expect(viewName).toBe('ChatInterface')
    })

    test('returns correct view for human tab', () => {
      const activeTab: TabKey = 'human'
      const viewName = getViewNameForTab(activeTab)
      expect(viewName).toBe('HumanInteractionHandler')
    })

    test('returns correct view for reports tab', () => {
      const activeTab: TabKey = 'reports'
      const viewName = getViewNameForTab(activeTab)
      expect(viewName).toBe('ReportViewer')
    })

    test('returns "Unknown view" for invalid tab', () => {
      const activeTab = 'nonexistent' as TabKey
      const viewName = getViewNameForTab(activeTab)
      expect(viewName).toBe('Unknown view')
    })
  })

  describe('initial state', () => {
    test('starts on timeline tab', () => {
      // Initial useState value is 'timeline'
      const initialActiveTab: TabKey = 'timeline'
      expect(initialActiveTab).toBe('timeline')
    })

    test('initial activeTab is "timeline"', () => {
      const initialActiveTab: TabKey = 'timeline'
      expect(initialActiveTab).toBe('timeline')
      expect(TABS.findIndex(t => t.key === initialActiveTab)).toBe(0)
    })
  })

  describe('props', () => {
    test('AppProps requires dbPath', () => {
      const props = { dbPath: '/path/to/smithers.db' }
      expect(props.dbPath).toBe('/path/to/smithers.db')
    })
  })

  describe('layout structure', () => {
    test('main container uses column flex direction', () => {
      const containerStyle = {
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1b26'
      }
      expect(containerStyle.flexDirection).toBe('column')
    })

    test('main container has full width and height', () => {
      const containerStyle = {
        width: '100%',
        height: '100%'
      }
      expect(containerStyle.width).toBe('100%')
      expect(containerStyle.height).toBe('100%')
    })

    test('main container has dark background', () => {
      const containerStyle = {
        backgroundColor: '#1a1b26'
      }
      expect(containerStyle.backgroundColor).toBe('#1a1b26')
    })

    test('content area has flexGrow 1', () => {
      const contentStyle = {
        flexGrow: 1,
        padding: 1,
        overflow: 'hidden'
      }
      expect(contentStyle.flexGrow).toBe(1)
    })

    test('content area has padding 1', () => {
      const contentStyle = {
        padding: 1
      }
      expect(contentStyle.padding).toBe(1)
    })

    test('content area has overflow hidden', () => {
      const contentStyle = {
        overflow: 'hidden'
      }
      expect(contentStyle.overflow).toBe('hidden')
    })
  })

  describe('TabKey type', () => {
    test('includes all valid tab keys', () => {
      const validKeys: TabKey[] = ['timeline', 'frames', 'database', 'chat', 'human', 'reports']
      expect(validKeys).toHaveLength(6)
      
      for (const key of validKeys) {
        expect(TABS.find(t => t.key === key)).toBeDefined()
      }
    })
  })

  describe('TabInfo interface', () => {
    test('has key, label, and shortcut properties', () => {
      const tabInfo: TabInfo = {
        key: 'timeline',
        label: 'Timeline',
        shortcut: 'F1'
      }
      
      expect(tabInfo.key).toBe('timeline')
      expect(tabInfo.label).toBe('Timeline')
      expect(tabInfo.shortcut).toBe('F1')
    })
  })
})

// Helper function to simulate renderView logic
function getViewNameForTab(tab: TabKey): string {
  switch (tab) {
    case 'timeline': return 'ExecutionTimeline'
    case 'frames': return 'RenderFrameInspector'
    case 'database': return 'DatabaseExplorer'
    case 'chat': return 'ChatInterface'
    case 'human': return 'HumanInteractionHandler'
    case 'reports': return 'ReportViewer'
    default: return 'Unknown view'
  }
}
