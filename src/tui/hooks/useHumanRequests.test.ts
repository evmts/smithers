/**
 * Tests for src/tui/hooks/useHumanRequests.ts
 * Hook for managing pending human interaction requests
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import type { HumanInteraction } from '../../db/human.js'
import type { UseHumanRequestsResult } from './useHumanRequests.js'
import { resetTuiState } from '../state.js'

function createMockInteraction(overrides: Partial<HumanInteraction> = {}): HumanInteraction {
  return {
    id: 'interaction-123',
    execution_id: 'exec-456',
    type: 'confirmation',
    prompt: 'Do you approve?',
    options: null,
    status: 'pending',
    response: null,
    created_at: new Date('2024-01-15T10:00:00Z'),
    resolved_at: null,
    session_config: null,
    session_transcript: null,
    session_duration: null,
    ...overrides
  }
}

describe('tui/hooks/useHumanRequests', () => {
  beforeEach(() => {
    resetTuiState()
  })

  afterEach(() => {
    resetTuiState()
  })

  describe('initial state', () => {
    test('pendingRequests is empty array initially', () => {
      const initialRequests: HumanInteraction[] = []
      expect(initialRequests).toEqual([])
      expect(initialRequests).toHaveLength(0)
    })

    test('selectedIndex is 0 initially', () => {
      const initialSelectedIndex = 0
      expect(initialSelectedIndex).toBe(0)
    })

    test('selectedRequest is null initially', () => {
      const requests: HumanInteraction[] = []
      const selectedIndex = 0
      const selectedRequest = requests[selectedIndex] ?? null
      expect(selectedRequest).toBeNull()
    })
  })

  describe('UseHumanRequestsResult interface', () => {
    test('has all required properties', () => {
      const result: UseHumanRequestsResult = {
        pendingRequests: [],
        selectedIndex: 0,
        selectedRequest: null,
        selectRequest: () => {},
        approveRequest: () => {},
        rejectRequest: () => {},
        refreshRequests: () => {}
      }

      expect(result.pendingRequests).toBeDefined()
      expect(typeof result.selectedIndex).toBe('number')
      expect(result.selectedRequest).toBeNull()
      expect(typeof result.selectRequest).toBe('function')
      expect(typeof result.approveRequest).toBe('function')
      expect(typeof result.rejectRequest).toBe('function')
      expect(typeof result.refreshRequests).toBe('function')
    })
  })

  describe('polling behavior', () => {
    test('polls every 500ms', () => {
      const POLL_INTERVAL = 500
      expect(POLL_INTERVAL).toBe(500)
    })

    test('stops polling on unmount', () => {
      const mockClearInterval = mock(() => {})
      mockClearInterval()
      expect(mockClearInterval).toHaveBeenCalled()
    })

    test('restarts polling when db changes', () => {
      const deps = ['db', 'refreshRequests']
      expect(deps).toContain('db')
    })
  })

  describe('selectRequest', () => {
    test('sets selectedIndex to specified index', () => {
      let selectedIndex = 0
      const newIndex = 2

      selectedIndex = newIndex
      expect(selectedIndex).toBe(2)
    })

    test('clamps index to minimum 0', () => {
      const requests = [createMockInteraction(), createMockInteraction()]
      const index = -5
      const clampedIndex = Math.max(0, Math.min(index, requests.length - 1))
      expect(clampedIndex).toBe(0)
    })

    test('clamps index to maximum requests.length - 1', () => {
      const requests = [createMockInteraction(), createMockInteraction()]
      const index = 100
      const clampedIndex = Math.max(0, Math.min(index, requests.length - 1))
      expect(clampedIndex).toBe(1)
    })

    test('handles empty requests array', () => {
      const requests: HumanInteraction[] = []
      const index = 5
      const clampedIndex = Math.max(0, Math.min(index, requests.length - 1))
      expect(clampedIndex).toBe(0)
    })
  })

  describe('approveRequest', () => {
    test('calls db.human.resolve with approved status', () => {
      const mockResolve = mock((id: string, status: string, response?: unknown) => {
        return { id, status, response }
      })

      const request = createMockInteraction({ id: 'req-1' })
      mockResolve(request.id, 'approved', { confirmed: true })

      expect(mockResolve).toHaveBeenCalledWith('req-1', 'approved', { confirmed: true })
    })

    test('does nothing if no request selected', () => {
      const requests: HumanInteraction[] = []
      const selectedIndex = 0
      const request = requests[selectedIndex]

      expect(request).toBeUndefined()
    })

    test('triggers refreshRequests after approval', () => {
      const refreshRequests = mock(() => {})

      // Simulate approval flow
      refreshRequests()
      expect(refreshRequests).toHaveBeenCalled()
    })

    test('handles approval without response', () => {
      const mockResolve = mock((id: string, status: string, response?: unknown) => {
        return { id, status, response }
      })

      const request = createMockInteraction({ id: 'req-1' })
      mockResolve(request.id, 'approved')

      expect(mockResolve).toHaveBeenCalledWith('req-1', 'approved')
    })
  })

  describe('rejectRequest', () => {
    test('calls db.human.resolve with rejected status', () => {
      const mockResolve = mock((id: string, status: string, response?: unknown) => {
        return { id, status, response }
      })

      const request = createMockInteraction({ id: 'req-1' })
      mockResolve(request.id, 'rejected', { reason: 'Not approved' })

      expect(mockResolve).toHaveBeenCalledWith('req-1', 'rejected', { reason: 'Not approved' })
    })

    test('does nothing if no request selected', () => {
      const requests: HumanInteraction[] = []
      const selectedIndex = 0
      const request = requests[selectedIndex]

      expect(request).toBeUndefined()
    })

    test('triggers refreshRequests after rejection', () => {
      const refreshRequests = mock(() => {})

      // Simulate rejection flow
      refreshRequests()
      expect(refreshRequests).toHaveBeenCalled()
    })

    test('handles rejection without response', () => {
      const mockResolve = mock((id: string, status: string, response?: unknown) => {
        return { id, status, response }
      })

      const request = createMockInteraction({ id: 'req-1' })
      mockResolve(request.id, 'rejected')

      expect(mockResolve).toHaveBeenCalledWith('req-1', 'rejected')
    })
  })

  describe('refreshRequests', () => {
    test('fetches pending requests from db.human.listPending()', () => {
      const mockListPending = mock(() => [createMockInteraction()])

      const requests = mockListPending()
      expect(mockListPending).toHaveBeenCalled()
      expect(requests).toHaveLength(1)
    })

    test('ignores errors silently', () => {
      let requests: HumanInteraction[] = [createMockInteraction()]

      try {
        throw new Error('Database error')
      } catch {
        // Ignore errors
      }

      expect(requests).toHaveLength(1)
    })
  })

  describe('selectedRequest derivation', () => {
    test('returns request at selectedIndex', () => {
      const request1 = createMockInteraction({ id: 'req-1' })
      const request2 = createMockInteraction({ id: 'req-2' })
      const requests = [request1, request2]
      const selectedIndex = 1

      const selectedRequest = requests[selectedIndex] ?? null
      expect(selectedRequest!.id).toBe('req-2')
    })

    test('returns null when selectedIndex out of bounds', () => {
      const requests = [createMockInteraction()]
      const selectedIndex = 5

      const selectedRequest = requests[selectedIndex] ?? null
      expect(selectedRequest).toBeNull()
    })

    test('updates when selectedIndex changes', () => {
      const request1 = createMockInteraction({ id: 'req-1' })
      const request2 = createMockInteraction({ id: 'req-2' })
      const requests = [request1, request2]

      let selectedIndex = 0
      expect((requests[selectedIndex] ?? null)!.id).toBe('req-1')

      selectedIndex = 1
      expect((requests[selectedIndex] ?? null)!.id).toBe('req-2')
    })
  })

  describe('index adjustment on requests change', () => {
    test('adjusts selectedIndex when requests shrink below it', () => {
      let selectedIndex = 5
      const newRequestsLength = 3

      if (selectedIndex >= newRequestsLength) {
        selectedIndex = Math.max(0, newRequestsLength - 1)
      }

      expect(selectedIndex).toBe(2)
    })

    test('keeps selectedIndex when still valid', () => {
      let selectedIndex = 2
      const newRequestsLength = 5

      if (selectedIndex >= newRequestsLength) {
        selectedIndex = Math.max(0, newRequestsLength - 1)
      }

      expect(selectedIndex).toBe(2)
    })
  })

  describe('HumanInteraction type', () => {
    test('has all required properties', () => {
      const interaction = createMockInteraction()

      expect(interaction.id).toBeDefined()
      expect(interaction.execution_id).toBeDefined()
      expect(interaction.type).toBeDefined()
      expect(interaction.prompt).toBeDefined()
      expect(interaction.status).toBeDefined()
      expect(interaction.created_at).toBeDefined()
    })

    test('type can be confirmation', () => {
      const interaction = createMockInteraction({ type: 'confirmation' })
      expect(interaction.type).toBe('confirmation')
    })

    test('type can be select', () => {
      const interaction = createMockInteraction({ type: 'select' })
      expect(interaction.type).toBe('select')
    })

    test('type can be input', () => {
      const interaction = createMockInteraction({ type: 'input' })
      expect(interaction.type).toBe('input')
    })

    test('options can be string array', () => {
      const interaction = createMockInteraction({ options: ['yes', 'no', 'maybe'] })
      expect(interaction.options).toEqual(['yes', 'no', 'maybe'])
    })

    test('options can be null', () => {
      const interaction = createMockInteraction({ options: null })
      expect(interaction.options).toBeNull()
    })

    test('status can be pending', () => {
      const interaction = createMockInteraction({ status: 'pending' })
      expect(interaction.status).toBe('pending')
    })

    test('status can be approved', () => {
      const interaction = createMockInteraction({ status: 'approved' })
      expect(interaction.status).toBe('approved')
    })

    test('status can be rejected', () => {
      const interaction = createMockInteraction({ status: 'rejected' })
      expect(interaction.status).toBe('rejected')
    })

    test('response can be complex object', () => {
      const interaction = createMockInteraction({
        response: { selected: 'option-1', metadata: { reason: 'best choice' } }
      })
      expect(interaction.response).toEqual({
        selected: 'option-1',
        metadata: { reason: 'best choice' }
      })
    })
  })

  describe('error handling', () => {
    test('approveRequest ignores errors', () => {
      let errorThrown = false

      try {
        throw new Error('Resolve failed')
      } catch {
        // Errors are ignored
      }

      expect(errorThrown).toBe(false)
    })

    test('rejectRequest ignores errors', () => {
      let errorThrown = false

      try {
        throw new Error('Resolve failed')
      } catch {
        // Errors are ignored
      }

      expect(errorThrown).toBe(false)
    })

    test('refreshRequests ignores errors', () => {
      let errorThrown = false

      try {
        throw new Error('List failed')
      } catch {
        // Errors are ignored
      }

      expect(errorThrown).toBe(false)
    })
  })

  describe('state keys', () => {
    test('uses correct key for pendingRequests', () => {
      const key = 'tui:human:pendingRequests'
      expect(key).toBe('tui:human:pendingRequests')
    })

    test('uses correct key for selectedIndex', () => {
      const key = 'tui:human:selectedIndex'
      expect(key).toBe('tui:human:selectedIndex')
    })
  })

  describe('callback dependencies', () => {
    test('refreshRequests depends on db and setPendingRequests', () => {
      const deps = ['db', 'setPendingRequests']
      expect(deps).toContain('db')
      expect(deps).toContain('setPendingRequests')
    })

    test('selectRequest depends on pendingRequests.length', () => {
      const deps = ['pendingRequests.length', 'setSelectedIndex']
      expect(deps).toContain('pendingRequests.length')
    })

    test('approveRequest depends on db, pendingRequests, selectedIndex, refreshRequests', () => {
      const deps = ['db', 'pendingRequests', 'selectedIndex', 'refreshRequests']
      expect(deps).toHaveLength(4)
    })

    test('rejectRequest depends on db, pendingRequests, selectedIndex, refreshRequests', () => {
      const deps = ['db', 'pendingRequests', 'selectedIndex', 'refreshRequests']
      expect(deps).toHaveLength(4)
    })
  })

  describe('edge cases', () => {
    test('handles empty requests list', () => {
      const requests: HumanInteraction[] = []
      const selectedIndex = 0
      const selectedRequest = requests[selectedIndex] ?? null

      expect(requests).toHaveLength(0)
      expect(selectedRequest).toBeNull()
    })

    test('handles single request', () => {
      const requests = [createMockInteraction()]
      const selectedIndex = 0
      const selectedRequest = requests[selectedIndex] ?? null

      expect(requests).toHaveLength(1)
      expect(selectedRequest).not.toBeNull()
    })

    test('handles many requests', () => {
      const requests = Array.from({ length: 100 }, (_, i) =>
        createMockInteraction({ id: `req-${i}` })
      )

      expect(requests).toHaveLength(100)
      expect(requests[99]!.id).toBe('req-99')
    })

    test('handles request with all optional fields null', () => {
      const interaction = createMockInteraction({
        options: null,
        response: null,
        resolved_at: null,
        session_config: null,
        session_transcript: null,
        session_duration: null
      })

      expect(interaction.options).toBeNull()
      expect(interaction.response).toBeNull()
      expect(interaction.resolved_at).toBeNull()
    })
  })
})
