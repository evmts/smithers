/**
 * Tests for src/tui/components/views/ExecutionTimeline.tsx
 * Timeline visualization of execution events (phases, agents, tools)
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { ExecutionTimeline, type ExecutionTimelineProps } from './ExecutionTimeline.js'
import { createTuiTestContext, cleanupTuiTestContext, waitForEffects, type TuiTestContext } from '../../test-utils.js'
import { getStatusColor, colors } from '../../utils/colors.js'
import { formatTime } from '../../utils/format.js'
import { TextAttributes } from '@opentui/core'

describe('tui/components/views/ExecutionTimeline', () => {
  let ctx: TuiTestContext

  beforeEach(() => {
    ctx = createTuiTestContext()
  })

  afterEach(() => {
    cleanupTuiTestContext(ctx)
  })

  // Helper to create props
  function createProps(overrides: Partial<ExecutionTimelineProps> = {}): ExecutionTimelineProps {
    return {
      db: ctx.db,
      height: 20,
      ...overrides
    }
  }

  describe('empty state', () => {
    test('renders empty state when no events exist', async () => {
      // Complete execution so no current execution exists
      ctx.db.execution.complete(ctx.executionId)

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      expect(element).toBeDefined()
      expect(element!.props.children[0].props.content).toBe('No execution events yet')
      expect(element!.props.children[1].props.content).toBe('Start a Smithers execution to see live updates')
    })

    test('empty state uses correct colors', async () => {
      ctx.db.execution.complete(ctx.executionId)

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      expect(element!.props.children[0].props.style.fg).toBe('#565f89')
      expect(element!.props.children[1].props.style.fg).toBe('#414868')
    })
  })

  describe('timeline header', () => {
    test('displays event count and navigation hints', async () => {
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const header = element!.props.children[0]
      expect(header.props.content).toContain('Timeline (')
      expect(header.props.content).toContain('events)')
      expect(header.props.content).toContain('j/k to navigate')
      expect(header.props.content).toContain('g/G for first/last')
    })

    test('header uses bold blue styling', async () => {
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const header = element!.props.children[0]
      expect(header.props.style.fg).toBe('#7aa2f7')
      expect(header.props.style.attributes).toBe(TextAttributes.BOLD)
    })
  })

  describe('event rendering', () => {
    test('renders phase events with ">" icon', async () => {
      const phaseId = ctx.db.phases.start('BuildPhase')
      ctx.db.db.run('UPDATE phases SET created_at = ? WHERE id = ?', ['2024-01-01T12:00:00.000Z', phaseId])

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const iconText = eventRow.props.children[0]
      expect(iconText.props.content).toBe('>')
      expect(iconText.props.style.fg).toBe(colors.purple)
    })

    test('renders agent events with "@" icon', async () => {
      const agentId = ctx.db.agents.start('test prompt', 'claude-3')
      ctx.db.db.run('UPDATE agents SET created_at = ? WHERE id = ?', ['2024-01-01T12:00:00.000Z', agentId])

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const iconText = eventRow.props.children[0]
      expect(iconText.props.content).toBe('@')
      expect(iconText.props.style.fg).toBe(colors.blue)
    })

    test('renders tool events with "#" icon', async () => {
      const agentId = ctx.db.agents.start('prompt', 'claude-3')
      const toolId = ctx.db.tools.start(agentId, 'Read', { path: '/tmp' })
      ctx.db.db.run('UPDATE tool_calls SET created_at = ? WHERE id = ?', ['2024-01-01T12:00:00.000Z', toolId])

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      // Tool is most recent, should be first
      const eventRows = scrollbox.props.children.filter((c: any) => c?.props?.children?.[0]?.props?.content === '#')
      expect(eventRows.length).toBeGreaterThan(0)
      expect(eventRows[0].props.children[0].props.style.fg).toBe(colors.cyan)
    })

    test('displays event name', async () => {
      ctx.db.phases.start('MyCustomPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const nameText = eventRow.props.children[1]
      expect(nameText.props.content).toBe('MyCustomPhase')
      expect(nameText.props.style.fg).toBe('#c0caf5')
    })

    test('displays event status with correct color', async () => {
      const phaseId = ctx.db.phases.start('TestPhase')
      // Phase starts as 'running'

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const statusText = eventRow.props.children[2]
      expect(statusText.props.content).toBe('[running]')
      expect(statusText.props.style.fg).toBe(getStatusColor('running'))
    })

    test('displays formatted timestamp', async () => {
      const phaseId = ctx.db.phases.start('TestPhase')
      ctx.db.db.run('UPDATE phases SET created_at = ? WHERE id = ?', ['2024-06-15T14:30:45.000Z', phaseId])

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const timeText = eventRow.props.children[3]
      expect(timeText.props.content).toBe(formatTime('2024-06-15T14:30:45.000Z'))
      expect(timeText.props.style.fg).toBe('#565f89')
    })
  })

  describe('event details', () => {
    test('agent events show token counts', async () => {
      const agentId = ctx.db.agents.start('prompt', 'claude-3')
      ctx.db.db.run('UPDATE agents SET tokens_input = ?, tokens_output = ?, created_at = ? WHERE id = ?', [
        150, 75, '2024-01-01T12:00:00.000Z', agentId
      ])

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const agentRow = scrollbox.props.children.find((c: any) => c?.props?.children?.[0]?.props?.content === '@')
      expect(agentRow).toBeDefined()
      const detailsText = agentRow.props.children[4]
      expect(detailsText.props.content).toBe('150/75 tokens')
      expect(detailsText.props.style.fg).toBe('#7dcfff')
    })

    test('tool events show duration', async () => {
      const agentId = ctx.db.agents.start('prompt', 'claude-3')
      const toolId = ctx.db.tools.start(agentId, 'Read', { path: '/tmp' })
      ctx.db.db.run('UPDATE tool_calls SET duration_ms = ?, created_at = ? WHERE id = ?', [
        42, '2024-01-01T12:00:00.000Z', toolId
      ])

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const toolRow = scrollbox.props.children.find((c: any) => c?.props?.children?.[0]?.props?.content === '#')
      expect(toolRow).toBeDefined()
      const detailsText = toolRow.props.children[4]
      expect(detailsText.props.content).toBe('42ms')
    })

    test('tool events without duration have no details', async () => {
      const agentId = ctx.db.agents.start('prompt', 'claude-3')
      const toolId = ctx.db.tools.start(agentId, 'Read', { path: '/tmp' })
      // Duration is null by default

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const toolRow = scrollbox.props.children.find((c: any) => c?.props?.children?.[0]?.props?.content === '#')
      expect(toolRow).toBeDefined()
      // Details should be falsy when duration_ms is null
      const detailsText = toolRow.props.children[4]
      expect(detailsText).toBeFalsy()
    })
  })

  describe('event sorting', () => {
    test('events are sorted by timestamp descending (newest first)', async () => {
      const phase1 = ctx.db.phases.start('OldPhase')
      const phase2 = ctx.db.phases.start('NewPhase')
      ctx.db.db.run('UPDATE phases SET created_at = ? WHERE id = ?', ['2024-01-01T10:00:00.000Z', phase1])
      ctx.db.db.run('UPDATE phases SET created_at = ? WHERE id = ?', ['2024-01-01T12:00:00.000Z', phase2])

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const firstEventName = scrollbox.props.children[0].props.children[1].props.content
      const secondEventName = scrollbox.props.children[1].props.children[1].props.content
      expect(firstEventName).toBe('NewPhase')
      expect(secondEventName).toBe('OldPhase')
    })
  })

  describe('selection highlighting', () => {
    test('selected event has highlight background', async () => {
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const firstEvent = scrollbox.props.children[0]
      // First event should be selected by default
      expect(firstEvent.props.style.backgroundColor).toBe('#24283b')
    })

    test('non-selected events have no background', async () => {
      ctx.db.phases.start('Phase1')
      ctx.db.phases.start('Phase2')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      // Second event should not be selected
      const secondEvent = scrollbox.props.children[1]
      expect(secondEvent.props.style.backgroundColor).toBeUndefined()
    })
  })

  describe('layout', () => {
    test('main container uses column flex direction', async () => {
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      expect(element!.props.style.flexDirection).toBe('column')
      expect(element!.props.style.width).toBe('100%')
    })

    test('event rows use row flex direction with full width', async () => {
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      expect(eventRow.props.style.flexDirection).toBe('row')
      expect(eventRow.props.style.width).toBe('100%')
    })

    test('event rows have padding', async () => {
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      expect(eventRow.props.style.paddingLeft).toBe(1)
      expect(eventRow.props.style.paddingRight).toBe(1)
    })

    test('columns have fixed widths', async () => {
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      expect(eventRow.props.children[0].props.style.width).toBe(3) // icon
      expect(eventRow.props.children[1].props.style.width).toBe(20) // name
      expect(eventRow.props.children[2].props.style.width).toBe(12) // status
      expect(eventRow.props.children[3].props.style.width).toBe(12) // time
    })
  })

  describe('status colors', () => {
    test('running status uses green', async () => {
      ctx.db.phases.start('TestPhase') // starts as running

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const statusText = eventRow.props.children[2]
      expect(statusText.props.style.fg).toBe(colors.green)
    })

    test('completed status uses teal', async () => {
      const phaseId = ctx.db.phases.start('TestPhase')
      ctx.db.phases.complete(phaseId)

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const statusText = eventRow.props.children[2]
      expect(statusText.props.style.fg).toBe(colors.teal)
    })

    test('failed status uses red', async () => {
      const phaseId = ctx.db.phases.start('TestPhase')
      ctx.db.phases.fail(phaseId, 'Some error')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const statusText = eventRow.props.children[2]
      expect(statusText.props.style.fg).toBe(colors.red)
    })
  })

  describe('time formatting', () => {
    test('formats valid timestamp as HH:MM:SS', async () => {
      const phaseId = ctx.db.phases.start('TestPhase')
      ctx.db.db.run('UPDATE phases SET created_at = ? WHERE id = ?', ['2024-06-15T09:05:30.000Z', phaseId])

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const timeText = eventRow.props.children[3]
      // formatTime returns 24-hour format
      expect(timeText.props.content).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    })

    test('handles invalid timestamp gracefully', () => {
      // Test formatTime directly for invalid input
      const result = formatTime('invalid-date')
      expect(result).toBe('--:--:--')
    })
  })

  describe('mixed event types', () => {
    test('renders phases, agents, and tools together', async () => {
      const phaseId = ctx.db.phases.start('BuildPhase')
      const agentId = ctx.db.agents.start('test prompt', 'claude-3')
      const toolId = ctx.db.tools.start(agentId, 'Read', { path: '/tmp' })

      // Set timestamps to control order
      ctx.db.db.run('UPDATE phases SET created_at = ? WHERE id = ?', ['2024-01-01T10:00:00.000Z', phaseId])
      ctx.db.db.run('UPDATE agents SET created_at = ? WHERE id = ?', ['2024-01-01T11:00:00.000Z', agentId])
      ctx.db.db.run('UPDATE tool_calls SET created_at = ? WHERE id = ?', ['2024-01-01T12:00:00.000Z', toolId])

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const events = scrollbox.props.children

      // Should have 3 events
      expect(events).toHaveLength(3)

      // Check icons in order (newest first)
      expect(events[0].props.children[0].props.content).toBe('#') // tool
      expect(events[1].props.children[0].props.content).toBe('@') // agent
      expect(events[2].props.children[0].props.content).toBe('>') // phase
    })
  })

  describe('edge cases', () => {
    test('handles events with empty names', async () => {
      const phaseId = ctx.db.phases.start('')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const nameText = eventRow.props.children[1]
      expect(nameText.props.content).toBe('')
    })

    test('handles events with very long names', async () => {
      const longName = 'A'.repeat(100)
      ctx.db.phases.start(longName)

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const nameText = eventRow.props.children[1]
      expect(nameText.props.content).toBe(longName)
    })

    test('handles special characters in names', async () => {
      ctx.db.phases.start('<Phase>&"test\'')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      const nameText = eventRow.props.children[1]
      expect(nameText.props.content).toBe('<Phase>&"test\'')
    })

    test('handles zero token counts', async () => {
      const agentId = ctx.db.agents.start('prompt', 'claude-3')
      ctx.db.db.run('UPDATE agents SET tokens_input = 0, tokens_output = 0 WHERE id = ?', [agentId])

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const agentRow = scrollbox.props.children.find((c: any) => c?.props?.children?.[0]?.props?.content === '@')
      const detailsText = agentRow.props.children[4]
      expect(detailsText.props.content).toBe('0/0 tokens')
    })

    test('handles null token counts (defaults to 0)', async () => {
      const agentId = ctx.db.agents.start('prompt', 'claude-3')
      // tokens are null by default

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const agentRow = scrollbox.props.children.find((c: any) => c?.props?.children?.[0]?.props?.content === '@')
      const detailsText = agentRow.props.children[4]
      expect(detailsText.props.content).toBe('0/0 tokens')
    })

    test('handles very small height prop', async () => {
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps({ height: 5 })
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      // Should still render without error
      expect(element).toBeDefined()
    })

    test('handles very large height prop', async () => {
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps({ height: 1000 })
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      // Should still render without error
      expect(element).toBeDefined()
    })
  })

  describe('scrollbox', () => {
    test('scrollbox has flexGrow 1', async () => {
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      expect(scrollbox.props.style.flexGrow).toBe(1)
    })

    test('scrollbox is focused', async () => {
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          const props = createProps()
          element = ExecutionTimeline(props)
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      expect(scrollbox.props.focused).toBe(true)
    })
  })
})

// Unit tests for helper functions (getTypeIcon, getTypeColor)
describe('ExecutionTimeline helper functions', () => {
  describe('getTypeIcon (inferred from rendered output)', () => {
    test('phase type renders ">" icon', async () => {
      const ctx = createTuiTestContext()
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          element = ExecutionTimeline({ db: ctx.db, height: 20 })
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      expect(eventRow.props.children[0].props.content).toBe('>')

      cleanupTuiTestContext(ctx)
    })

    test('agent type renders "@" icon', async () => {
      const ctx = createTuiTestContext()
      ctx.db.agents.start('prompt', 'model')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          element = ExecutionTimeline({ db: ctx.db, height: 20 })
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const agentRow = scrollbox.props.children.find((c: any) => c?.props?.children?.[0]?.props?.content === '@')
      expect(agentRow).toBeDefined()

      cleanupTuiTestContext(ctx)
    })

    test('tool type renders "#" icon', async () => {
      const ctx = createTuiTestContext()
      const agentId = ctx.db.agents.start('prompt', 'model')
      ctx.db.tools.start(agentId, 'ToolName', {})

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          element = ExecutionTimeline({ db: ctx.db, height: 20 })
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const toolRow = scrollbox.props.children.find((c: any) => c?.props?.children?.[0]?.props?.content === '#')
      expect(toolRow).toBeDefined()

      cleanupTuiTestContext(ctx)
    })
  })

  describe('getTypeColor (inferred from rendered output)', () => {
    test('phase type uses purple color', async () => {
      const ctx = createTuiTestContext()
      ctx.db.phases.start('TestPhase')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          element = ExecutionTimeline({ db: ctx.db, height: 20 })
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const eventRow = scrollbox.props.children[0]
      expect(eventRow.props.children[0].props.style.fg).toBe(colors.purple)

      cleanupTuiTestContext(ctx)
    })

    test('agent type uses blue color', async () => {
      const ctx = createTuiTestContext()
      ctx.db.agents.start('prompt', 'model')

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          element = ExecutionTimeline({ db: ctx.db, height: 20 })
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const agentRow = scrollbox.props.children.find((c: any) => c?.props?.children?.[0]?.props?.content === '@')
      expect(agentRow.props.children[0].props.style.fg).toBe(colors.blue)

      cleanupTuiTestContext(ctx)
    })

    test('tool type uses cyan color', async () => {
      const ctx = createTuiTestContext()
      const agentId = ctx.db.agents.start('prompt', 'model')
      ctx.db.tools.start(agentId, 'ToolName', {})

      let element: React.ReactElement | null = null

      await ctx.root.render(
        React.createElement(() => {
          element = ExecutionTimeline({ db: ctx.db, height: 20 })
          return element
        })
      )

      await waitForEffects()

      const scrollbox = element!.props.children[1]
      const toolRow = scrollbox.props.children.find((c: any) => c?.props?.children?.[0]?.props?.content === '#')
      expect(toolRow.props.children[0].props.style.fg).toBe(colors.cyan)

      cleanupTuiTestContext(ctx)
    })
  })
})
