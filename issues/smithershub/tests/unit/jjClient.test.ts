/**
 * Unit tests for JJ version control client
 * Tests JJ operations, snapshot creation, and error handling
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { jjClient, type JJSnapshot, type JJCommitResult } from '../../src/vcs/jjClient'

// Mock exec function for testing
const mockExec = mock()

beforeEach(() => {
  mockExec.mockClear()
})

describe('jjClient', () => {
  describe('getStatus', () => {
    it('should parse clean working directory status', async () => {
      mockExec.mockResolvedValue({
        stdout: `Working copy changes:
(no changes)

The working copy is clean
`
      })

      const result = await jjClient.getStatus(mockExec)

      expect(result.isClean).toBe(true)
      expect(result.changes).toEqual([])
      expect(mockExec).toHaveBeenCalledWith('jj status')
    })

    it('should parse working directory with changes', async () => {
      mockExec.mockResolvedValue({
        stdout: `Working copy changes:
M src/file1.ts
A src/file2.ts
D src/file3.ts

Parent commit: abc123
`
      })

      const result = await jjClient.getStatus(mockExec)

      expect(result.isClean).toBe(false)
      expect(result.changes).toEqual(['M src/file1.ts', 'A src/file2.ts', 'D src/file3.ts'])
    })

    it('should handle exec errors gracefully', async () => {
      mockExec.mockRejectedValue(new Error('jj command failed'))

      await expect(jjClient.getStatus(mockExec)).rejects.toThrow('Failed to get JJ status: jj command failed')
    })
  })

  describe('createSnapshot', () => {
    it('should create snapshot with auto-generated message', async () => {
      mockExec.mockResolvedValueOnce({
        stdout: 'Working copy changes:\nM src/test.ts\n'
      })
      mockExec.mockResolvedValueOnce({
        stdout: 'Created commit abc123def\n'
      })

      const result = await jjClient.createSnapshot(mockExec)

      expect(result.success).toBe(true)
      expect(result.commitId).toBe('abc123def')
      expect(result.message).toContain('Auto-snapshot')
      expect(mockExec).toHaveBeenCalledWith('jj commit -m "Auto-snapshot: Tool call at ' + expect.any(String))
    })

    it('should create snapshot with custom message', async () => {
      const customMessage = 'Before running tests'
      mockExec.mockResolvedValueOnce({
        stdout: 'Working copy changes:\nM src/test.ts\n'
      })
      mockExec.mockResolvedValueOnce({
        stdout: 'Created commit def456abc\n'
      })

      const result = await jjClient.createSnapshot(mockExec, customMessage)

      expect(result.success).toBe(true)
      expect(result.commitId).toBe('def456abc')
      expect(result.message).toBe(customMessage)
      expect(mockExec).toHaveBeenCalledWith(`jj commit -m "${customMessage}"`)
    })

    it('should not create snapshot when working copy is clean', async () => {
      mockExec.mockResolvedValue({
        stdout: 'Working copy changes:\n(no changes)\n'
      })

      const result = await jjClient.createSnapshot(mockExec)

      expect(result.success).toBe(false)
      expect(result.message).toBe('No changes to snapshot')
      expect(result.commitId).toBeUndefined()
      expect(mockExec).toHaveBeenCalledTimes(1) // Only status check
    })

    it('should handle commit failures', async () => {
      mockExec.mockResolvedValueOnce({
        stdout: 'Working copy changes:\nM src/test.ts\n'
      })
      mockExec.mockRejectedValueOnce(new Error('Commit failed'))

      const result = await jjClient.createSnapshot(mockExec)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Failed to create snapshot: Commit failed')
      expect(result.commitId).toBeUndefined()
    })
  })

  describe('getSnapshots', () => {
    it('should list recent snapshots', async () => {
      mockExec.mockResolvedValue({
        stdout: `abc123def Auto-snapshot: Tool call at 2024-01-15T10:30:00
def456abc Manual snapshot: Before refactoring
ghi789jkl Auto-snapshot: Tool call at 2024-01-15T09:15:00
`
      })

      const result = await jjClient.getSnapshots(mockExec, 3)

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({
        id: 'abc123def',
        message: 'Auto-snapshot: Tool call at 2024-01-15T10:30:00',
        isAutoSnapshot: true
      })
      expect(result[1]).toEqual({
        id: 'def456abc',
        message: 'Manual snapshot: Before refactoring',
        isAutoSnapshot: false
      })
      expect(mockExec).toHaveBeenCalledWith('jj log --no-graph --template "change_id.short() ++ \\" \\" ++ description" -r "@ | @- | @--" --limit 3')
    })

    it('should handle empty log output', async () => {
      mockExec.mockResolvedValue({ stdout: '' })

      const result = await jjClient.getSnapshots(mockExec)

      expect(result).toEqual([])
    })

    it('should use default limit when not specified', async () => {
      mockExec.mockResolvedValue({ stdout: '' })

      await jjClient.getSnapshots(mockExec)

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('--limit 10'))
    })
  })

  describe('restoreSnapshot', () => {
    it('should restore to specified snapshot', async () => {
      const snapshotId = 'abc123def'
      mockExec.mockResolvedValue({ stdout: `Working copy now at: ${snapshotId}\n` })

      const result = await jjClient.restoreSnapshot(mockExec, snapshotId)

      expect(result.success).toBe(true)
      expect(result.message).toContain(`Restored to snapshot ${snapshotId}`)
      expect(mockExec).toHaveBeenCalledWith(`jj edit ${snapshotId}`)
    })

    it('should handle restore failures', async () => {
      mockExec.mockRejectedValue(new Error('Invalid revision'))

      const result = await jjClient.restoreSnapshot(mockExec, 'invalid')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Failed to restore snapshot: Invalid revision')
    })
  })

  describe('undoLastSnapshot', () => {
    it('should undo the most recent snapshot', async () => {
      mockExec.mockResolvedValue({ stdout: 'Undid last operation\n' })

      const result = await jjClient.undoLastSnapshot(mockExec)

      expect(result.success).toBe(true)
      expect(result.message).toContain('Undid last snapshot')
      expect(mockExec).toHaveBeenCalledWith('jj undo')
    })

    it('should handle undo failures', async () => {
      mockExec.mockRejectedValue(new Error('Nothing to undo'))

      const result = await jjClient.undoLastSnapshot(mockExec)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Failed to undo snapshot: Nothing to undo')
    })
  })
})