// Execution Timeline View (F1)
// Real-time view of phases, agents, and tool calls

import { useState, useEffect } from 'react'
import { useKeyboard } from '@opentui/react'
import type { SmithersDB } from '../../../db/index.js'
import { TextAttributes, type KeyEvent } from '@opentui/core'

interface TimelineEvent {
  id: string
  type: 'phase' | 'agent' | 'tool'
  name: string
  status: string
  timestamp: string
  details?: string | undefined
}

export interface ExecutionTimelineProps {
  db: SmithersDB
  height: number
}

export function ExecutionTimeline({ db, height }: ExecutionTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)

  // Poll for updates
  useEffect(() => {
    const pollEvents = () => {
      try {
        const execution = db.execution.current()
        if (!execution) {
          setEvents([])
          return
        }

        const phases = db.query<{ id: string; name: string; status: string; created_at: string }>(
          'SELECT id, name, status, created_at as timestamp FROM phases WHERE execution_id = ? ORDER BY created_at DESC LIMIT 20',
          [execution.id]
        )

        const agents = db.query<{ id: string; model: string; status: string; created_at: string; tokens_input: number | null; tokens_output: number | null }>(
          'SELECT id, model, status, created_at as timestamp, tokens_input, tokens_output FROM agents WHERE execution_id = ? ORDER BY created_at DESC LIMIT 30',
          [execution.id]
        )

        const tools = db.query<{ id: string; tool_name: string; status: string; created_at: string; duration_ms: number | null }>(
          'SELECT id, tool_name, status, created_at as timestamp, duration_ms FROM tool_calls WHERE execution_id = ? ORDER BY created_at DESC LIMIT 50',
          [execution.id]
        )

        const allEvents: TimelineEvent[] = [
          ...phases.map((p) => ({
            id: p.id,
            type: 'phase' as const,
            name: p.name,
            status: p.status,
            timestamp: p.created_at
          })),
          ...agents.map((a) => ({
            id: a.id,
            type: 'agent' as const,
            name: a.model,
            status: a.status,
            timestamp: a.created_at,
            details: `${a.tokens_input ?? 0}/${a.tokens_output ?? 0} tokens`
          })),
          ...tools.map((t) => ({
            id: t.id,
            type: 'tool' as const,
            name: t.tool_name,
            status: t.status,
            timestamp: t.created_at,
            details: t.duration_ms ? `${t.duration_ms}ms` : undefined
          }))
        ]

        // Sort by timestamp descending
        allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

        setEvents(allEvents)
      } catch {
        // Ignore errors
      }
    }

    pollEvents()
    const interval = setInterval(pollEvents, 500)
    return () => clearInterval(interval)
  }, [db])

  // Handle keyboard navigation
  useKeyboard((key: KeyEvent) => {
    if (key.name === 'j' || key.name === 'down') {
      setSelectedIndex(prev => Math.min(prev + 1, events.length - 1))
    } else if (key.name === 'k' || key.name === 'up') {
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (key.name === 'g') {
      setSelectedIndex(0)
      setScrollOffset(0)
    } else if (key.name === 'G' || (key.shift && key.name === 'g')) {
      setSelectedIndex(events.length - 1)
    }
  })

  // Adjust scroll offset based on selection
  const visibleHeight = height - 4
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex)
    } else if (selectedIndex >= scrollOffset + visibleHeight) {
      setScrollOffset(selectedIndex - visibleHeight + 1)
    }
  }, [selectedIndex, scrollOffset, visibleHeight])

  const visibleEvents = events.slice(scrollOffset, scrollOffset + visibleHeight)

  if (events.length === 0) {
    return (
      <box style={{ flexDirection: 'column' }}>
        <text
          content="No execution events yet"
          style={{ fg: '#565f89', marginBottom: 1 }}
        />
        <text
          content="Start a Smithers execution to see live updates"
          style={{ fg: '#414868' }}
        />
      </box>
    )
  }

  return (
    <box style={{ flexDirection: 'column', width: '100%' }}>
      <text
        content={`Timeline (${events.length} events) - j/k to navigate, g/G for first/last`}
        style={{ fg: '#7aa2f7', marginBottom: 1, attributes: TextAttributes.BOLD }}
      />
      <scrollbox style={{ flexGrow: 1 }} focused>
        {visibleEvents.map((event, index) => {
          const actualIndex = scrollOffset + index
          const isSelected = actualIndex === selectedIndex
          const typeIcon = getTypeIcon(event.type)
          const statusColor = getStatusColor(event.status)
          const timeStr = formatTime(event.timestamp)

          return (
            <box
              key={event.id}
              style={{
                flexDirection: 'row',
                width: '100%',
                backgroundColor: isSelected ? '#24283b' : undefined,
                paddingLeft: 1,
                paddingRight: 1
              }}
            >
              <text content={typeIcon} style={{ fg: getTypeColor(event.type), width: 3 }} />
              <text content={event.name} style={{ fg: '#c0caf5', width: 20 }} />
              <text content={`[${event.status}]`} style={{ fg: statusColor, width: 12 }} />
              <text content={timeStr} style={{ fg: '#565f89', width: 12 }} />
              {event.details && (
                <text content={event.details} style={{ fg: '#7dcfff' }} />
              )}
            </box>
          )
        })}
      </scrollbox>
    </box>
  )
}

function getTypeIcon(type: 'phase' | 'agent' | 'tool'): string {
  switch (type) {
    case 'phase': return '>'
    case 'agent': return '@'
    case 'tool': return '#'
  }
}

function getTypeColor(type: 'phase' | 'agent' | 'tool'): string {
  switch (type) {
    case 'phase': return '#bb9af7'
    case 'agent': return '#7aa2f7'
    case 'tool': return '#7dcfff'
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'running': return '#9ece6a'
    case 'completed': return '#73daca'
    case 'failed': return '#f7768e'
    case 'pending': return '#e0af68'
    default: return '#565f89'
  }
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  } catch {
    return '--:--:--'
  }
}
