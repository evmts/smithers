/**
 * Layout Component
 * Manages overall TUI layout with header, content area, and status bar
 */

// @ts-nocheck - OpenTUI types incomplete, see https://github.com/sst/opentui/issues

import React from 'react'
import { useTerminalDimensions } from '@opentui/react'

export interface LayoutProps {
  header: React.ReactNode
  content: React.ReactNode
  statusBar: React.ReactNode
}

/**
 * Layout Component
 * Provides responsive layout structure for the TUI
 */
export function Layout({ header, content, statusBar }: LayoutProps) {
  const { width, height } = useTerminalDimensions()

  // Minimum terminal size check
  if (width < 40 || height < 10) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        justifyContent="center"
        alignItems="center"
      >
        <text color="red">Terminal too small.</text>
        <text color="yellow">Resize to at least 40x10.</text>
      </box>
    )
  }

  // Determine if we're in compact mode
  const isCompact = height < 20

  // Calculate content height (total - header - statusBar - borders)
  const contentHeight = height - 4

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box
        width="100%"
        height={1}
        borderStyle="single"
        borderBottom={true}
        padding={{ left: 1, right: 1 }}
      >
        {header}
      </box>

      {/* Content Area */}
      <box width="100%" height={contentHeight} padding={{ left: 1, right: 1 }}>
        {content}
      </box>

      {/* Status Bar */}
      {!isCompact && (
        <box
          width="100%"
          height={1}
          borderStyle="single"
          borderTop={true}
          backgroundColor="white"
          padding={{ left: 1, right: 1 }}
        >
          <text color="black">{statusBar}</text>
        </box>
      )}
    </box>
  )
}
