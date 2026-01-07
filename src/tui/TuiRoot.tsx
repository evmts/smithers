/**
 * TuiRoot Component
 * Main TUI application that orchestrates all components
 */

// OpenTUI JSX elements (box, scrollbox, text) are not in TypeScript definitions
// Using targeted @ts-expect-error comments on specific JSX usage lines

import React, { useState, useEffect } from 'react'
import { useKeyboard } from '@opentui/react'
import type { SmithersNode } from '../core/types.js'
import type { TuiView } from './types.js'
import { Layout } from './Layout.js'
import { Header } from './Header.js'
import { StatusBar } from './StatusBar.js'
import { TreeView } from './TreeView.js'
import { AgentPanel } from './AgentPanel.js'
import {
  getNextVisibleNode,
  getPrevVisibleNode,
  hasChildren,
  findNodeByPath,
} from './tree-utils.js'

export interface TuiRootProps {
  tree: SmithersNode
  frame?: number
  maxFrames?: number
  startTime?: number
  onQuit?: () => void
}

/**
 * TuiRoot Component
 * Main TUI application component
 */
export function TuiRoot({
  tree,
  frame = 1,
  maxFrames = 0,
  startTime = Date.now(),
  onQuit,
}: TuiRootProps) {
  // View state
  const [view, setView] = useState<TuiView>('tree')
  const [selectedPath, setSelectedPath] = useState<string>('ROOT')
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(['ROOT'])
  )
  const [detailScrollOffset, setDetailScrollOffset] = useState(0)

  // Calculate elapsed time
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(Date.now() - startTime)
    }, 100)

    return () => clearInterval(timer)
  }, [startTime])

  // Keyboard navigation
  useKeyboard((key) => {
    // Global quit
    if (key.name === 'q') {
      onQuit?.()
      return
    }

    // Tree view navigation
    if (view === 'tree') {
      if (key.name === 'down' || key.name === 'j') {
        const next = getNextVisibleNode(tree, selectedPath, expandedPaths)
        if (next) {
          setSelectedPath(next)
        }
      } else if (key.name === 'up' || key.name === 'k') {
        const prev = getPrevVisibleNode(tree, selectedPath, expandedPaths)
        if (prev) {
          setSelectedPath(prev)
        }
      } else if (key.name === 'right' || key.name === 'l') {
        // Expand selected node
        const node = findNodeByPath(tree, selectedPath)
        if (node && hasChildren(node)) {
          setExpandedPaths(new Set([...expandedPaths, selectedPath]))
        }
      } else if (key.name === 'left' || key.name === 'h') {
        // Collapse selected node
        setExpandedPaths((prev) => {
          const next = new Set(prev)
          next.delete(selectedPath)
          return next
        })
      } else if (key.name === 'return') {
        // View details (only for claude/claude-api nodes)
        const node = findNodeByPath(tree, selectedPath)
        if (node && (node.type === 'claude' || node.type === 'claude-api')) {
          setView('detail')
          setDetailScrollOffset(0)
        }
      } else if (key.name === 'space') {
        // Toggle expand/collapse
        const node = findNodeByPath(tree, selectedPath)
        if (node && hasChildren(node)) {
          if (expandedPaths.has(selectedPath)) {
            setExpandedPaths((prev) => {
              const next = new Set(prev)
              next.delete(selectedPath)
              return next
            })
          } else {
            setExpandedPaths(new Set([...expandedPaths, selectedPath]))
          }
        }
      }
    }

    // Detail view navigation
    if (view === 'detail') {
      if (key.name === 'escape' || key.name === 'backspace') {
        setView('tree')
      } else if (key.name === 'down' || key.name === 'j') {
        setDetailScrollOffset((prev) => prev + 1)
      } else if (key.name === 'up' || key.name === 'k') {
        setDetailScrollOffset((prev) => Math.max(0, prev - 1))
      }
    }
  })

  // Render content based on view
  // Check if selected node still exists before showing detail view
  const selectedNode = view === 'detail' ? findNodeByPath(tree, selectedPath) : null
  const shouldShowDetail = view === 'detail' && selectedNode !== null

  // If we were in detail view but node disappeared, fall back to tree view
  // Use useEffect to avoid side effects during render
  useEffect(() => {
    if (view === 'detail' && !selectedNode) {
      setView('tree')
    }
  }, [view, selectedNode])

  const content = shouldShowDetail ? (
    <AgentPanel node={selectedNode!} scrollOffset={detailScrollOffset} />
  ) : (
    <TreeView tree={tree} selectedPath={selectedPath} expandedPaths={expandedPaths} />
  )

  return (
    <Layout
      header={
        <Header
          currentFrame={frame}
          maxFrames={maxFrames}
          elapsedTime={elapsedTime}
        />
      }
      content={content}
      statusBar={<StatusBar view={view} />}
    />
  )
}
