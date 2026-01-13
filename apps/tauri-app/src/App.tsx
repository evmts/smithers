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
    // Initialize Tauri event listener to receive CLI updates
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

      {/* Frame navigation */}
      <div style={{
        padding: '8px 16px',
        background: '#2a2a3e',
        color: '#ccc',
        'font-size': '13px',
        display: 'flex',
        'align-items': 'center',
        gap: '16px',
        'border-bottom': '1px solid #333'
      }}>
        <span style={{ color: '#888' }}>
          Frame: {store.viewingFrame() ?? store.totalFrames()} / {store.totalFrames()}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => store.goToPrevFrame()}
            disabled={store.totalFrames() === 0}
            style={{
              padding: '4px 12px',
              background: '#3a3a4e',
              border: 'none',
              'border-radius': '4px',
              color: '#ccc',
              cursor: 'pointer'
            }}
          >
            ← Prev
          </button>
          <button
            onClick={() => store.goToNextFrame()}
            disabled={store.viewingFrame() === null}
            style={{
              padding: '4px 12px',
              background: '#3a3a4e',
              border: 'none',
              'border-radius': '4px',
              color: '#ccc',
              cursor: 'pointer'
            }}
          >
            Next →
          </button>
          <button
            onClick={() => store.goToLatest()}
            disabled={store.viewingFrame() === null}
            style={{
              padding: '4px 12px',
              background: store.viewingFrame() === null ? '#3a3a4e' : '#3498db',
              border: 'none',
              'border-radius': '4px',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Latest
          </button>
        </div>
        <span style={{ color: '#666', 'margin-left': 'auto' }}>
          Events: {store.events().length}
        </span>
      </div>

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
