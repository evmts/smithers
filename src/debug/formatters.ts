import type { DebugSummary, PluNodeSnapshot, SmithersDebugEvent } from './types.js'

/**
 * Format events as a compact summary for test assertions
 *
 * This is the primary programmatic output format, returning an object
 * that can be easily asserted against in tests.
 */
export function formatAsCompact(events: SmithersDebugEvent[]): DebugSummary {
  const executedNodes: string[] = []
  const callbacksInvoked: string[] = []
  let stateChanges = 0
  let terminationReason: string | null = null
  let maxFrame = 0

  for (const event of events) {
    maxFrame = Math.max(maxFrame, event.frameNumber)

    switch (event.type) {
      case 'node:execute:end':
        executedNodes.push(`${event.nodeType}@${event.nodePath}`)
        break
      case 'callback:invoked':
        callbacksInvoked.push(event.callbackName)
        break
      case 'state:change':
        stateChanges++
        break
      case 'loop:terminated':
        terminationReason = event.reason
        break
    }
  }

  return {
    frameCount: maxFrame,
    executedNodes,
    callbacksInvoked,
    stateChanges,
    terminationReason,
  }
}

/**
 * Format events as JSON for programmatic consumption
 */
export function formatAsJson(events: SmithersDebugEvent[]): string {
  return JSON.stringify(events, null, 2)
}

/**
 * Format events as pretty terminal output
 */
export function formatAsPrettyTerminal(events: SmithersDebugEvent[]): string {
  const lines: string[] = []
  let currentFrame = -1

  for (const event of events) {
    // Frame separator
    if (event.frameNumber !== currentFrame) {
      currentFrame = event.frameNumber
      lines.push('')
      lines.push(`=== Frame ${currentFrame} ===`)
    }

    // Format based on event type
    switch (event.type) {
      case 'frame:start':
        lines.push(`[FRAME] Starting frame ${event.frameNumber}`)
        break
      case 'frame:end':
        lines.push(
          `[FRAME] Completed in ${event.duration}ms (state changed: ${event.stateChanged}, executed: ${event.executedNodes.join(', ') || 'none'})`
        )
        break
      case 'frame:render':
        lines.push(`[RENDER] Tree rendered`)
        break
      case 'node:found':
        lines.push(`  [FOUND] ${event.nodeType} at ${event.nodePath} (${event.status})`)
        break
      case 'node:execute:start':
        lines.push(`  [EXEC] Starting ${event.nodeType} at ${event.nodePath}`)
        break
      case 'node:execute:end': {
        const status = event.status === 'complete' ? 'OK' : 'ERROR'
        lines.push(`  [EXEC] ${status} in ${event.duration}ms`)
        if (event.error) {
          lines.push(`         Error: ${event.error}`)
        }
        break
      }
      case 'callback:invoked':
        lines.push(`  [CALLBACK] ${event.callbackName} called`)
        break
      case 'state:change':
        lines.push(`  [STATE] Changed via ${event.source}${event.callbackName ? ` (${event.callbackName})` : ''}`)
        break
      case 'control:stop':
        lines.push(`[CONTROL] Stop node detected${event.reason ? `: ${event.reason}` : ''}`)
        break
      case 'control:human': {
        const approvalStatus =
          event.approved === undefined ? 'WAITING' : event.approved ? 'APPROVED' : 'REJECTED'
        lines.push(`[CONTROL] Human: ${approvalStatus} - ${event.message}`)
        break
      }
      case 'loop:terminated':
        lines.push(`[LOOP] Terminated: ${event.reason}`)
        break
    }
  }

  return lines.join('\n')
}

/**
 * Format tree snapshot as ASCII tree visualization
 */
export function formatTreeAsAscii(
  snapshot: PluNodeSnapshot,
  prefix: string = '',
  isLast: boolean = true
): string {
  const statusIcon: Record<string, string> = {
    pending: '[ ]',
    running: '[~]',
    complete: '[x]',
    error: '[!]',
  }

  const icon = snapshot.executionStatus ? statusIcon[snapshot.executionStatus] : '   '
  const connector = prefix === '' ? '' : isLast ? '\\-- ' : '|-- '

  // Format props (exclude empty objects)
  const propsEntries = Object.entries(snapshot.props)
  const propsStr =
    propsEntries.length > 0
      ? ` (${propsEntries.map(([k, v]) => `${k}=${formatValue(v)}`).join(', ')})`
      : ''

  // Build the line
  let result = `${prefix}${connector}${icon} ${snapshot.type}${propsStr}\n`

  // Process children
  const childPrefix = prefix + (prefix === '' ? '' : isLast ? '    ' : '|   ')
  for (let i = 0; i < snapshot.children.length; i++) {
    const child = snapshot.children[i]
    const childIsLast = i === snapshot.children.length - 1
    result += formatTreeAsAscii(child, childPrefix, childIsLast)
  }

  return result
}

/**
 * Format a value for display in props
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') {
    return value.length > 30 ? `"${value.substring(0, 30)}..."` : `"${value}"`
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`
  }
  if (typeof value === 'object') {
    return '{...}'
  }
  return String(value)
}

/**
 * Format events grouped by frame
 */
export function formatByFrame(
  events: SmithersDebugEvent[]
): Map<number, SmithersDebugEvent[]> {
  const byFrame = new Map<number, SmithersDebugEvent[]>()

  for (const event of events) {
    const frameEvents = byFrame.get(event.frameNumber) ?? []
    frameEvents.push(event)
    byFrame.set(event.frameNumber, frameEvents)
  }

  return byFrame
}
