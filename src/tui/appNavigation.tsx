import type { KeyEvent } from '@opentui/core'
import type { SmithersDB } from '../db/index.js'
import { ExecutionTimeline } from './components/views/ExecutionTimeline.js'
import { RenderFrameInspector } from './components/views/RenderFrameInspector.js'
import { DatabaseExplorer } from './components/views/DatabaseExplorer.js'
import { ChatInterface } from './components/views/ChatInterface.js'
import { HumanInteractionHandler } from './components/views/HumanInteractionHandler.js'
import { ReportViewer } from './components/views/ReportViewer.js'

export type TabKey = 'timeline' | 'frames' | 'database' | 'chat' | 'human' | 'reports'

export interface TabInfo {
  key: TabKey
  label: string
  shortcut: string
}

export const TABS: TabInfo[] = [
  { key: 'timeline', label: 'Timeline', shortcut: 'F1' },
  { key: 'frames', label: 'Frames', shortcut: 'F2' },
  { key: 'database', label: 'Database', shortcut: 'F3' },
  { key: 'chat', label: 'Chat', shortcut: 'F4' },
  { key: 'human', label: 'Human', shortcut: 'F5' },
  { key: 'reports', label: 'Reports', shortcut: 'F6' },
]

export type TabViewId =
  | 'ExecutionTimeline'
  | 'RenderFrameInspector'
  | 'DatabaseExplorer'
  | 'ChatInterface'
  | 'HumanInteractionHandler'
  | 'ReportViewer'

interface TabViewSpec {
  id: TabViewId
  render: (db: SmithersDB, height: number) => JSX.Element
}

const TAB_VIEWS: Record<TabKey, TabViewSpec> = {
  timeline: {
    id: 'ExecutionTimeline',
    render: (db, height) => <ExecutionTimeline db={db} height={height} />
  },
  frames: {
    id: 'RenderFrameInspector',
    render: (db, height) => <RenderFrameInspector db={db} height={height} />
  },
  database: {
    id: 'DatabaseExplorer',
    render: (db, height) => <DatabaseExplorer db={db} height={height} />
  },
  chat: {
    id: 'ChatInterface',
    render: (db, height) => <ChatInterface db={db} height={height} />
  },
  human: {
    id: 'HumanInteractionHandler',
    render: (db, height) => <HumanInteractionHandler db={db} height={height} />
  },
  reports: {
    id: 'ReportViewer',
    render: (db, height) => <ReportViewer db={db} height={height} />
  },
}

export function viewForTab(tab: TabKey): TabViewSpec | null {
  return TAB_VIEWS[tab] ?? null
}

export function getContentHeight(height: number): number {
  return Math.max(height - 6, 10)
}

export function nextTab(tabs: TabInfo[], current: TabKey, dir: 1 | -1): TabKey {
  if (tabs.length === 0) return current
  const currentIndex = tabs.findIndex(tab => tab.key === current)
  if (currentIndex === -1) {
    return dir === 1 ? tabs[0]!.key : tabs[tabs.length - 1]!.key
  }
  const nextIndex = (currentIndex + dir + tabs.length) % tabs.length
  return tabs[nextIndex]!.key
}

export function mapKeyToTab(
  key: Pick<KeyEvent, 'name'>,
  tabs: TabInfo[]
): TabKey | null {
  const shortcut = key.name ? key.name.toUpperCase() : ''
  const fKeyMatch = tabs.find(tab => tab.shortcut.toUpperCase() === shortcut)
  if (fKeyMatch) return fKeyMatch.key
  return null
}

export function shouldQuit(key: Pick<KeyEvent, 'name' | 'ctrl'>): boolean {
  return key.ctrl && (key.name === 'c' || key.name === 'q')
}
