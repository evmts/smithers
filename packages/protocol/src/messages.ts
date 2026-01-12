import type { SmithersDebugEvent, SmithersNodeSnapshot } from '@evmts/smithers'

// ============================================
// CLI -> Tauri Messages (CLI sends to Tauri)
// ============================================

/**
 * Session start - sent when CLI begins executing an agent
 */
export interface SessionStartMessage {
  type: 'session:start'
  sessionId: string
  agentFile: string
  options: {
    maxFrames: number
    timeout: number
    mockMode: boolean
    model?: string
  }
  timestamp: number
}

/**
 * Session end - sent when execution completes
 */
export interface SessionEndMessage {
  type: 'session:end'
  sessionId: string
  result: 'success' | 'error' | 'cancelled'
  output?: unknown
  error?: string
  totalFrames: number
  totalDuration: number
  timestamp: number
}

/**
 * Execution event - wraps debug events for IPC
 */
export interface ExecutionEventMessage {
  type: 'execution:event'
  sessionId: string
  event: SmithersDebugEvent
}

/**
 * Tree update - sent on each frame with current tree state
 */
export interface TreeUpdateMessage {
  type: 'tree:update'
  sessionId: string
  tree: SmithersNodeSnapshot
  frame: number
  timestamp: number
}

/**
 * Plan update - sent with serialized XML plan
 */
export interface PlanUpdateMessage {
  type: 'plan:update'
  sessionId: string
  planXml: string
  frame: number
  timestamp: number
}

/**
 * Node output - streaming output from agent nodes
 */
export interface NodeOutputMessage {
  type: 'node:output'
  sessionId: string
  nodePath: string
  nodeType: string
  output: string
  status: 'running' | 'complete' | 'error'
  error?: string
  timestamp: number
}

/**
 * Log message - general logging from CLI
 */
export interface LogMessage {
  type: 'log'
  sessionId: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  data?: unknown
  timestamp: number
}

// ============================================
// Tauri -> CLI Messages (Tauri sends to CLI)
// ============================================

/**
 * Connection acknowledgment from Tauri server
 */
export interface ConnectedMessage {
  type: 'connected'
  serverVersion: string
  timestamp: number
}

/**
 * User requested pause from desktop app
 */
export interface PauseRequestMessage {
  type: 'control:pause'
  sessionId: string
  timestamp: number
}

/**
 * User requested resume from desktop app
 */
export interface ResumeRequestMessage {
  type: 'control:resume'
  sessionId: string
  timestamp: number
}

/**
 * User requested abort from desktop app
 */
export interface AbortRequestMessage {
  type: 'control:abort'
  sessionId: string
  reason?: string
  timestamp: number
}

/**
 * User requested skip node from desktop app
 */
export interface SkipRequestMessage {
  type: 'control:skip'
  sessionId: string
  nodePath?: string
  timestamp: number
}

/**
 * Human approval response from desktop app
 */
export interface HumanResponseMessage {
  type: 'human:response'
  sessionId: string
  nodePath: string
  approved: boolean
  values?: Record<string, unknown>
  timestamp: number
}

// ============================================
// Union Types
// ============================================

/**
 * All message types sent from CLI to Tauri
 */
export type CliToTauriMessage =
  | SessionStartMessage
  | SessionEndMessage
  | ExecutionEventMessage
  | TreeUpdateMessage
  | PlanUpdateMessage
  | NodeOutputMessage
  | LogMessage

/**
 * All message types sent from Tauri to CLI
 */
export type TauriToCliMessage =
  | ConnectedMessage
  | PauseRequestMessage
  | ResumeRequestMessage
  | AbortRequestMessage
  | SkipRequestMessage
  | HumanResponseMessage

/**
 * All WebSocket message types
 */
export type WebSocketMessage = CliToTauriMessage | TauriToCliMessage

// ============================================
// Utilities
// ============================================

/**
 * Serialize a message to JSON string
 */
export function serializeMessage(msg: WebSocketMessage): string {
  return JSON.stringify(msg)
}

/**
 * Parse a JSON string to a message
 */
export function parseMessage(data: string): WebSocketMessage {
  return JSON.parse(data) as WebSocketMessage
}

/**
 * Type guard for CLI to Tauri messages
 */
export function isCliToTauriMessage(msg: WebSocketMessage): msg is CliToTauriMessage {
  return [
    'session:start',
    'session:end',
    'execution:event',
    'tree:update',
    'plan:update',
    'node:output',
    'log',
  ].includes(msg.type)
}

/**
 * Type guard for Tauri to CLI messages
 */
export function isTauriToCliMessage(msg: WebSocketMessage): msg is TauriToCliMessage {
  return [
    'connected',
    'control:pause',
    'control:resume',
    'control:abort',
    'control:skip',
    'human:response',
  ].includes(msg.type)
}

/**
 * WebSocket server port used by Tauri
 */
export const WS_PORT = 9876

/**
 * WebSocket URL for connecting to Tauri
 */
export const WS_URL = `ws://127.0.0.1:${WS_PORT}`
