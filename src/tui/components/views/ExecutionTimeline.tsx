// Execution Timeline View (F1)
// Real-time view of phases, agents, and tool calls

import { useKeyboard } from '@opentui/react'
import type { SmithersDB } from '../../../db/index.js'
import { TextAttributes, type KeyEvent } from '@opentui/core'
import { usePollEvents } from '../../hooks/usePollEvents.js'
import { getStatusColor, colors } from '../../utils/colors.js'
import { formatTime } from '../../utils/format.js'
import { useEffectOnValueChange } from '../../../reconciler/hooks.js'
import { useTuiState } from '../../state.js'

export interface ExecutionTimelineProps {
  db: SmithersDB
  height: number
}

export function ExecutionTimeline({ db, height }: ExecutionTimelineProps) {
  const events = usePollEvents(db)
  const [selectedIndex, setSelectedIndex] = useTuiState<number>('tui:timeline:selectedIndex', 0)
  const [scrollOffset, setScrollOffset] = useTuiState<number>('tui:timeline:scrollOffset', 0)

  const visibleHeight = height - 4
  const clampKey = `${events.length}:${visibleHeight}`

  useEffectOnValueChange(clampKey, () => {
    const maxIndex = Math.max(0, events.length - 1)
    if (selectedIndex > maxIndex) {
      setSelectedIndex(maxIndex)
    }
    const maxOffset = Math.max(0, events.length - visibleHeight)
    if (scrollOffset > maxOffset) {
      setScrollOffset(maxOffset)
    }
  }, [events.length, visibleHeight, selectedIndex, scrollOffset, setSelectedIndex, setScrollOffset])

  useKeyboard((key: KeyEvent) => {
    if (key.name === 'j' || key.name === 'down') {
      const newIndex = Math.min(selectedIndex + 1, Math.max(0, events.length - 1))
      setSelectedIndex(newIndex)
      if (newIndex >= scrollOffset + visibleHeight) {
        setScrollOffset(newIndex - visibleHeight + 1)
      }
    } else if (key.name === 'k' || key.name === 'up') {
      const newIndex = Math.max(selectedIndex - 1, 0)
      setSelectedIndex(newIndex)
      if (newIndex < scrollOffset) {
        setScrollOffset(newIndex)
      }
    } else if (key.name === 'g') {
      setSelectedIndex(0)
      setScrollOffset(0)
    } else if (key.name === 'G' || (key.shift && key.name === 'g')) {
      setSelectedIndex(Math.max(0, events.length - 1))
      setScrollOffset(Math.max(0, events.length - visibleHeight))
    }
  })

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
    case 'phase': return colors.purple
    case 'agent': return colors.blue
    case 'tool': return colors.cyan
  }
}
