/**
 * Header Component
 * Displays execution progress information
 */

import React from 'react'

export interface HeaderProps {
  currentFrame: number
  maxFrames: number
  elapsedTime: number
}

/**
 * Format elapsed time as seconds with one decimal place
 */
function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Header Component
 * Shows frame counter and elapsed time
 */
export function Header({ currentFrame, maxFrames, elapsedTime }: HeaderProps) {
  const frameInfo =
    maxFrames > 0 ? `Frame ${currentFrame}/${maxFrames}` : `Frame ${currentFrame}`
  const timeInfo = formatTime(elapsedTime)

  return (
    <box flexDirection="row" justifyContent="space-between" width="100%">
      <text>
        <strong>Smithers Agent Execution</strong>
      </text>
      <text>
        {frameInfo}  {timeInfo}
      </text>
    </box>
  )
}
