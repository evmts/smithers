/**
 * TUI State Management Types
 */

export type TuiView = 'tree' | 'detail'

export interface TuiState {
  // View state
  view: TuiView
  selectedNodePath: string | null // e.g., "ROOT/phase[0]/claude[1]"
  expandedPaths: Set<string> // Set of expanded node paths

  // Detail view state
  detailNodePath: string | null // Which node is shown in detail view
  detailScrollOffset: number // Scroll position in detail view
  autoScroll: boolean // Whether to auto-scroll during streaming

  // Execution tracking
  currentFrame: number
  maxFrames: number
  startTime: number

  // Help overlay
  showHelp: boolean
}

// Note: KeyEvent type is provided by @opentui/core
// We don't define it here to avoid conflicts
