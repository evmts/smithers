// Main TUI Application with tab navigation
// F1-F6 for view switching, vim-style navigation

import { useCallback } from 'react'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { Header } from './components/layout/Header.js'
import { TabBar } from './components/layout/TabBar.js'
import { StatusBar } from './components/layout/StatusBar.js'
import { ExecutionTimeline } from './components/views/ExecutionTimeline.js'
import { RenderFrameInspector } from './components/views/RenderFrameInspector.js'
import { DatabaseExplorer } from './components/views/DatabaseExplorer.js'
import { ChatInterface } from './components/views/ChatInterface.js'
import { HumanInteractionHandler } from './components/views/HumanInteractionHandler.js'
import { ReportViewer } from './components/views/ReportViewer.js'
import { useSmithersConnection } from './hooks/useSmithersConnection.js'
import type { KeyEvent } from '@opentui/core'
import { useTuiState } from './state.js'

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

export interface AppProps {
  dbPath: string
}

export function App({ dbPath }: AppProps) {
  const [activeTab, setActiveTab] = useTuiState<TabKey>('tui:app:activeTab', 'timeline')
  const { height } = useTerminalDimensions()
  const { db, isConnected, error, currentExecution } = useSmithersConnection(dbPath)

  // Handle keyboard navigation
  useKeyboard((key: KeyEvent) => {
    // Function key navigation
    if (key.name === 'f1') setActiveTab('timeline')
    else if (key.name === 'f2') setActiveTab('frames')
    else if (key.name === 'f3') setActiveTab('database')
    else if (key.name === 'f4') setActiveTab('chat')
    else if (key.name === 'f5') setActiveTab('human')
    else if (key.name === 'f6') setActiveTab('reports')

    // Tab key cycles through tabs
    else if (key.name === 'tab' && !key.shift) {
      const currentIndex = TABS.findIndex(t => t.key === activeTab)
      const nextIndex = (currentIndex + 1) % TABS.length
      setActiveTab(TABS[nextIndex]!.key)
    } else if (key.name === 'tab' && key.shift) {
      const currentIndex = TABS.findIndex(t => t.key === activeTab)
      const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length
      setActiveTab(TABS[prevIndex]!.key)
    }

    // Quit on 'q' or Ctrl+C
    else if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      process.exit(0)
    }
  })

  // Calculate content area height (total - header - tabbar - statusbar)
  const contentHeight = Math.max(height - 6, 10)

  const renderView = useCallback(() => {
    if (!db) {
      return <text content="Connecting to database..." style={{ fg: '#888888' }} />
    }

    switch (activeTab) {
      case 'timeline':
        return <ExecutionTimeline db={db} height={contentHeight} />
      case 'frames':
        return <RenderFrameInspector db={db} height={contentHeight} />
      case 'database':
        return <DatabaseExplorer db={db} height={contentHeight} />
      case 'chat':
        return <ChatInterface db={db} height={contentHeight} />
      case 'human':
        return <HumanInteractionHandler db={db} height={contentHeight} />
      case 'reports':
        return <ReportViewer db={db} height={contentHeight} />
      default:
        return <text content="Unknown view" />
    }
  }, [activeTab, db, contentHeight])

  return (
    <box style={{
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: '#1a1b26'
    }}>
      <Header
        executionName={currentExecution?.name ?? 'No execution'}
        status={currentExecution?.status ?? 'idle'}
      />
      <TabBar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <box style={{
        flexGrow: 1,
        padding: 1,
        overflow: 'hidden'
      }}>
        {renderView()}
      </box>
      <StatusBar
        isConnected={isConnected}
        error={error}
        dbPath={dbPath}
      />
    </box>
  )
}
