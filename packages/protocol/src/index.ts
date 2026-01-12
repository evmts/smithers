/**
 * @evmts/smithers-protocol
 *
 * WebSocket protocol types for communication between
 * Smithers CLI and the Tauri desktop app.
 */

export * from './messages.js'

// Re-export relevant types from core smithers package
export type {
  SmithersDebugEvent,
  SmithersNodeSnapshot,
  ExecutionStatus,
  DebugSummary,
} from '@evmts/smithers'
