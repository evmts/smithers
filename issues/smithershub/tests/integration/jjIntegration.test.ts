/**
 * Integration tests for JJ version control integration
 * Tests real JJ operations and hook interactions
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { renderHook, act } from '@testing-library/react'
import { jjClient } from '../../src/vcs/jjClient'
import { useJJSnapshots } from '../../src/hooks/useJJSnapshots'
import type { ExecFunction } from '../../src/vcs/repoVerifier'

// Mock exec function with realistic JJ outputs
const createMockExec = (): jest.MockedFunction<ExecFunction> => {
  const mockExec = mock() as jest.MockedFunction<ExecFunction>

  // Default responses for common commands
  mockExec.mockImplementation(async (command: string) => {
    if (command === 'jj status') {
      return {
        stdout: `Working copy changes:
M src/file1.ts
A src/file2.ts

Parent commit: abcd1234 Initial commit
`
      }
    }

    if (command.startsWith('jj commit -m')) {
      const message = command.match(/-m "([^"]+)"/)?.[1] || 'Commit message'
      return {
        stdout: `Created commit def5678\nCommit message: ${message}\n`
      }
    }

    if (command.startsWith('jj log')) {
      return {
        stdout: `def5678 Auto-snapshot: Tool call at 2024-01-15T10:30:00
abcd1234 Initial commit
xyz9012 Previous snapshot
`
      }
    }

    if (command.startsWith('jj edit')) {
      const commitId = command.split(' ')[2]
      return {
        stdout: `Working copy now at: ${commitId}\n`
      }
    }

    if (command === 'jj undo') {
      return {
        stdout: `Undid operation: create def5678\n`
      }
    }

    throw new Error(`Unexpected command: ${command}`)
  })

  return mockExec
}

describe('JJ Integration', () => {
  let mockExec: jest.MockedFunction<ExecFunction>

  beforeEach(() => {
    mockExec = createMockExec()
  })

  describe('jjClient with real-like responses', () => {
    it('should handle complete snapshot workflow', async () => {
      // Create snapshot
      const createResult = await jjClient.createSnapshot(mockExec, 'Integration test snapshot')

      expect(createResult.success).toBe(true)
      expect(createResult.commitId).toBe('def5678')
      expect(createResult.message).toBe('Integration test snapshot')

      // Verify the commit command was called correctly
      expect(mockExec).toHaveBeenCalledWith('jj commit -m "Integration test snapshot"')
    })

    it('should handle status check and parsing', async () => {
      const status = await jjClient.getStatus(mockExec)

      expect(status.isClean).toBe(false)
      expect(status.changes).toEqual(['M src/file1.ts', 'A src/file2.ts'])
    })

    it('should list snapshots with proper parsing', async () => {
      const snapshots = await jjClient.getSnapshots(mockExec, 5)

      expect(snapshots).toHaveLength(3)
      expect(snapshots[0]).toEqual({
        id: 'def5678',
        message: 'Auto-snapshot: Tool call at 2024-01-15T10:30:00',
        isAutoSnapshot: true
      })
      expect(snapshots[1]).toEqual({
        id: 'abcd1234',
        message: 'Initial commit',
        isAutoSnapshot: false
      })
    })

    it('should restore to previous snapshot', async () => {
      const result = await jjClient.restoreSnapshot(mockExec, 'abcd1234')

      expect(result.success).toBe(true)
      expect(result.message).toContain('Restored to snapshot abcd1234')
      expect(mockExec).toHaveBeenCalledWith('jj edit abcd1234')
    })

    it('should undo last operation', async () => {
      const result = await jjClient.undoLastSnapshot(mockExec)

      expect(result.success).toBe(true)
      expect(result.message).toContain('Undid last snapshot')
      expect(mockExec).toHaveBeenCalledWith('jj undo')
    })
  })

  describe('useJJSnapshots hook integration', () => {
    it('should integrate with jjClient for full workflow', async () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      // Initial state
      expect(result.current.status).toBe('idle')
      expect(result.current.snapshots).toEqual([])

      // Load existing snapshots
      await act(async () => {
        await result.current.loadSnapshots()
      })

      expect(result.current.snapshots).toHaveLength(3)
      expect(result.current.snapshots[0].id).toBe('def5678')

      // Create new snapshot
      await act(async () => {
        await result.current.createSnapshot('Test integration snapshot')
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.error).toBeNull()
    })

    it('should handle auto-snapshot creation', async () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.createAutoSnapshot('test-tool')
      })

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/jj commit -m "Auto-snapshot: Tool call \(test-tool\) at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/)
      )
    })

    it('should integrate restore functionality', async () => {
      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.restoreSnapshot('abcd1234')
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.error).toBeNull()
      expect(mockExec).toHaveBeenCalledWith('jj edit abcd1234')
    })
  })

  describe('error scenarios', () => {
    it('should handle JJ command failures', async () => {
      mockExec.mockRejectedValue(new Error('jj: command not found'))

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      await act(async () => {
        await result.current.createSnapshot('Test')
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('jj: command not found')
    })

    it('should handle malformed JJ output', async () => {
      mockExec.mockResolvedValue({ stdout: 'Invalid output format' })

      const status = await jjClient.getStatus(mockExec)

      expect(status.isClean).toBe(true) // Should default to clean
      expect(status.changes).toEqual([])
    })

    it('should handle clean working directory', async () => {
      mockExec.mockImplementation(async (command: string) => {
        if (command === 'jj status') {
          return {
            stdout: `Working copy changes:
(no changes)

Parent commit: abcd1234 Initial commit
`
          }
        }
        throw new Error(`Unexpected command: ${command}`)
      })

      const result = await jjClient.createSnapshot(mockExec, 'Should not create')

      expect(result.success).toBe(false)
      expect(result.message).toBe('No changes to snapshot')
      expect(mockExec).toHaveBeenCalledTimes(1) // Only status check
    })
  })

  describe('concurrent operations', () => {
    it('should prevent concurrent snapshot creation', async () => {
      // Make the first call take some time
      mockExec.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return { stdout: 'Created commit abc123\n' }
      })

      const { result } = renderHook(() => useJJSnapshots(mockExec))

      // Start first operation
      const promise1 = act(async () => {
        await result.current.createSnapshot('First')
      })

      // Try second operation immediately
      await act(async () => {
        await result.current.createSnapshot('Second')
      })

      expect(result.current.status).toBe('running')
      expect(result.current.error).toBe('Operation already in progress')

      await promise1
    })
  })
})