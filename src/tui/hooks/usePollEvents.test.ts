/**
 * Tests for src/tui/hooks/usePollEvents.ts
 * Hook for polling timeline events
 */

import { describe, test } from 'bun:test'

describe('tui/hooks/usePollEvents', () => {
  describe('initial state', () => {
    test.todo('returns empty array initially')
  })

  describe('polling behavior', () => {
    test.todo('polls every 500ms')
    test.todo('stops polling on unmount')
    test.todo('restarts polling when db changes')
  })

  describe('no execution', () => {
    test.todo('returns empty events when no current execution')
  })

  describe('event gathering', () => {
    test.todo('fetches phases from phases table')
    test.todo('fetches agents from agents table')
    test.todo('fetches tools from tool_calls table')
    test.todo('limits phases to 20 most recent')
    test.todo('limits agents to 30 most recent')
    test.todo('limits tools to 50 most recent')
  })

  describe('event transformation - phases', () => {
    test.todo('maps phase id correctly')
    test.todo('sets type to "phase"')
    test.todo('maps phase name correctly')
    test.todo('maps phase status correctly')
    test.todo('maps phase created_at to timestamp')
  })

  describe('event transformation - agents', () => {
    test.todo('maps agent id correctly')
    test.todo('sets type to "agent"')
    test.todo('uses model as name')
    test.todo('maps agent status correctly')
    test.todo('includes tokens in details')
    test.todo('handles null tokens_input')
    test.todo('handles null tokens_output')
    test.todo('formats details as "input/output tokens"')
  })

  describe('event transformation - tools', () => {
    test.todo('maps tool id correctly')
    test.todo('sets type to "tool"')
    test.todo('uses tool_name as name')
    test.todo('maps tool status correctly')
    test.todo('includes duration_ms in details')
    test.todo('handles null duration_ms')
    test.todo('formats details as "Xms"')
  })

  describe('event sorting', () => {
    test.todo('sorts all events by timestamp descending')
    test.todo('most recent events appear first')
    test.todo('handles mixed event types correctly')
  })

  describe('error handling', () => {
    test.todo('ignores query errors silently')
    test.todo('returns previous state on error')
  })

  describe('edge cases', () => {
    test.todo('handles empty phases table')
    test.todo('handles empty agents table')
    test.todo('handles empty tool_calls table')
    test.todo('handles invalid timestamp format')
  })
})
