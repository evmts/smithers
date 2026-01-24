import { describe, test, expect, beforeEach, mock } from 'bun:test'
import type {
  ToolSnapshotWrapper,
  ToolCallResult,
  SnapshotOptions,
  ToolExecutionContext
} from './tool-snapshot.js'

describe('ToolSnapshotWrapper', () => {
  let wrapper: ToolSnapshotWrapper
  let mockSnapshotSystem: any
  let mockRepoStateTracker: any
  let mockLogger: any

  const mockContext: ToolExecutionContext = {
    executionId: 'exec-123',
    agentId: 'agent-456',
    taskId: 'task-789',
    toolName: 'Edit',
    userId: 'user-abc',
    sessionId: 'session-def'
  }

  beforeEach(async () => {
    mockSnapshotSystem = {
      createSnapshot: mock(() => Promise.resolve({
        id: 'snap-123',
        changeId: 'change-abc',
        description: 'Before Edit tool',
        timestamp: new Date(),
        files: { modified: [], added: [], deleted: [] },
        isEmpty: false,
        hasConflicts: false
      })),
      rollback: mock(() => Promise.resolve()),
      listSnapshots: mock(() => Promise.resolve([])),
      cleanup: mock(() => Promise.resolve())
    }

    mockRepoStateTracker = {
      getCurrentState: mock(() => Promise.resolve({
        isClean: true,
        currentChangeId: 'current-123',
        workingCopyChangeId: 'wc-456',
        hasUncommittedChanges: false,
        conflictedFiles: [],
        modifiedFiles: []
      })),
      isCleanState: mock((state) => state.isClean)
    }

    mockLogger = {
      debug: mock(),
      info: mock(),
      warn: mock(),
      error: mock()
    }

    const { createToolSnapshotWrapper } = await import('./tool-snapshot.js')
    wrapper = createToolSnapshotWrapper({
      snapshotSystem: mockSnapshotSystem,
      repoStateTracker: mockRepoStateTracker,
      logger: mockLogger
    })
  })

  describe('wrapTool', () => {
    test('wraps successful tool execution with snapshots', async () => {
      const mockTool = mock(() => Promise.resolve('tool result'))

      const result = await wrapper.wrapTool('Edit', { file: 'test.ts' }, mockTool, mockContext)

      expect(mockSnapshotSystem.createSnapshot).toHaveBeenCalledTimes(2)
      expect(mockSnapshotSystem.createSnapshot).toHaveBeenNthCalledWith(1, {
        description: 'Before Edit tool execution',
        context: mockContext,
        includeUntracked: false
      })
      expect(mockSnapshotSystem.createSnapshot).toHaveBeenNthCalledWith(2, {
        description: 'After Edit tool execution',
        context: mockContext,
        includeUntracked: false
      })

      expect(mockTool).toHaveBeenCalledWith({ file: 'test.ts' })
      expect(result.success).toBe(true)
      expect(result.result).toBe('tool result')
      expect(result.snapshotBefore).toBeDefined()
      expect(result.snapshotAfter).toBeDefined()
    })

    test('handles tool execution failure with rollback', async () => {
      const mockTool = mock(() => Promise.reject(new Error('Tool execution failed')))

      const result = await wrapper.wrapTool('Write', { content: 'test' }, mockTool, mockContext)

      expect(mockSnapshotSystem.createSnapshot).toHaveBeenCalledTimes(1) // Only before snapshot
      expect(mockSnapshotSystem.rollback).toHaveBeenCalledWith(result.snapshotBefore)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Tool execution failed')
      expect(result.snapshotBefore).toBeDefined()
      expect(result.snapshotAfter).toBeUndefined()
      expect(result.rolledBack).toBe(true)
    })

    test('skips snapshots for read-only tools', async () => {
      const mockTool = mock(() => Promise.resolve('read result'))
      const readOnlyContext = { ...mockContext, toolName: 'Read' }

      const result = await wrapper.wrapTool('Read', { file: 'test.ts' }, mockTool, readOnlyContext)

      expect(mockSnapshotSystem.createSnapshot).not.toHaveBeenCalled()
      expect(mockTool).toHaveBeenCalledWith({ file: 'test.ts' })

      expect(result.success).toBe(true)
      expect(result.result).toBe('read result')
      expect(result.snapshotBefore).toBeUndefined()
      expect(result.snapshotAfter).toBeUndefined()
    })

    test('handles custom snapshot options', async () => {
      const mockTool = mock(() => Promise.resolve('result'))
      const options: SnapshotOptions = {
        includeUntracked: true,
        verifyCleanState: true,
        createBookmark: 'before-edit'
      }

      await wrapper.wrapTool('Edit', { file: 'test.ts' }, mockTool, mockContext, options)

      expect(mockSnapshotSystem.createSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          includeUntracked: true,
          verifyCleanState: true,
          createBookmark: 'before-edit'
        })
      )
    })

    test('verifies clean state when required', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        isClean: false,
        hasUncommittedChanges: true,
        modifiedFiles: ['dirty.ts']
      })

      const mockTool = mock(() => Promise.resolve('result'))
      const options: SnapshotOptions = { verifyCleanState: true }

      await expect(
        wrapper.wrapTool('Edit', {}, mockTool, mockContext, options)
      ).rejects.toThrow('Repository is not in clean state')

      expect(mockTool).not.toHaveBeenCalled()
      expect(mockSnapshotSystem.createSnapshot).not.toHaveBeenCalled()
    })

    test('handles snapshot creation failures', async () => {
      mockSnapshotSystem.createSnapshot.mockRejectedValueOnce(new Error('Snapshot failed'))
      const mockTool = mock(() => Promise.resolve('result'))

      const result = await wrapper.wrapTool('Edit', {}, mockTool, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to create before snapshot: Snapshot failed')
      expect(mockTool).not.toHaveBeenCalled()
    })

    test('handles rollback failures', async () => {
      const mockTool = mock(() => Promise.reject(new Error('Tool failed')))
      mockSnapshotSystem.rollback.mockRejectedValueOnce(new Error('Rollback failed'))

      const result = await wrapper.wrapTool('Edit', {}, mockTool, mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Tool failed')
      expect(result.rollbackError).toBe('Rollback failed')
      expect(result.rolledBack).toBe(false)
    })

    test('logs execution details', async () => {
      const mockTool = mock(() => Promise.resolve('result'))

      await wrapper.wrapTool('Edit', { file: 'test.ts' }, mockTool, mockContext)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Tool execution wrapped with snapshots',
        expect.objectContaining({
          toolName: 'Edit',
          executionId: 'exec-123',
          success: true
        })
      )
    })
  })

  describe('isReadOnlyTool', () => {
    test('identifies read-only tools correctly', () => {
      const readOnlyTools = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TaskOutput']

      for (const toolName of readOnlyTools) {
        expect(wrapper.isReadOnlyTool(toolName)).toBe(true)
      }
    })

    test('identifies write tools correctly', () => {
      const writeTools = ['Edit', 'Write', 'Bash', 'NotebookEdit', 'Task']

      for (const toolName of writeTools) {
        expect(wrapper.isReadOnlyTool(toolName)).toBe(false)
      }
    })

    test('defaults to write tool for unknown tools', () => {
      expect(wrapper.isReadOnlyTool('UnknownTool')).toBe(false)
    })
  })

  describe('getExecutionMetrics', () => {
    test('tracks execution metrics', async () => {
      const mockTool = mock(() => Promise.resolve('result'))

      await wrapper.wrapTool('Edit', {}, mockTool, mockContext)
      await wrapper.wrapTool('Read', {}, mockTool, { ...mockContext, toolName: 'Read' })

      const metrics = wrapper.getExecutionMetrics()

      expect(metrics.totalExecutions).toBe(2)
      expect(metrics.successfulExecutions).toBe(2)
      expect(metrics.failedExecutions).toBe(0)
      expect(metrics.snapshotsCreated).toBe(2) // Only Edit creates snapshots
      expect(metrics.rollbacks).toBe(0)
    })

    test('tracks execution failures', async () => {
      const mockTool = mock(() => Promise.reject(new Error('Tool failed')))

      await wrapper.wrapTool('Edit', {}, mockTool, mockContext)

      const metrics = wrapper.getExecutionMetrics()

      expect(metrics.totalExecutions).toBe(1)
      expect(metrics.successfulExecutions).toBe(0)
      expect(metrics.failedExecutions).toBe(1)
      expect(metrics.rollbacks).toBe(1)
    })

    test('tracks tool usage by type', async () => {
      const mockTool = mock(() => Promise.resolve('result'))

      await wrapper.wrapTool('Edit', {}, mockTool, mockContext)
      await wrapper.wrapTool('Edit', {}, mockTool, mockContext)
      await wrapper.wrapTool('Read', {}, mockTool, { ...mockContext, toolName: 'Read' })

      const metrics = wrapper.getExecutionMetrics()

      expect(metrics.toolUsage).toEqual({
        'Edit': 2,
        'Read': 1
      })
    })
  })

  describe('cleanup and maintenance', () => {
    test('performs periodic cleanup', async () => {
      await wrapper.performCleanup({ maxSnapshots: 10, maxAgeInDays: 7 })

      expect(mockSnapshotSystem.cleanup).toHaveBeenCalledWith({
        maxSnapshots: 10,
        maxAgeInDays: 7
      })
    })

    test('gets health status', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        isClean: true,
        conflictedFiles: [],
        hasUncommittedChanges: false
      })

      const health = await wrapper.getHealthStatus()

      expect(health).toEqual({
        isHealthy: true,
        repoState: 'clean',
        lastExecution: expect.any(Date),
        pendingSnapshots: 0,
        issues: []
      })
    })

    test('detects unhealthy repository state', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        isClean: false,
        conflictedFiles: ['conflict.ts'],
        hasUncommittedChanges: true
      })

      const health = await wrapper.getHealthStatus()

      expect(health.isHealthy).toBe(false)
      expect(health.repoState).toBe('dirty')
      expect(health.issues).toContain('Repository has conflicted files')
      expect(health.issues).toContain('Repository has uncommitted changes')
    })
  })

  describe('error handling and recovery', () => {
    test('handles concurrent tool executions', async () => {
      const mockTool = mock(() => Promise.resolve('result'))

      const promises = [
        wrapper.wrapTool('Edit', { file: '1.ts' }, mockTool, { ...mockContext, executionId: 'exec-1' }),
        wrapper.wrapTool('Edit', { file: '2.ts' }, mockTool, { ...mockContext, executionId: 'exec-2' }),
        wrapper.wrapTool('Edit', { file: '3.ts' }, mockTool, { ...mockContext, executionId: 'exec-3' })
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      expect(results.every(r => r.success)).toBe(true)
    })

    test('handles timeout during tool execution', async () => {
      const mockTool = mock(() => new Promise(resolve =>
        setTimeout(() => resolve('delayed result'), 5000)
      ))

      const result = await wrapper.wrapTool('Edit', {}, mockTool, mockContext, { timeout: 1000 })

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })

    test('preserves execution context in snapshots', async () => {
      const mockTool = mock(() => Promise.resolve('result'))

      await wrapper.wrapTool('Edit', {}, mockTool, mockContext)

      expect(mockSnapshotSystem.createSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          context: mockContext
        })
      )
    })

    test('handles invalid tool parameters', async () => {
      const mockTool = mock(() => Promise.resolve('result'))

      await expect(
        wrapper.wrapTool('', {}, mockTool, mockContext)
      ).rejects.toThrow('Tool name cannot be empty')

      await expect(
        wrapper.wrapTool('Edit', {}, mockTool, { ...mockContext, executionId: '' })
      ).rejects.toThrow('Execution ID cannot be empty')
    })
  })

  describe('integration with snapshot system', () => {
    test('forwards snapshot options correctly', async () => {
      const mockTool = mock(() => Promise.resolve('result'))
      const options: SnapshotOptions = {
        description: 'Custom snapshot',
        includeUntracked: true,
        createBookmark: 'test-bookmark',
        skipEmptyCommits: true
      }

      await wrapper.wrapTool('Edit', {}, mockTool, mockContext, options)

      expect(mockSnapshotSystem.createSnapshot).toHaveBeenCalledWith(
        expect.objectContaining(options)
      )
    })

    test('generates meaningful snapshot descriptions', async () => {
      const mockTool = mock(() => Promise.resolve('result'))

      await wrapper.wrapTool('Bash', { command: 'npm install' }, mockTool, mockContext)

      expect(mockSnapshotSystem.createSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Before Bash tool execution'
        })
      )

      expect(mockSnapshotSystem.createSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'After Bash tool execution'
        })
      )
    })

    test('handles empty snapshot results', async () => {
      mockSnapshotSystem.createSnapshot
        .mockResolvedValueOnce({
          id: 'snap-before',
          isEmpty: true,
          changeId: 'empty-before'
        })
        .mockResolvedValueOnce({
          id: 'snap-after',
          isEmpty: true,
          changeId: 'empty-after'
        })

      const mockTool = mock(() => Promise.resolve('no changes'))

      const result = await wrapper.wrapTool('Edit', {}, mockTool, mockContext)

      expect(result.success).toBe(true)
      expect(result.snapshotBefore?.isEmpty).toBe(true)
      expect(result.snapshotAfter?.isEmpty).toBe(true)
    })
  })
})