/**
 * AgentPanel Component
 * Displays detailed information about a Claude/ClaudeApi node
 */

import React from 'react'
import type { SmithersNode } from '../core/types.js'
import { serialize } from '../core/render.js'

export interface AgentPanelProps {
  node: SmithersNode
  scrollOffset: number
}

/**
 * Extract prompt text from node children
 */
function extractPrompt(node: SmithersNode): string {
  // Serialize children to get prompt text
  const childrenText = node.children
    .map((child) => {
      if (child.type === 'TEXT') {
        return String(child.props.value || '')
      }
      return serialize(child)
    })
    .join('\n')

  return childrenText || '(no prompt)'
}

/**
 * Extract output from execution result
 */
function extractOutput(node: SmithersNode): string {
  if (!node._execution) {
    return '(not executed yet)'
  }

  if (node._execution.status === 'pending') {
    return '(pending execution)'
  }

  if (node._execution.status === 'running') {
    return '(execution in progress...)'
  }

  if (node._execution.status === 'error') {
    const error = node._execution.error
    return `Error: ${error?.message || 'Unknown error'}\n\n${error?.stack || ''}`
  }

  if (node._execution.status === 'complete') {
    const result = node._execution.result
    if (typeof result === 'string') {
      return result
    }
    if (result && typeof result === 'object') {
      return JSON.stringify(result, null, 2)
    }
    return String(result || '(no output)')
  }

  return '(unknown status)'
}

/**
 * Apply scroll offset to text content
 * Shows lines from scrollOffset onwards
 */
function applyScrollOffset(text: string, offset: number): string {
  if (offset === 0) return text
  const lines = text.split('\n')
  return lines.slice(offset).join('\n')
}

/**
 * AgentPanel Component
 * Shows prompt and output for an agent node
 */
export function AgentPanel({ node, scrollOffset }: AgentPanelProps) {
  const prompt = extractPrompt(node)
  const output = extractOutput(node)
  const status = node._execution?.status || 'pending'

  // Apply scroll offset to output (most commonly scrolled)
  const scrolledOutput = applyScrollOffset(output, scrollOffset)

  // Get status color
  let statusColor = 'gray'
  switch (status) {
    case 'running':
      statusColor = 'yellow'
      break
    case 'complete':
      statusColor = 'green'
      break
    case 'error':
      statusColor = 'red'
      break
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Title */}
      <box width="100%" marginBottom={1}>
        <text>
          <strong>Agent Details:</strong> {node.type}
          {'  '}
          <span color={statusColor}>[{status}]</span>
        </text>
      </box>

      {/* Prompt Section */}
      <box
        flexDirection="column"
        width="100%"
        height="40%"
        borderStyle="single"
        padding={{ left: 1, right: 1 }}
        marginBottom={1}
      >
        <text color="cyan">
          <strong>Prompt:</strong>
        </text>
        <scrollbox height="100%">
          <text>{prompt}</text>
        </scrollbox>
      </box>

      {/* Output Section */}
      <box
        flexDirection="column"
        width="100%"
        height="50%"
        borderStyle="single"
        padding={{ left: 1, right: 1 }}
      >
        <text color="cyan">
          <strong>Output:</strong>
        </text>
        <scrollbox height="100%">
          <text>{scrolledOutput}</text>
        </scrollbox>
      </box>
    </box>
  )
}
