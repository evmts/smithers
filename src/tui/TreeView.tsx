/**
 * TreeView Component
 * Displays and navigates the SmithersNode tree
 */

import React from 'react'
import type { SmithersNode } from '../core/types.js'
import {
  getVisibleNodes,
  getNodeLabel,
  getStatusBadge,
  getStatusColor,
  getNodeIcon,
} from './tree-utils.js'

export interface TreeViewProps {
  tree: SmithersNode
  selectedPath: string | null
  expandedPaths: Set<string>
  maxHeight?: number
}

/**
 * TreeView Component
 * Renders the SmithersNode tree with expand/collapse and status indicators
 */
export function TreeView({
  tree,
  selectedPath,
  expandedPaths,
  maxHeight,
}: TreeViewProps) {
  const visibleNodes = getVisibleNodes(tree, expandedPaths)

  // Find the selected node index for scrolling
  const selectedIndex = selectedPath
    ? visibleNodes.findIndex((v) => v.path === selectedPath)
    : -1

  // Calculate scroll window if maxHeight is set
  let startIndex = 0
  let endIndex = visibleNodes.length

  if (maxHeight && visibleNodes.length > maxHeight) {
    // Keep selected node in the middle third of the visible area
    const targetPosition = Math.floor(maxHeight / 2)
    startIndex = Math.max(0, selectedIndex - targetPosition)
    endIndex = Math.min(visibleNodes.length, startIndex + maxHeight)

    // Adjust if we're near the end
    if (endIndex === visibleNodes.length) {
      startIndex = Math.max(0, visibleNodes.length - maxHeight)
    }
  }

  const visibleWindow = visibleNodes.slice(startIndex, endIndex)

  return (
    // @ts-expect-error - OpenTUI JSX element not in type definitions
    <box flexDirection="column" width="100%" height="100%">
      {visibleWindow.map(({ node, path, depth }) => {
        const isSelected = path === selectedPath
        const isExpanded = expandedPaths.has(path)
        const icon = getNodeIcon(node, isExpanded, isSelected)
        const label = getNodeLabel(node)
        const status = getStatusBadge(node)
        const statusColor = getStatusColor(status)

        // Calculate indentation (2 spaces per level)
        const indent = '  '.repeat(Math.max(0, depth - 1))

        return (
          // @ts-expect-error - OpenTUI JSX element not in type definitions
          <box
            key={path}
            flexDirection="row"
            width="100%"
            backgroundColor={isSelected ? 'blue' : undefined}
          >
            <text color={isSelected ? 'white' : undefined}>
              {indent}
              {icon} {label}
              {'  '}
              <span color={statusColor.replace('\x1b[', '').replace('m', '')}>
                {status}
              </span>
            </text>
          {/* @ts-expect-error - OpenTUI JSX element not in type definitions */}
          </box>
        )
      })}
    {/* @ts-expect-error - OpenTUI JSX element not in type definitions */}
    </box>
  )
}
