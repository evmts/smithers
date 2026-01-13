import { createSignal, createRoot } from 'solid-js'
import type { SmithersNodeSnapshot } from '@evmts/smithers-protocol'
import type {
  CliToTauriMessage,
  SessionStartMessage,
  SessionEndMessage,
  TreeUpdateMessage,
  NodeOutputMessage,
  ExecutionEventMessage,
} from '@evmts/smithers-protocol'
// WS_PORT used by Rust backend, not needed in frontend

export interface Session {
  id: string
  agentFile: string
  status: 'running' | 'paused' | 'completed' | 'error'
  frame: number
  startTime: number
  endTime?: number
  output?: unknown
  error?: string
}

export interface NodeOutput {
  path: string
  type: string
  output: string
  status: 'running' | 'complete' | 'error'
  error?: string
}

// Tree history entry
interface TreeFrame {
  frame: number
  tree: SmithersNodeSnapshot
  timestamp: number
}

// Create reactive store using Solid's primitives
function createExecutionStore() {
  const [sessions, setSessions] = createSignal<Record<string, Session>>({})
  const [currentSessionId, setCurrentSessionId] = createSignal<string | null>(null)
  // Store full history of trees per session
  const [treeHistory, setTreeHistory] = createSignal<Record<string, TreeFrame[]>>({})
  // Current frame being viewed (null = latest)
  const [viewingFrame, setViewingFrame] = createSignal<number | null>(null)
  const [nodeOutputs, setNodeOutputs] = createSignal<Record<string, NodeOutput>>({})
  const [selectedNode, setSelectedNode] = createSignal<string | null>(null)
  const [isConnected, setIsConnected] = createSignal(false)
  const [events, setEvents] = createSignal<CliToTauriMessage[]>([])

  function handleMessage(msg: CliToTauriMessage) {
    // Store event for debugging
    setEvents((prev) => [...prev.slice(-100), msg]) // Keep last 100 events

    switch (msg.type) {
      case 'session:start':
        handleSessionStart(msg)
        break
      case 'session:end':
        handleSessionEnd(msg)
        break
      case 'tree:update':
        handleTreeUpdate(msg)
        break
      case 'node:output':
        handleNodeOutput(msg)
        break
      case 'execution:event':
        handleExecutionEvent(msg)
        break
    }
  }

  function handleSessionStart(msg: SessionStartMessage) {
    setSessions((prev) => ({
      ...prev,
      [msg.sessionId]: {
        id: msg.sessionId,
        agentFile: msg.agentFile,
        status: 'running',
        frame: 0,
        startTime: msg.timestamp,
      },
    }))
    setCurrentSessionId(msg.sessionId)
    setSelectedNode(null) // Reset selection for new session
  }

  function handleSessionEnd(msg: SessionEndMessage) {
    setSessions((prev) => {
      const session = prev[msg.sessionId]
      if (!session) return prev
      return {
        ...prev,
        [msg.sessionId]: {
          ...session,
          status: msg.result === 'success' ? 'completed' : 'error',
          endTime: msg.timestamp,
          output: msg.output,
          error: msg.error,
        },
      }
    })
  }

  function handleTreeUpdate(msg: TreeUpdateMessage) {
    // Add to history
    setTreeHistory((prev) => {
      const history = prev[msg.sessionId] || []
      return {
        ...prev,
        [msg.sessionId]: [...history, {
          frame: msg.frame,
          tree: msg.tree,
          timestamp: msg.timestamp,
        }],
      }
    })
    // Auto-follow latest frame
    setViewingFrame(null)
    setSessions((prev) => {
      const session = prev[msg.sessionId]
      if (!session) return prev
      return {
        ...prev,
        [msg.sessionId]: {
          ...session,
          frame: msg.frame,
        },
      }
    })
  }

  function handleNodeOutput(msg: NodeOutputMessage) {
    const key = `${msg.sessionId}:${msg.nodePath}`
    setNodeOutputs((prev) => ({
      ...prev,
      [key]: {
        path: msg.nodePath,
        type: msg.nodeType,
        output: msg.output,
        status: msg.status,
        error: msg.error,
      },
    }))
  }

  function handleExecutionEvent(msg: ExecutionEventMessage) {
    // Handle specific execution events if needed
    // For now, we mainly use tree updates for visualization
  }

  return {
    // State
    sessions,
    currentSessionId,
    treeHistory,
    nodeOutputs,
    selectedNode,
    isConnected,
    events,

    // Setters
    setSelectedNode,
    setIsConnected,

    // Derived
    currentSession: () => {
      const id = currentSessionId()
      return id ? sessions()[id] : null
    },
    tree: () => {
      const id = currentSessionId()
      if (!id) return null
      const history = treeHistory()[id]
      if (!history || history.length === 0) return null
      const frame = viewingFrame()
      if (frame === null) {
        // Show latest
        return history[history.length - 1].tree
      }
      // Find the frame
      const entry = history.find(h => h.frame === frame)
      return entry?.tree || null
    },
    frames: () => {
      const id = currentSessionId()
      if (!id) return []
      return treeHistory()[id] || []
    },
    viewingFrame,
    totalFrames: () => {
      const id = currentSessionId()
      if (!id) return 0
      return (treeHistory()[id] || []).length
    },
    getNodeOutput: (sessionId: string, nodePath: string) => {
      return nodeOutputs()[`${sessionId}:${nodePath}`]
    },

    // Actions
    setViewingFrame,
    goToFrame: (frame: number) => setViewingFrame(frame),
    goToLatest: () => setViewingFrame(null),
    goToPrevFrame: () => {
      const id = currentSessionId()
      if (!id) return
      const history = treeHistory()[id] || []
      if (history.length === 0) return
      const current = viewingFrame() ?? history[history.length - 1].frame
      const idx = history.findIndex(h => h.frame === current)
      if (idx > 0) {
        setViewingFrame(history[idx - 1].frame)
      }
    },
    goToNextFrame: () => {
      const id = currentSessionId()
      if (!id) return
      const history = treeHistory()[id] || []
      if (history.length === 0) return
      const current = viewingFrame()
      if (current === null) return // Already at latest
      const idx = history.findIndex(h => h.frame === current)
      if (idx < history.length - 1) {
        setViewingFrame(history[idx + 1].frame)
      } else {
        setViewingFrame(null) // Go to latest
      }
    },

    // Message handler
    handleMessage,
  }
}

// Create singleton store - persist across HMR by attaching to window
declare global {
  interface Window {
    __smithersStore?: ReturnType<typeof createExecutionStore>
  }
}

const store = (typeof window !== 'undefined' && window.__smithersStore)
  ? window.__smithersStore
  : createRoot(createExecutionStore)

if (typeof window !== 'undefined') {
  window.__smithersStore = store
}

export function useExecutionStore() {
  return store
}

// Initialize Tauri event listeners (Rust backend forwards WebSocket messages as events)
export function initWebSocket(): () => void {
  let unlisten: (() => void) | null = null

  async function setup() {
    try {
      // Import Tauri event listener
      const { listen } = await import('@tauri-apps/api/event')

      // Listen for all WebSocket messages forwarded by Rust backend
      unlisten = await listen<CliToTauriMessage>('ws:message', (event) => {
        console.log('Received ws:message:', event.payload)
        store.handleMessage(event.payload)
      })

      console.log('Tauri event listener initialized')
      store.setIsConnected(true)
    } catch (e) {
      console.error('Failed to setup Tauri event listener:', e)
    }
  }

  setup()

  // Return cleanup function
  return () => {
    if (unlisten) {
      unlisten()
      unlisten = null
    }
  }
}

// Send message to CLI (for control commands)
// TODO: Implement via Tauri command that sends through WebSocket
export function sendToCli(msg: object): void {
  console.log('sendToCli not yet implemented:', msg)
}
