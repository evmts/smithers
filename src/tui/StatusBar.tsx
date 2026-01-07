/**
 * StatusBar Component
 * Displays keyboard shortcuts based on current view
 */

import React from 'react'
import type { TuiView } from './types.js'

export interface StatusBarProps {
  view: TuiView
}

const TREE_VIEW_SHORTCUTS =
  '↑/↓: Navigate  →: Expand  ←: Collapse  ↵: View Details  q: Quit'
const DETAIL_VIEW_SHORTCUTS = 'Esc: Back to tree  ↑/↓: Scroll  q: Quit'

/**
 * StatusBar Component
 * Shows context-appropriate keyboard shortcuts
 */
export function StatusBar({ view }: StatusBarProps) {
  const shortcuts =
    view === 'tree' ? TREE_VIEW_SHORTCUTS : DETAIL_VIEW_SHORTCUTS

  return <>{shortcuts}</>
}
