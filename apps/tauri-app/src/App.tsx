import { Component, Show, createSignal, onMount, onCleanup } from 'solid-js'
import { ExecutionTree } from './components/ExecutionTree'
import { AgentPanel } from './components/AgentPanel'
import { Header } from './components/Header'
import { ConnectionStatus } from './components/ConnectionStatus'
import { useExecutionStore, initWebSocket } from './stores/execution'

const App: Component = () => {
  const store = useExecutionStore()
  const [view, setView] = createSignal<'tree' | 'logs'>('tree')

  onMount(() => {
    // Initialize WebSocket connection to receive CLI updates
    const cleanup = initWebSocket()
    onCleanup(cleanup)
  })

  return (
    <div class="app">
      <Header
        session={store.currentSession()}
        onViewChange={setView}
        currentView={view()}
      />

      <div class="main-content">
        <div class="left-panel">
          <ExecutionTree
            tree={store.tree()}
            selectedPath={store.selectedNode()}
            onSelectNode={store.setSelectedNode}
          />
        </div>

        <div class="right-panel">
          <Show when={store.selectedNode()} fallback={
            <div class="no-selection">
              <p>Select a node from the tree to view details</p>
            </div>
          }>
            <AgentPanel
              nodePath={store.selectedNode()!}
              session={store.currentSession()}
            />
          </Show>
        </div>
      </div>

      <ConnectionStatus isConnected={store.isConnected()} />

      <style>{`
        .app {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #1a1a2e;
        }

        .main-content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .left-panel {
          width: 50%;
          border-right: 1px solid #333;
          overflow: auto;
        }

        .right-panel {
          width: 50%;
          overflow: auto;
        }

        .no-selection {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
          font-size: 14px;
        }
      `}</style>
    </div>
  )
}

export default App
