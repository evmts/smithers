// Main TUI Application with tab navigation
// F1-F6 for view switching, vim-style navigation

import { useCallback, type ReactNode } from 'react'
import { useKeyboard, useRenderer, useTerminalDimensions } from '@opentui/react'
import { Header } from './components/layout/Header.js'
import { TabBar } from './components/layout/TabBar.js'
import { StatusBar } from './components/layout/StatusBar.js'
import { ReportViewer } from './components/views/ReportViewer.js'
import { useSmithersConnection } from './hooks/useSmithersConnection.js'
import { useReportGenerator, type UseReportGeneratorResult } from './hooks/useReportGenerator.js'
import type { KeyEvent } from '@opentui/core'
import { readTuiState, useTuiState } from './state.js'
import { colors } from './utils/colors.js'
import type { SmithersDB } from '../db/index.js'
import {
  TABS,
  type TabKey,
  getContentHeight,
  mapKeyToTab,
  nextTab,
  shouldQuit,
  viewForTab
} from './appNavigation.js'

export interface AppHooks {
  useKeyboard?: typeof useKeyboard
  useRenderer?: typeof useRenderer
  useTerminalDimensions?: typeof useTerminalDimensions
  useSmithersConnection?: typeof useSmithersConnection
  useReportGenerator?: typeof useReportGenerator
}

export interface AppProps {
  dbPath: string
  hooks?: AppHooks
}

export function App({ dbPath, hooks }: AppProps) {
  const keyboardHook = hooks?.useKeyboard ?? useKeyboard
  const rendererHook = hooks?.useRenderer ?? useRenderer
  const terminalHook = hooks?.useTerminalDimensions ?? useTerminalDimensions
  const connectionHook = hooks?.useSmithersConnection ?? useSmithersConnection
  const reportHook = hooks?.useReportGenerator ?? useReportGenerator

  const [activeTab, setActiveTab] = useTuiState<TabKey>('tui:app:activeTab', 'timeline')
  const renderer = rendererHook()
  const { height } = terminalHook()
  const { db, isConnected, error, currentExecution } = connectionHook(dbPath)

  const handleQuit = useCallback(() => {
    renderer?.destroy()
    process.exit(0)
  }, [renderer])

  // Handle keyboard navigation
  keyboardHook((key: KeyEvent) => {
    // Quit on Ctrl+C or Ctrl+Q
    if (shouldQuit(key)) {
      handleQuit()
      return
    }

    const currentTab = readTuiState('tui:app:activeTab', activeTab)
    const isTabCaptured = currentTab === 'chat' || currentTab === 'database'
    if (!isTabCaptured && key.name === 'tab') {
      setActiveTab(nextTab(TABS, currentTab, key.shift ? -1 : 1))
      return
    }

    const nextActiveTab = mapKeyToTab(key, TABS)
    if (nextActiveTab) {
      setActiveTab(nextActiveTab)
    }
  })

  // Calculate content area height (total - header - tabbar - statusbar)
  const contentHeight = getContentHeight(height)

  const renderView = useCallback((reportState: UseReportGeneratorResult) => {
    if (activeTab === 'reports') {
      return <ReportViewer height={contentHeight} reportState={reportState} />
    }

    const viewSpec = viewForTab(activeTab)
    if (!viewSpec || !db) return <text content="Unknown view" />
    return viewSpec.render(db, contentHeight)
  }, [activeTab, contentHeight, db])

  return (
    <box style={{
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: colors.bg
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
        {db ? (
          <ReportGeneratorRunner db={db} useReportGeneratorHook={reportHook}>
            {(reportState) => renderView(reportState)}
          </ReportGeneratorRunner>
        ) : (
          <text content="Connecting to database..." style={{ fg: colors.comment }} />
        )}
      </box>
      <StatusBar
        isConnected={isConnected}
        error={error}
        dbPath={dbPath}
      />
    </box>
  )
}

function ReportGeneratorRunner({
  db,
  children,
  useReportGeneratorHook
}: {
  db: SmithersDB
  children: (state: UseReportGeneratorResult) => ReactNode
  useReportGeneratorHook?: typeof useReportGenerator
}) {
  const reportState = (useReportGeneratorHook ?? useReportGenerator)(db)
  return <>{children(reportState)}</>
}
