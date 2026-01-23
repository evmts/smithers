/**
 * Unit tests for useJJSnapshots React hook
 * Tests snapshot management, automatic snapshots on tool calls, and state updates
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { renderHook, act } from '@testing-library/react'
import type { JJSnapshot, JJCommitResult } from '../../src/vcs/jjClient'
import { useJJSnapshots } from '../../src/hooks/useJJSnapshots'

// Mock jjClient
const mockJJClient = {
  getStatus: mock(),
  createSnapshot: mock(),
  getSnapshots: mock(),
  restoreSnapshot: mock(),
  undoLastSnapshot: mock()
}

// Mock exec function
const mockExec = mock()

// Mock dependencies
mock.module('../../src/vcs/jjClient', () => ({
  jjClient: mockJJClient
}))

beforeEach(() => {
  mockJJClient.getStatus.mockClear()
  mockJJClient.createSnapshot.mockClear()
  mockJJClient.getSnapshots.mockClear()
  mockJJClient.restoreSnapshot.mockClear()
  mockJJClient.undoLastSnapshot.mockClear()
  mockExec.mockClear()
})

describe('useJJSnapshots', () => {
  it('should initialize with default state', () => {
    const { result } = renderHook(() => useJJSnapshots(mockExec))

    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.snapshots).toEqual([])
    expect(result.current.autoSnapshotEnabled).toBe(true)
    expect(result.current.lastSnapshot).toBeUndefined()
  })

  describe('createSnapshot', () => {
    it('should create snapshot and update state', async () => {
      const mockResult: JJCommitResult = {
        success: true,
        commitId: 'abc123',
        message: 'Test snapshot'
      }
      mockJJClient.createSnapshot.mockResolvedValue(mockResult)
      mockJJClient.getSnapshots.mockResolvedValue([{
        id: 'abc123',
        message: 'Test snapshot',
        isAutoSnapshot: false
      }])

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.createSnapshot('Test snapshot')
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.lastSnapshot).toEqual({
        id: 'abc123',
        message: 'Test snapshot',
        isAutoSnapshot: false
      })
      expect(mockJJClient.createSnapshot).toHaveBeenCalledWith(mockExec, 'Test snapshot')
    })

    it('should handle snapshot creation failure', async () => {
      const mockResult: JJCommitResult = {
        success: false,
        message: 'No changes to commit'
      }
      mockJJClient.createSnapshot.mockResolvedValue(mockResult)

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.createSnapshot()
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('No changes to commit')
      expect(result.current.lastSnapshot).toBeUndefined()
    })

    it('should handle exceptions during snapshot creation', async () => {
      mockJJClient.createSnapshot.mockRejectedValue(new Error('Command failed'))

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.createSnapshot()
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('Command failed')
    })
  })

  describe('loadSnapshots', () => {
    it('should load and sort snapshots by timestamp', async () => {
      const mockSnapshots: JJSnapshot[] = [
        { id: 'snap1', message: 'First snapshot', isAutoSnapshot: false },
        { id: 'snap2', message: 'Auto-snapshot: Tool call at 2024-01-15T10:30:00', isAutoSnapshot: true },
        { id: 'snap3', message: 'Second snapshot', isAutoSnapshot: false }
      ]
      mockJJClient.getSnapshots.mockResolvedValue(mockSnapshots)

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.loadSnapshots()
      })

      expect(result.current.snapshots).toEqual(mockSnapshots)
      expect(result.current.status).toBe('idle')
      expect(mockJJClient.getSnapshots).toHaveBeenCalledWith(mockExec, 20)
    })

    it('should handle load failure', async () => {
      mockJJClient.getSnapshots.mockRejectedValue(new Error('Failed to load'))

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.loadSnapshots()
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('Failed to load')
      expect(result.current.snapshots).toEqual([])
    })
  })

  describe('restoreSnapshot', () => {
    it('should restore snapshot successfully', async () => {
      mockJJClient.restoreSnapshot.mockResolvedValue({
        success: true,
        message: 'Restored successfully'
      })

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.restoreSnapshot('snap123')
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.error).toBeNull()
      expect(mockJJClient.restoreSnapshot).toHaveBeenCalledWith(mockExec, 'snap123')
    })

    it('should handle restore failure', async () => {
      mockJJClient.restoreSnapshot.mockResolvedValue({
        success: false,
        message: 'Invalid snapshot'
      })

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.restoreSnapshot('invalid')
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('Invalid snapshot')
    })
  })

  describe('undoLastSnapshot', () => {
    it('should undo last snapshot successfully', async () => {
      mockJJClient.undoLastSnapshot.mockResolvedValue({
        success: true,
        message: 'Undo successful'
      })

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.undoLastSnapshot()
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.error).toBeNull()
      expect(mockJJClient.undoLastSnapshot).toHaveBeenCalledWith(mockExec)
    })

    it('should handle undo failure', async () => {
      mockJJClient.undoLastSnapshot.mockResolvedValue({
        success: false,
        message: 'Nothing to undo'
      })

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.undoLastSnapshot()
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('Nothing to undo')
    })
  })

  describe('auto-snapshot functionality', () => {
    it('should enable/disable auto-snapshots', () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      expect(result.current.autoSnapshotEnabled).toBe(true)

      act(() => {
        result.current.setAutoSnapshotEnabled(false)
      })

      expect(result.current.autoSnapshotEnabled).toBe(false)

      act(() => {
        result.current.setAutoSnapshotEnabled(true)
      })

      expect(result.current.autoSnapshotEnabled).toBe(true)
    })

    it('should create auto-snapshot when enabled', async () => {
      mockJJClient.createSnapshot.mockResolvedValue({
        success: true,
        commitId: 'auto123',
        message: 'Auto-snapshot: Tool call at 2024-01-15T10:30:00'
      })
      mockJJClient.getSnapshots.mockResolvedValue([])

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.createAutoSnapshot('test-tool')
      })

      expect(mockJJClient.createSnapshot).toHaveBeenCalledWith(
        mockExec,
        expect.stringContaining('Auto-snapshot: Tool call (test-tool) at')
      )
    })

    it('should not create auto-snapshot when disabled', async () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      act(() => {
        result.current.setAutoSnapshotEnabled(false)
      })

      await act(async () => {
        await result.current.createAutoSnapshot('test-tool')
      })

      expect(mockJJClient.createSnapshot).not.toHaveBeenCalled()
    })
  })

  describe('concurrent operation handling', () => {
    it('should prevent concurrent operations', async () => {
      mockJJClient.createSnapshot.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ success: true, commitId: 'test', message: 'test' }), 100))
      )

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      // Start first operation
      const promise1 = act(async () => {
        await result.current.createSnapshot()
      })

      // Try to start second operation while first is running
      await act(async () => {
        await result.current.createSnapshot()
      })

      expect(result.current.status).toBe('running')
      expect(result.current.error).toBe('Operation already in progress')

      await promise1
    })
  })
})