/**
 * Tauri Bridge - WebSocket client for CLI to Tauri desktop app communication
 */

import WebSocket from 'ws'
import type {
  SessionStartMessage,
  SessionEndMessage,
  ExecutionEventMessage,
  TreeUpdateMessage,
  NodeOutputMessage,
  LogMessage,
  TauriToCliMessage,
  WebSocketMessage,
} from '@evmts/smithers-protocol'
import { WS_URL, parseMessage } from '@evmts/smithers-protocol'
import type { SmithersDebugEvent, SmithersNodeSnapshot } from '@evmts/smithers'

const CONNECT_TIMEOUT = 1000 // 1 second timeout for initial connection

type MessageHandler = (msg: TauriToCliMessage) => void

export class TauriBridge {
  private ws: WebSocket | null = null
  private _isConnected = false
  private messageHandlers: Map<string, MessageHandler> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3

  get isConnected(): boolean {
    return this._isConnected
  }

  /**
   * Attempt to connect to the Tauri WebSocket server
   * Returns true if connection successful, false otherwise
   */
  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.ws) {
          this.ws.close()
          this.ws = null
        }
        resolve(false)
      }, CONNECT_TIMEOUT)

      try {
        this.ws = new WebSocket(WS_URL)

        this.ws.on('open', () => {
          clearTimeout(timeout)
          this._isConnected = true
          this.reconnectAttempts = 0
          resolve(true)
        })

        this.ws.on('message', (data: Buffer) => {
          try {
            const msg = parseMessage(data.toString()) as TauriToCliMessage
            this.handleMessage(msg)
          } catch {
            // Ignore parse errors
          }
        })

        this.ws.on('close', () => {
          this._isConnected = false
          this.ws = null
        })

        this.ws.on('error', () => {
          clearTimeout(timeout)
          this._isConnected = false
          this.ws = null
          resolve(false)
        })
      } catch {
        clearTimeout(timeout)
        resolve(false)
      }
    })
  }

  /**
   * Disconnect from the Tauri server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this._isConnected = false
    this.messageHandlers.clear()
  }

  /**
   * Register a handler for specific message types
   */
  onMessage(type: string, handler: MessageHandler): void {
    this.messageHandlers.set(type, handler)
  }

  /**
   * Remove a message handler
   */
  offMessage(type: string): void {
    this.messageHandlers.delete(type)
  }

  private handleMessage(msg: TauriToCliMessage): void {
    const handler = this.messageHandlers.get(msg.type)
    if (handler) {
      handler(msg)
    }
  }

  private send(msg: WebSocketMessage): void {
    if (this.ws && this._isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  // ============================================
  // Session Messages
  // ============================================

  /**
   * Notify Tauri that a new execution session has started
   */
  sendSessionStart(
    sessionId: string,
    agentFile: string,
    options: {
      maxFrames: number
      timeout: number
      mockMode: boolean
      model?: string
    }
  ): void {
    const msg: SessionStartMessage = {
      type: 'session:start',
      sessionId,
      agentFile,
      options,
      timestamp: Date.now(),
    }
    this.send(msg)
  }

  /**
   * Notify Tauri that execution has completed
   */
  sendSessionEnd(
    sessionId: string,
    result: 'success' | 'error' | 'cancelled',
    output?: unknown,
    totalFrames: number = 0,
    totalDuration: number = 0,
    error?: string
  ): void {
    const msg: SessionEndMessage = {
      type: 'session:end',
      sessionId,
      result,
      output,
      error,
      totalFrames,
      totalDuration,
      timestamp: Date.now(),
    }
    this.send(msg)
  }

  // ============================================
  // Execution Messages
  // ============================================

  /**
   * Forward a debug event to Tauri
   */
  sendExecutionEvent(sessionId: string, event: SmithersDebugEvent): void {
    const msg: ExecutionEventMessage = {
      type: 'execution:event',
      sessionId,
      event,
    }
    this.send(msg)
  }

  /**
   * Send updated tree state to Tauri
   */
  sendTreeUpdate(sessionId: string, tree: SmithersNodeSnapshot, frame: number): void {
    const msg: TreeUpdateMessage = {
      type: 'tree:update',
      sessionId,
      tree,
      frame,
      timestamp: Date.now(),
    }
    this.send(msg)
  }

  /**
   * Send node output (agent response) to Tauri
   */
  sendNodeOutput(
    sessionId: string,
    nodePath: string,
    nodeType: string,
    output: string,
    status: 'running' | 'complete' | 'error',
    error?: string
  ): void {
    const msg: NodeOutputMessage = {
      type: 'node:output',
      sessionId,
      nodePath,
      nodeType,
      output,
      status,
      error,
      timestamp: Date.now(),
    }
    this.send(msg)
  }

  // ============================================
  // Logging Messages
  // ============================================

  /**
   * Send a log message to Tauri
   */
  sendLog(
    sessionId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: unknown
  ): void {
    const msg: LogMessage = {
      type: 'log',
      sessionId,
      level,
      message,
      data,
      timestamp: Date.now(),
    }
    this.send(msg)
  }
}

/**
 * Singleton instance for global access
 */
let globalBridge: TauriBridge | null = null

export function getTauriBridge(): TauriBridge {
  if (!globalBridge) {
    globalBridge = new TauriBridge()
  }
  return globalBridge
}

export function resetTauriBridge(): void {
  if (globalBridge) {
    globalBridge.disconnect()
    globalBridge = null
  }
}
