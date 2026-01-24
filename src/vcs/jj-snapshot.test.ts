/**
 * Tests for JJ snapshot system - main tool call wrapper and orchestration
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import type {
  JJSnapshotSystem,
  JJSnapshot,
  SnapshotOptions,
  SnapshotContext,
  ToolCallWrapper,
  ChangesetManager,
  RepoCleaner
} from './types.js'

describe('JJSnapshotSystem', () => {
  let snapshotSystem: JJSnapshotSystem
  let mockChangesetManager: ChangesetManager
  let mockRepoCleaner: RepoCleaner
  let mockVcsModule: any

  const mockSnapshot: JJSnapshot = {
    id: 'snap-test-123',
    changeId: 'change-test-456',
    description: 'Test snapshot',
    timestamp: new Date('2024-01-01T12:00:00Z'),
    files: {
      modified: ['src/test.ts'],
      added: ['src/new.ts'],
      deleted: []
    },
    hasConflicts: false,
    isEmpty: false,
    bookmarks: ['main']
  }

  beforeEach(async () => {
    // Mock dependencies
    mockChangesetManager = {
      createChangeset: mock(() => Promise.resolve('new-change-123')),
      getCurrentChangeset: mock(() => Promise.resolve({
        changeId: 'current-change',
        shortId: 'current',
        description: 'Current change',
        author: 'Test <test@example.com>',
        timestamp: new Date(),
        isEmpty: false,
        hasConflicts: false,
        parentIds: [],
        files: { modified: [], added: [], deleted: [] }
      })),
      getChangeset: mock(() => Promise.resolve(null)),
      listChangesets: mock(() => Promise.resolve([])),
      editChangeset: mock(() => Promise.resolve()),
      abandonChangeset: mock(() => Promise.resolve()),
      squashChangeset: mock(() => Promise.resolve()),
      describeChangeset: mock(() => Promise.resolve()),
      getChangesetFiles: mock(() => Promise.resolve({ modified: [], added: [], deleted: [] })),
      createBookmark: mock(() => Promise.resolve()),
      deleteBookmark: mock(() => Promise.resolve())
    }

    mockRepoCleaner = {
      verifyCleanState: mock(() => Promise.resolve(true)),
      getRepoState: mock(() => Promise.resolve({
        isClean: true,
        currentChangeId: 'current-change',
        workingCopyChangeId: 'wc-change',
        bookmarks: ['main'],
        hasUncommittedChanges: false,
        conflictedFiles: [],
        untrackedFiles: [],
        modifiedFiles: [],
        stagedFiles: []
      })),
      cleanRepository: mock(() => Promise.resolve()),
      rollback: mock(() => Promise.resolve()),
      createRestorePoint: mock(() => Promise.resolve('restore-point-123')),
      validateRepository: mock(() => Promise.resolve(true)),
      getUntrackedFiles: mock(() => Promise.resolve([])),
      removeUntrackedFiles: mock(() => Promise.resolve())
    }

    mockVcsModule = {
      logSnapshot: mock(() => 'vcs-snap-id-123'),
      getSnapshots: mock(() => [])
    }

    const { createJJSnapshotSystem } = await import('./jj-snapshot.js')
    snapshotSystem = createJJSnapshotSystem({
      changesetManager: mockChangesetManager,
      repoCleaner: mockRepoCleaner,
      vcsModule: mockVcsModule,
      workingDir: '/test/repo'
    })
  })

  afterEach(() => {
    // Clean up mocks
    Object.values(mockChangesetManager).forEach(mockFn => {
      if (typeof mockFn === 'function' && mockFn.mockRestore) {
        mockFn.mockRestore()
      }
    })
  })

  describe('createSnapshot', () => {
    test('creates snapshot with default options', async () => {
      mockChangesetManager.getChangesetFiles.mockResolvedValueOnce({
        modified: ['src/file1.ts'],
        added: ['src/file2.ts'],
        deleted: ['src/old.ts']
      })

      const snapshot = await snapshotSystem.createSnapshot()

      expect(mockChangesetManager.createChangeset).toHaveBeenCalledWith(expect.stringContaining('Snapshot'))
      expect(mockVcsModule.logSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        change_id: 'new-change-123',
        description: expect.stringContaining('Snapshot')
      }))
      expect(snapshot.changeId).toBe('new-change-123')
    })

    test('creates snapshot with custom description', async () => {
      const options: SnapshotOptions = {
        description: 'Before refactoring auth system',
        includeUntracked: true,
        createBookmark: 'pre-refactor'
      }

      mockChangesetManager.getChangesetFiles.mockResolvedValueOnce({
        modified: ['src/auth.ts'],
        added: [],
        deleted: []
      })

      const snapshot = await snapshotSystem.createSnapshot(options)

      expect(mockChangesetManager.createChangeset).toHaveBeenCalledWith('Before refactoring auth system')
      expect(mockChangesetManager.createBookmark).toHaveBeenCalledWith('pre-refactor', 'new-change-123')
      expect(snapshot.description).toBe('Before refactoring auth system')
    })

    test('handles empty changeset when skipEmptyCommits is true', async () => {
      const options: SnapshotOptions = {
        skipEmptyCommits: true
      }

      mockChangesetManager.getChangesetFiles.mockResolvedValueOnce({
        modified: [],
        added: [],
        deleted: []
      })

      const snapshot = await snapshotSystem.createSnapshot(options)

      expect(snapshot.isEmpty).toBe(true)
      expect(mockVcsModule.logSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        files_modified: [],
        files_added: [],
        files_deleted: []
      }))
    })

    test('includes untracked files when specified', async () => {
      const options: SnapshotOptions = {
        includeUntracked: true
      }

      mockRepoCleaner.getUntrackedFiles.mockResolvedValueOnce(['temp.log', 'debug.txt'])
      mockChangesetManager.getChangesetFiles.mockResolvedValueOnce({
        modified: ['src/file.ts'],
        added: ['temp.log', 'debug.txt'],
        deleted: []
      })

      const snapshot = await snapshotSystem.createSnapshot(options)

      expect(mockRepoCleaner.getUntrackedFiles).toHaveBeenCalled()
      expect(snapshot.files.added).toContain('temp.log')
      expect(snapshot.files.added).toContain('debug.txt')
    })

    test('verifies clean state when required', async () => {
      const options: SnapshotOptions = {
        verifyCleanState: true
      }

      mockRepoCleaner.verifyCleanState.mockResolvedValueOnce(false)

      await expect(snapshotSystem.createSnapshot(options)).rejects.toThrow('Repository is not in clean state')
    })
  })

  describe('getSnapshot', () => {
    test('gets snapshot by change ID', async () => {
      const mockChangeset = {
        changeId: 'target-change-789',
        shortId: 'target',
        description: 'Target snapshot',
        author: 'Agent <agent@example.com>',
        timestamp: new Date(),
        isEmpty: false,
        hasConflicts: false,
        parentIds: ['parent-123'],
        bookmarks: ['feature'],
        files: { modified: ['src/target.ts'], added: [], deleted: [] }
      }

      mockChangesetManager.getChangeset.mockResolvedValueOnce(mockChangeset)

      const snapshot = await snapshotSystem.getSnapshot('target-change-789')

      expect(mockChangesetManager.getChangeset).toHaveBeenCalledWith('target-change-789')
      expect(snapshot?.changeId).toBe('target-change-789')
      expect(snapshot?.description).toBe('Target snapshot')
      expect(snapshot?.bookmarks).toEqual(['feature'])
    })

    test('returns null for non-existent snapshot', async () => {
      mockChangesetManager.getChangeset.mockResolvedValueOnce(null)

      const snapshot = await snapshotSystem.getSnapshot('non-existent')

      expect(snapshot).toBeNull()
    })
  })

  describe('listSnapshots', () => {
    test('lists recent snapshots with limit', async () => {
      const mockChangesets = [
        {
          changeId: 'snap1', shortId: 'snap1', description: 'First', author: 'Test',
          timestamp: new Date(), isEmpty: false, hasConflicts: false, parentIds: [],
          files: { modified: [], added: [], deleted: [] }
        },
        {
          changeId: 'snap2', shortId: 'snap2', description: 'Second', author: 'Test',
          timestamp: new Date(), isEmpty: false, hasConflicts: false, parentIds: [],
          files: { modified: [], added: [], deleted: [] }
        }
      ]

      mockChangesetManager.listChangesets.mockResolvedValueOnce(mockChangesets)

      const snapshots = await snapshotSystem.listSnapshots(10)

      expect(mockChangesetManager.listChangesets).toHaveBeenCalledWith(10)
      expect(snapshots).toHaveLength(2)
      expect(snapshots[0].changeId).toBe('snap1')
    })

    test('lists all snapshots when no limit', async () => {
      mockChangesetManager.listChangesets.mockResolvedValueOnce([])

      await snapshotSystem.listSnapshots()

      expect(mockChangesetManager.listChangesets).toHaveBeenCalledWith(undefined)
    })
  })

  describe('rollback', () => {
    test('rolls back to snapshot by JJSnapshot object', async () => {
      await snapshotSystem.rollback(mockSnapshot)

      expect(mockRepoCleaner.rollback).toHaveBeenCalledWith(mockSnapshot, undefined)
    })

    test('rolls back to snapshot by change ID string', async () => {
      await snapshotSystem.rollback('target-change-123')

      expect(mockRepoCleaner.rollback).toHaveBeenCalledWith('target-change-123', undefined)
    })

    test('rolls back with options', async () => {
      const options = { preserveBookmarks: true, cleanupIntermediate: true }

      await snapshotSystem.rollback(mockSnapshot, options)

      expect(mockRepoCleaner.rollback).toHaveBeenCalledWith(mockSnapshot, options)
    })
  })

  describe('wrapToolCall', () => {
    test('wraps successful tool call with snapshots', async () => {
      const mockToolFunction = mock(() => Promise.resolve('tool result'))

      const context: SnapshotContext = {
        executionId: 'exec-123',
        agentId: 'agent-456',
        taskId: 'task-789',
        toolName: 'Edit'
      }

      mockChangesetManager.getChangesetFiles
        .mockResolvedValueOnce({ modified: [], added: [], deleted: [] }) // before snapshot
        .mockResolvedValueOnce({ modified: ['src/edited.ts'], added: [], deleted: [] }) // after snapshot

      const result = await snapshotSystem.wrapToolCall('Edit', { file: 'test.ts' }, mockToolFunction, context)

      expect(mockToolFunction).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.result).toBe('tool result')
      expect(result.snapshotBefore).toBeDefined()
      expect(result.snapshotAfter).toBeDefined()
      expect(result.snapshotBefore?.description).toContain('Before Edit')
      expect(result.snapshotAfter?.description).toContain('After Edit')
    })

    test('handles tool call failure with rollback', async () => {
      const mockToolFunction = mock(() => Promise.reject(new Error('Tool failed')))

      const context: SnapshotContext = {
        executionId: 'exec-123',
        agentId: 'agent-456',
        taskId: 'task-789',
        toolName: 'Write'
      }

      const result = await snapshotSystem.wrapToolCall('Write', { content: 'test' }, mockToolFunction, context)

      expect(mockToolFunction).toHaveBeenCalled()
      expect(result.success).toBe(false)
      expect(result.error).toBe('Tool failed')
      expect(result.snapshotBefore).toBeDefined()
      expect(result.snapshotAfter).toBeUndefined()
      expect(mockRepoCleaner.rollback).toHaveBeenCalledWith(result.snapshotBefore)
    })

    test('skips snapshots for read-only tools', async () => {
      const mockToolFunction = mock(() => Promise.resolve('read result'))

      const context: SnapshotContext = {
        executionId: 'exec-123',
        agentId: 'agent-456',
        taskId: 'task-789',
        toolName: 'Read'
      }

      const result = await snapshotSystem.wrapToolCall('Read', { file: 'test.ts' }, mockToolFunction, context)

      expect(mockToolFunction).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.result).toBe('read result')
      expect(result.snapshotBefore).toBeUndefined()
      expect(result.snapshotAfter).toBeUndefined()
      expect(mockChangesetManager.createChangeset).not.toHaveBeenCalled()
    })

    test('includes context in snapshot metadata', async () => {
      const mockToolFunction = mock(() => Promise.resolve('result'))

      const context: SnapshotContext = {
        executionId: 'exec-123',
        agentId: 'agent-456',
        taskId: 'task-789',
        toolName: 'Edit',
        snapshotId: 'custom-snap-id'
      }

      await snapshotSystem.wrapToolCall('Edit', { file: 'test.ts' }, mockToolFunction, context)

      expect(mockVcsModule.logSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        smithers_metadata: expect.objectContaining({
          execution_id: 'exec-123',
          agent_id: 'agent-456',
          task_id: 'task-789',
          tool_name: 'Edit'
        })
      }))
    })
  })

  describe('cleanup', () => {
    test('cleans up old snapshots beyond retention limit', async () => {
      const oldSnapshots = Array.from({ length: 15 }, (_, i) => ({
        changeId: `old-snap-${i}`,
        shortId: `old-${i}`,
        description: `Old snapshot ${i}`,
        author: 'Test',
        timestamp: new Date(Date.now() - (i + 1) * 86400000), // i+1 days ago
        isEmpty: false,
        hasConflicts: false,
        parentIds: [],
        files: { modified: [], added: [], deleted: [] }
      }))

      mockChangesetManager.listChangesets.mockResolvedValueOnce(oldSnapshots)

      await snapshotSystem.cleanup({ maxSnapshots: 10 })

      // Should abandon the oldest 5 snapshots
      expect(mockChangesetManager.abandonChangeset).toHaveBeenCalledTimes(5)
      expect(mockChangesetManager.abandonChangeset).toHaveBeenCalledWith('old-snap-10')
      expect(mockChangesetManager.abandonChangeset).toHaveBeenCalledWith('old-snap-14')
    })

    test('cleans up snapshots older than retention period', async () => {
      const oldTimestamp = new Date(Date.now() - 8 * 86400000) // 8 days ago
      const oldSnapshots = [
        {
          changeId: 'old-snap',
          shortId: 'old',
          description: 'Old snapshot',
          author: 'Test',
          timestamp: oldTimestamp,
          isEmpty: false,
          hasConflicts: false,
          parentIds: [],
          files: { modified: [], added: [], deleted: [] }
        }
      ]

      mockChangesetManager.listChangesets.mockResolvedValueOnce(oldSnapshots)

      await snapshotSystem.cleanup({ maxAgeInDays: 7 })

      expect(mockChangesetManager.abandonChangeset).toHaveBeenCalledWith('old-snap')
    })

    test('does not clean up recent snapshots', async () => {
      const recentSnapshots = [
        {
          changeId: 'recent-snap',
          shortId: 'recent',
          description: 'Recent snapshot',
          author: 'Test',
          timestamp: new Date(Date.now() - 3600000), // 1 hour ago
          isEmpty: false,
          hasConflicts: false,
          parentIds: [],
          files: { modified: [], added: [], deleted: [] }
        }
      ]

      mockChangesetManager.listChangesets.mockResolvedValueOnce(recentSnapshots)

      await snapshotSystem.cleanup({ maxAgeInDays: 7, maxSnapshots: 10 })

      expect(mockChangesetManager.abandonChangeset).not.toHaveBeenCalled()
    })
  })

  describe('integration and error handling', () => {
    test('handles changeset manager failures', async () => {
      mockChangesetManager.createChangeset.mockRejectedValueOnce(new Error('JJ command failed'))

      await expect(snapshotSystem.createSnapshot()).rejects.toThrow('JJ command failed')
    })

    test('handles repo cleaner failures', async () => {
      mockRepoCleaner.verifyCleanState.mockRejectedValueOnce(new Error('Cannot verify state'))

      await expect(snapshotSystem.createSnapshot({ verifyCleanState: true }))
        .rejects.toThrow('Cannot verify state')
    })

    test('handles VCS module failures', async () => {
      mockVcsModule.logSnapshot.mockImplementationOnce(() => {
        throw new Error('Database error')
      })

      await expect(snapshotSystem.createSnapshot()).rejects.toThrow('Database error')
    })

    test('validates input parameters', async () => {
      await expect(snapshotSystem.getSnapshot('')).rejects.toThrow('Change ID cannot be empty')

      await expect(snapshotSystem.listSnapshots(-1)).rejects.toThrow('Limit must be positive')
    })
  })

  describe('configuration and options', () => {
    test('uses read-only tool list for skipping snapshots', async () => {
      const readOnlyTools = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']

      for (const toolName of readOnlyTools) {
        const mockTool = mock(() => Promise.resolve('result'))
        const context: SnapshotContext = {
          executionId: 'exec-123',
          agentId: 'agent-456',
          toolName
        }

        const result = await snapshotSystem.wrapToolCall(toolName, {}, mockTool, context)

        expect(result.snapshotBefore).toBeUndefined()
        expect(result.snapshotAfter).toBeUndefined()
      }
    })

    test('creates snapshots for write tools', async () => {
      const writeTools = ['Edit', 'Write', 'Bash', 'NotebookEdit']

      for (const toolName of writeTools) {
        const mockTool = mock(() => Promise.resolve('result'))
        const context: SnapshotContext = {
          executionId: 'exec-123',
          agentId: 'agent-456',
          toolName
        }

        mockChangesetManager.getChangesetFiles.mockResolvedValue({
          modified: [], added: [], deleted: []
        })

        const result = await snapshotSystem.wrapToolCall(toolName, {}, mockTool, context)

        expect(result.snapshotBefore).toBeDefined()
        expect(result.snapshotAfter).toBeDefined()
      }
    })
  })
})