/**
 * Layout Component
 * Manages overall TUI layout with header, content area, and status bar
 */

/// <reference path="./opentui.d.ts" />

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
      // @ts-expect-error - OpenTUI JSX element not in type definitions
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        justifyContent="center"
        alignItems="center"
      >
        <text color="red">Terminal too small.</text>
        <text color="yellow">Resize to at least 40x10.</text>
        {/* @ts-expect-error - OpenTUI JSX element not in type definitions */}
      </box>
    )
  }

  // Determine if we're in compact mode
  const isCompact = height < 20

  // Calculate content height (total - header - statusBar - borders)
  const contentHeight = height - 4

  return (
    // @ts-expect-error - OpenTUI JSX element not in type definitions
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      {/* @ts-expect-error - OpenTUI JSX element not in type definitions */}
      <box
        width="100%"
        height={1}
        borderStyle="single"
        borderBottom={true}
        padding={{ left: 1, right: 1 }}
      >
        {header}
      {/* @ts-expect-error - OpenTUI JSX element not in type definitions */}
      </box>

      {/* Content Area */}
      {/* @ts-expect-error - OpenTUI JSX element not in type definitions */}
      <box width="100%" height={contentHeight} padding={{ left: 1, right: 1 }}>
        {content}
      {/* @ts-expect-error - OpenTUI JSX element not in type definitions */}
      </box>

      {/* Status Bar */}
      {!isCompact && (
        // @ts-expect-error - OpenTUI JSX element not in type definitions
        <box
          width="100%"
          height={1}
          borderStyle="single"
          borderTop={true}
          backgroundColor="white"
          padding={{ left: 1, right: 1 }}
        >
          <text color="black">{statusBar}</text>
        {/* @ts-expect-error - OpenTUI JSX element not in type definitions */}
        </box>
      )}
    {/* @ts-expect-error - OpenTUI JSX element not in type definitions */}
    </box>
  )
}
