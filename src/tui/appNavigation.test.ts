import { describe, test, expect } from 'bun:test'
import {
  TABS,
  type TabKey,
  getContentHeight,
  mapKeyToTab,
  nextTab,
  shouldQuit,
  viewForTab
} from './appNavigation.js'

const VIEW_IDS: Record<TabKey, string> = {
  timeline: 'ExecutionTimeline',
  frames: 'RenderFrameInspector',
  database: 'DatabaseExplorer',
  chat: 'ChatInterface',
  human: 'HumanInteractionHandler',
  reports: 'ReportViewer',
}

describe('tui/appNavigation', () => {
  test('TABS are unique and ordered by shortcut', () => {
    const keys = TABS.map(tab => tab.key)
    const shortcuts = TABS.map(tab => tab.shortcut)
    expect(new Set(keys).size).toBe(keys.length)
    expect(shortcuts).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6'])
  })

  test('mapKeyToTab maps function keys to tabs', () => {
    for (const tab of TABS) {
      const keyName = tab.shortcut.toLowerCase()
      const mapped = mapKeyToTab({ name: keyName }, TABS)
      expect(mapped).toBe(tab.key)
    }
  })

  test('mapKeyToTab ignores Tab and unrelated keys', () => {
    expect(mapKeyToTab({ name: 'tab' }, TABS)).toBeNull()
    expect(mapKeyToTab({ name: 'x' }, TABS)).toBeNull()
  })

  test('nextTab wraps in both directions', () => {
    expect(nextTab(TABS, 'reports', 1)).toBe('timeline')
    expect(nextTab(TABS, 'timeline', -1)).toBe('reports')
  })

  test('shouldQuit handles ctrl+q and ctrl+c', () => {
    expect(shouldQuit({ name: 'q', ctrl: false })).toBe(false)
    expect(shouldQuit({ name: 'q', ctrl: true })).toBe(true)
    expect(shouldQuit({ name: 'c', ctrl: true })).toBe(true)
    expect(shouldQuit({ name: 'c', ctrl: false })).toBe(false)
  })

  test('getContentHeight enforces minimum height', () => {
    expect(getContentHeight(5)).toBe(10)
    expect(getContentHeight(16)).toBe(10)
    expect(getContentHeight(17)).toBe(11)
  })

  test('viewForTab maps tab keys to view ids', () => {
    for (const tab of TABS) {
      const view = viewForTab(tab.key)
      expect(view?.id).toBe(VIEW_IDS[tab.key])
    }
  })
})
