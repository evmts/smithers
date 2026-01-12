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
import { WS_PORT } from '@evmts/smithers-protocol'

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

// Create reactive store using Solid's primitives
function createExecutionStore() {
  const [sessions, setSessions] = createSignal<Record<string, Session>>({})
  const [currentSessionId, setCurrentSessionId] = createSignal<string | null>(null)
  const [trees, setTrees] = createSignal<Record<string, SmithersNodeSnapshot>>({})
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
    setTrees((prev) => ({
      ...prev,
      [msg.sessionId]: msg.tree,
    }))
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
    trees,
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
      return id ? trees()[id] : null
    },
    getNodeOutput: (sessionId: string, nodePath: string) => {
      return nodeOutputs()[`${sessionId}:${nodePath}`]
    },

    // Message handler
    handleMessage,
  }
}

// Create singleton store
const store = createRoot(createExecutionStore)

export function useExecutionStore() {
  return store
}

// WebSocket initialization
let ws: WebSocket | null = null

export function initWebSocket(): () => void {
  const wsUrl = `ws://127.0.0.1:${WS_PORT}`

  function connect() {
    try {
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('WebSocket connected')
        store.setIsConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as CliToTauriMessage
          store.handleMessage(msg)
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e)
        }
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
        store.setIsConnected(false)
        // Attempt to reconnect after 2 seconds
        setTimeout(connect, 2000)
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    } catch (e) {
      console.error('Failed to create WebSocket:', e)
      // Attempt to reconnect after 2 seconds
      setTimeout(connect, 2000)
    }
  }

  connect()

  // Return cleanup function
  return () => {
    if (ws) {
      ws.close()
      ws = null
    }
  }
}

// Send message to CLI (for control commands)
export function sendToCli(msg: object): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}
