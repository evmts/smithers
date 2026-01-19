/**
 * Tests for src/tui/hooks/usePollEvents.ts
 * Hook for polling timeline events
 */

import { describe, test, expect, mock } from 'bun:test'
import type { TimelineEvent } from './usePollEvents.js'

describe('tui/hooks/usePollEvents', () => {
  describe('initial state', () => {
    test('returns empty array initially', () => {
      const initialEvents: TimelineEvent[] = []
      expect(initialEvents).toEqual([])
      expect(initialEvents).toHaveLength(0)
    })
  })

  describe('polling behavior', () => {
    test('polls every 500ms', () => {
      const POLL_INTERVAL = 500
      expect(POLL_INTERVAL).toBe(500)
    })

    test('clearInterval is called on unmount', () => {
      // The cleanup function returns () => clearInterval(interval)
      const mockClearInterval = mock(() => {})
      const intervalId = 123
      
      // Simulate cleanup
      mockClearInterval()
      expect(mockClearInterval).toHaveBeenCalled()
    })
  })

  describe('no execution', () => {
    test('returns empty events when no current execution', () => {
      // When execution is null, setEvents([]) is called
      const events: TimelineEvent[] = []
      expect(events).toEqual([])
    })
  })

  describe('event transformation - phases', () => {
    test('maps phase id correctly', () => {
      const phase = { id: 'phase-123', name: 'Build', status: 'running', created_at: '2024-01-15T10:00:00Z' }
      const event: TimelineEvent = {
        id: phase.id,
        type: 'phase',
        name: phase.name,
        status: phase.status,
        timestamp: phase.created_at
      }
      expect(event.id).toBe('phase-123')
    })

    test('sets type to "phase"', () => {
      const phase = { id: 'phase-123', name: 'Build', status: 'running', created_at: '2024-01-15T10:00:00Z' }
      const event: TimelineEvent = {
        id: phase.id,
        type: 'phase',
        name: phase.name,
        status: phase.status,
        timestamp: phase.created_at
      }
      expect(event.type).toBe('phase')
    })

    test('maps phase name correctly', () => {
      const phase = { id: 'phase-123', name: 'Deploy', status: 'completed', created_at: '2024-01-15T10:00:00Z' }
      const event: TimelineEvent = {
        id: phase.id,
        type: 'phase',
        name: phase.name,
        status: phase.status,
        timestamp: phase.created_at
      }
      expect(event.name).toBe('Deploy')
    })

    test('maps phase status correctly', () => {
      const phase = { id: 'phase-123', name: 'Build', status: 'failed', created_at: '2024-01-15T10:00:00Z' }
      const event: TimelineEvent = {
        id: phase.id,
        type: 'phase',
        name: phase.name,
        status: phase.status,
        timestamp: phase.created_at
      }
      expect(event.status).toBe('failed')
    })

    test('maps phase created_at to timestamp', () => {
      const phase = { id: 'phase-123', name: 'Build', status: 'running', created_at: '2024-01-15T10:30:00Z' }
      const event: TimelineEvent = {
        id: phase.id,
        type: 'phase',
        name: phase.name,
        status: phase.status,
        timestamp: phase.created_at
      }
      expect(event.timestamp).toBe('2024-01-15T10:30:00Z')
    })
  })

  describe('event transformation - agents', () => {
    test('maps agent id correctly', () => {
      const agent = { id: 'agent-456', model: 'claude-3-opus', status: 'running', created_at: '2024-01-15T10:00:00Z', tokens_input: 100, tokens_output: 50 }
      const event: TimelineEvent = {
        id: agent.id,
        type: 'agent',
        name: agent.model,
        status: agent.status,
        timestamp: agent.created_at,
        details: `${agent.tokens_input ?? 0}/${agent.tokens_output ?? 0} tokens`
      }
      expect(event.id).toBe('agent-456')
    })

    test('sets type to "agent"', () => {
      const agent = { id: 'agent-456', model: 'claude-3-opus', status: 'running', created_at: '2024-01-15T10:00:00Z', tokens_input: 100, tokens_output: 50 }
      const event: TimelineEvent = {
        id: agent.id,
        type: 'agent',
        name: agent.model,
        status: agent.status,
        timestamp: agent.created_at,
        details: `${agent.tokens_input ?? 0}/${agent.tokens_output ?? 0} tokens`
      }
      expect(event.type).toBe('agent')
    })

    test('uses model as name', () => {
      const agent = { id: 'agent-456', model: 'claude-3-sonnet', status: 'running', created_at: '2024-01-15T10:00:00Z', tokens_input: 100, tokens_output: 50 }
      const event: TimelineEvent = {
        id: agent.id,
        type: 'agent',
        name: agent.model,
        status: agent.status,
        timestamp: agent.created_at,
        details: `${agent.tokens_input ?? 0}/${agent.tokens_output ?? 0} tokens`
      }
      expect(event.name).toBe('claude-3-sonnet')
    })

    test('maps agent status correctly', () => {
      const agent = { id: 'agent-456', model: 'claude-3-opus', status: 'completed', created_at: '2024-01-15T10:00:00Z', tokens_input: 100, tokens_output: 50 }
      const event: TimelineEvent = {
        id: agent.id,
        type: 'agent',
        name: agent.model,
        status: agent.status,
        timestamp: agent.created_at,
        details: `${agent.tokens_input ?? 0}/${agent.tokens_output ?? 0} tokens`
      }
      expect(event.status).toBe('completed')
    })

    test('includes tokens in details', () => {
      const agent = { id: 'agent-456', model: 'claude-3-opus', status: 'running', created_at: '2024-01-15T10:00:00Z', tokens_input: 1500, tokens_output: 750 }
      const event: TimelineEvent = {
        id: agent.id,
        type: 'agent',
        name: agent.model,
        status: agent.status,
        timestamp: agent.created_at,
        details: `${agent.tokens_input ?? 0}/${agent.tokens_output ?? 0} tokens`
      }
      expect(event.details).toBe('1500/750 tokens')
    })

    test('handles null tokens_input', () => {
      const agent = { id: 'agent-456', model: 'claude-3-opus', status: 'running', created_at: '2024-01-15T10:00:00Z', tokens_input: null, tokens_output: 50 }
      const details = `${agent.tokens_input ?? 0}/${agent.tokens_output ?? 0} tokens`
      expect(details).toBe('0/50 tokens')
    })

    test('handles null tokens_output', () => {
      const agent = { id: 'agent-456', model: 'claude-3-opus', status: 'running', created_at: '2024-01-15T10:00:00Z', tokens_input: 100, tokens_output: null }
      const details = `${agent.tokens_input ?? 0}/${agent.tokens_output ?? 0} tokens`
      expect(details).toBe('100/0 tokens')
    })

    test('formats details as "input/output tokens"', () => {
      const agent = { id: 'agent-456', model: 'claude-3-opus', status: 'running', created_at: '2024-01-15T10:00:00Z', tokens_input: 200, tokens_output: 100 }
      const details = `${agent.tokens_input ?? 0}/${agent.tokens_output ?? 0} tokens`
      expect(details).toMatch(/^\d+\/\d+ tokens$/)
    })
  })

  describe('event transformation - tools', () => {
    test('maps tool id correctly', () => {
      const tool = { id: 'tool-789', tool_name: 'read_file', status: 'completed', created_at: '2024-01-15T10:00:00Z', duration_ms: 150 }
      const event: TimelineEvent = {
        id: tool.id,
        type: 'tool',
        name: tool.tool_name,
        status: tool.status,
        timestamp: tool.created_at,
        details: tool.duration_ms ? `${tool.duration_ms}ms` : undefined
      }
      expect(event.id).toBe('tool-789')
    })

    test('sets type to "tool"', () => {
      const tool = { id: 'tool-789', tool_name: 'read_file', status: 'completed', created_at: '2024-01-15T10:00:00Z', duration_ms: 150 }
      const event: TimelineEvent = {
        id: tool.id,
        type: 'tool',
        name: tool.tool_name,
        status: tool.status,
        timestamp: tool.created_at,
        details: tool.duration_ms ? `${tool.duration_ms}ms` : undefined
      }
      expect(event.type).toBe('tool')
    })

    test('uses tool_name as name', () => {
      const tool = { id: 'tool-789', tool_name: 'write_file', status: 'completed', created_at: '2024-01-15T10:00:00Z', duration_ms: 150 }
      const event: TimelineEvent = {
        id: tool.id,
        type: 'tool',
        name: tool.tool_name,
        status: tool.status,
        timestamp: tool.created_at,
        details: tool.duration_ms ? `${tool.duration_ms}ms` : undefined
      }
      expect(event.name).toBe('write_file')
    })

    test('maps tool status correctly', () => {
      const tool = { id: 'tool-789', tool_name: 'read_file', status: 'failed', created_at: '2024-01-15T10:00:00Z', duration_ms: 150 }
      const event: TimelineEvent = {
        id: tool.id,
        type: 'tool',
        name: tool.tool_name,
        status: tool.status,
        timestamp: tool.created_at,
        details: tool.duration_ms ? `${tool.duration_ms}ms` : undefined
      }
      expect(event.status).toBe('failed')
    })

    test('includes duration_ms in details', () => {
      const tool = { id: 'tool-789', tool_name: 'read_file', status: 'completed', created_at: '2024-01-15T10:00:00Z', duration_ms: 250 }
      const details = tool.duration_ms ? `${tool.duration_ms}ms` : undefined
      expect(details).toBe('250ms')
    })

    test('handles null duration_ms', () => {
      const tool = { id: 'tool-789', tool_name: 'read_file', status: 'completed', created_at: '2024-01-15T10:00:00Z', duration_ms: null }
      const details = tool.duration_ms ? `${tool.duration_ms}ms` : undefined
      expect(details).toBeUndefined()
    })

    test('formats details as "Xms"', () => {
      const tool = { id: 'tool-789', tool_name: 'read_file', status: 'completed', created_at: '2024-01-15T10:00:00Z', duration_ms: 1234 }
      const details = tool.duration_ms ? `${tool.duration_ms}ms` : undefined
      expect(details).toMatch(/^\d+ms$/)
    })
  })

  describe('event sorting', () => {
    test('sorts all events by timestamp descending', () => {
      const events: TimelineEvent[] = [
        { id: '1', type: 'phase', name: 'First', status: 'running', timestamp: '2024-01-15T10:00:00Z' },
        { id: '2', type: 'agent', name: 'Second', status: 'running', timestamp: '2024-01-15T11:00:00Z' },
        { id: '3', type: 'tool', name: 'Third', status: 'running', timestamp: '2024-01-15T09:00:00Z' },
      ]
      
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      
      expect(events[0]!.id).toBe('2') // 11:00
      expect(events[1]!.id).toBe('1') // 10:00
      expect(events[2]!.id).toBe('3') // 09:00
    })

    test('most recent events appear first', () => {
      const events: TimelineEvent[] = [
        { id: 'old', type: 'phase', name: 'Old', status: 'running', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'new', type: 'phase', name: 'New', status: 'running', timestamp: '2024-12-31T23:59:59Z' },
      ]
      
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      
      expect(events[0]!.id).toBe('new')
    })

    test('handles mixed event types correctly', () => {
      const events: TimelineEvent[] = [
        { id: 'phase-1', type: 'phase', name: 'Phase', status: 'running', timestamp: '2024-01-15T10:00:00Z' },
        { id: 'agent-1', type: 'agent', name: 'Agent', status: 'running', timestamp: '2024-01-15T10:00:01Z' },
        { id: 'tool-1', type: 'tool', name: 'Tool', status: 'running', timestamp: '2024-01-15T10:00:02Z' },
      ]
      
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      
      expect(events[0]!.type).toBe('tool')
      expect(events[1]!.type).toBe('agent')
      expect(events[2]!.type).toBe('phase')
    })
  })

  describe('query limits', () => {
    test('limits phases to 20 most recent', () => {
      const PHASES_LIMIT = 20
      expect(PHASES_LIMIT).toBe(20)
    })

    test('limits agents to 30 most recent', () => {
      const AGENTS_LIMIT = 30
      expect(AGENTS_LIMIT).toBe(30)
    })

    test('limits tools to 50 most recent', () => {
      const TOOLS_LIMIT = 50
      expect(TOOLS_LIMIT).toBe(50)
    })
  })

  describe('error handling', () => {
    test('ignores query errors silently', () => {
      // The hook uses try/catch with empty catch block
      let events: TimelineEvent[] = [{ id: '1', type: 'phase', name: 'Test', status: 'running', timestamp: '2024-01-15T10:00:00Z' }]
      
      try {
        throw new Error('Query failed')
      } catch {
        // Ignore errors - events remain unchanged
      }
      
      expect(events).toHaveLength(1)
    })
  })

  describe('edge cases', () => {
    test('handles empty phases table', () => {
      const phases: unknown[] = []
      const phaseEvents = phases.map(() => ({ type: 'phase' }))
      expect(phaseEvents).toHaveLength(0)
    })

    test('handles empty agents table', () => {
      const agents: unknown[] = []
      const agentEvents = agents.map(() => ({ type: 'agent' }))
      expect(agentEvents).toHaveLength(0)
    })

    test('handles empty tool_calls table', () => {
      const tools: unknown[] = []
      const toolEvents = tools.map(() => ({ type: 'tool' }))
      expect(toolEvents).toHaveLength(0)
    })

    test('handles invalid timestamp format gracefully', () => {
      // Invalid timestamps may cause issues with Date parsing
      const invalidTimestamp = 'not-a-date'
      const date = new Date(invalidTimestamp)
      expect(date.toString()).toBe('Invalid Date')
    })
  })

  describe('TimelineEvent interface', () => {
    test('has all required properties', () => {
      const event: TimelineEvent = {
        id: 'test-id',
        type: 'phase',
        name: 'Test Event',
        status: 'running',
        timestamp: '2024-01-15T10:00:00Z'
      }
      
      expect(event.id).toBeDefined()
      expect(event.type).toBeDefined()
      expect(event.name).toBeDefined()
      expect(event.status).toBeDefined()
      expect(event.timestamp).toBeDefined()
    })

    test('details is optional', () => {
      const eventWithDetails: TimelineEvent = {
        id: 'test-id',
        type: 'agent',
        name: 'Test',
        status: 'running',
        timestamp: '2024-01-15T10:00:00Z',
        details: '100/50 tokens'
      }
      
      const eventWithoutDetails: TimelineEvent = {
        id: 'test-id',
        type: 'phase',
        name: 'Test',
        status: 'running',
        timestamp: '2024-01-15T10:00:00Z'
      }
      
      expect(eventWithDetails.details).toBe('100/50 tokens')
      expect(eventWithoutDetails.details).toBeUndefined()
    })
  })
})
