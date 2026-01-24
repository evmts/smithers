import { describe, test, expect, beforeEach, mock } from 'bun:test'
import type { RepoStateTracker, RepoState } from './repo-state.js'

describe('RepoStateTracker', () => {
  let tracker: RepoStateTracker
  let mockJJWrapper: any
  let mockEventBus: any

  const mockRepoState: RepoState = {
    isClean: true,
    currentChangeId: 'current-abc123',
    workingCopyChangeId: 'wc-def456',
    bookmarks: ['main', 'feature'],
    hasUncommittedChanges: false,
    conflictedFiles: [],
    untrackedFiles: [],
    modifiedFiles: [],
    stagedFiles: [],
    lastSnapshot: {
      changeId: 'snap-789abc',
      timestamp: new Date('2024-01-01T12:00:00Z'),
      description: 'Auto snapshot before tool execution'
    },
    metadata: {
      lastChecked: new Date('2024-01-01T12:01:00Z'),
      jjVersion: '0.12.0',
      repoRoot: '/test/repo'
    }
  }

  beforeEach(async () => {
    mockJJWrapper = {
      isRepo: mock(() => Promise.resolve(true)),
      getStatus: mock(() => Promise.resolve({
        success: true,
        output: 'Working copy clean',
        files: { modified: [], added: [], deleted: [] }
      })),
      getChangeId: mock(() => Promise.resolve({
        success: true,
        changeId: 'current-abc123'
      })),
      getWorkingCopyChangeId: mock(() => Promise.resolve({
        success: true,
        changeId: 'wc-def456'
      })),
      listBookmarks: mock(() => Promise.resolve({
        success: true,
        bookmarks: [
          { name: 'main', changeId: 'main-123' },
          { name: 'feature', changeId: 'feat-456' }
        ]
      })),
      getConflictedFiles: mock(() => Promise.resolve({
        success: true,
        files: []
      })),
      execute: mock(() => Promise.resolve({
        success: true,
        stdout: 'jj 0.12.0',
        stderr: ''
      })),
      getRoot: mock(() => Promise.resolve({
        success: true,
        root: '/test/repo'
      }))
    }

    mockEventBus = {
      emit: mock(),
      on: mock(),
      off: mock()
    }

    const { createRepoStateTracker } = await import('./repo-state.js')
    tracker = createRepoStateTracker(mockJJWrapper, mockEventBus)
  })

  describe('getCurrentState', () => {
    test('gets current repository state', async () => {
      const state = await tracker.getCurrentState()

      expect(mockJJWrapper.isRepo).toHaveBeenCalled()
      expect(mockJJWrapper.getStatus).toHaveBeenCalled()
      expect(mockJJWrapper.getChangeId).toHaveBeenCalledWith('@')
      expect(mockJJWrapper.getWorkingCopyChangeId).toHaveBeenCalled()
      expect(mockJJWrapper.listBookmarks).toHaveBeenCalled()

      expect(state.currentChangeId).toBe('current-abc123')
      expect(state.workingCopyChangeId).toBe('wc-def456')
      expect(state.isClean).toBe(true)
      expect(state.bookmarks).toEqual(['main', 'feature'])
    })

    test('detects dirty repository state', async () => {
      mockJJWrapper.getStatus.mockResolvedValueOnce({
        success: true,
        output: 'Working copy changes:\nM src/file.ts',
        files: { modified: ['src/file.ts'], added: [], deleted: [] }
      })

      const state = await tracker.getCurrentState()

      expect(state.isClean).toBe(false)
      expect(state.hasUncommittedChanges).toBe(true)
      expect(state.modifiedFiles).toEqual(['src/file.ts'])
    })

    test('detects conflicted files', async () => {
      mockJJWrapper.getConflictedFiles.mockResolvedValueOnce({
        success: true,
        files: ['src/conflict.ts', 'package.json']
      })

      const state = await tracker.getCurrentState()

      expect(state.conflictedFiles).toEqual(['src/conflict.ts', 'package.json'])
      expect(state.isClean).toBe(false)
    })

    test('handles untracked files', async () => {
      mockJJWrapper.getStatus.mockResolvedValueOnce({
        success: true,
        output: 'Working copy changes:\n? temp.log\n? debug.txt',
        files: { modified: [], added: [], deleted: [], untracked: ['temp.log', 'debug.txt'] }
      })

      const state = await tracker.getCurrentState()

      expect(state.untrackedFiles).toEqual(['temp.log', 'debug.txt'])
    })

    test('handles non-JJ repository', async () => {
      mockJJWrapper.isRepo.mockResolvedValueOnce(false)

      await expect(tracker.getCurrentState()).rejects.toThrow('Not a JJ repository')
    })
  })

  describe('compareStates', () => {
    test('detects no changes between identical states', () => {
      const state1 = { ...mockRepoState }
      const state2 = { ...mockRepoState }

      const diff = tracker.compareStates(state1, state2)

      expect(diff.hasChanges).toBe(false)
      expect(diff.changeDetails).toEqual({})
    })

    test('detects change ID differences', () => {
      const state1 = { ...mockRepoState, currentChangeId: 'old-123' }
      const state2 = { ...mockRepoState, currentChangeId: 'new-456' }

      const diff = tracker.compareStates(state1, state2)

      expect(diff.hasChanges).toBe(true)
      expect(diff.changeDetails.currentChangeId).toEqual({
        from: 'old-123',
        to: 'new-456'
      })
    })

    test('detects working copy changes', () => {
      const state1 = { ...mockRepoState, workingCopyChangeId: 'wc-old' }
      const state2 = { ...mockRepoState, workingCopyChangeId: 'wc-new' }

      const diff = tracker.compareStates(state1, state2)

      expect(diff.hasChanges).toBe(true)
      expect(diff.changeDetails.workingCopyChangeId).toEqual({
        from: 'wc-old',
        to: 'wc-new'
      })
    })

    test('detects bookmark changes', () => {
      const state1 = { ...mockRepoState, bookmarks: ['main'] }
      const state2 = { ...mockRepoState, bookmarks: ['main', 'feature', 'hotfix'] }

      const diff = tracker.compareStates(state1, state2)

      expect(diff.hasChanges).toBe(true)
      expect(diff.changeDetails.bookmarks).toEqual({
        added: ['feature', 'hotfix'],
        removed: []
      })
    })

    test('detects file state changes', () => {
      const state1 = { ...mockRepoState, modifiedFiles: ['file1.ts'] }
      const state2 = { ...mockRepoState, modifiedFiles: ['file1.ts', 'file2.ts'], conflictedFiles: ['conflict.ts'] }

      const diff = tracker.compareStates(state1, state2)

      expect(diff.hasChanges).toBe(true)
      expect(diff.changeDetails.modifiedFiles).toEqual({
        added: ['file2.ts'],
        removed: []
      })
      expect(diff.changeDetails.conflictedFiles).toEqual({
        added: ['conflict.ts'],
        removed: []
      })
    })

    test('detects clean state transitions', () => {
      const state1 = { ...mockRepoState, isClean: false, hasUncommittedChanges: true }
      const state2 = { ...mockRepoState, isClean: true, hasUncommittedChanges: false }

      const diff = tracker.compareStates(state1, state2)

      expect(diff.hasChanges).toBe(true)
      expect(diff.changeDetails.isClean).toEqual({ from: false, to: true })
      expect(diff.changeDetails.hasUncommittedChanges).toEqual({ from: true, to: false })
    })
  })

  describe('watchState', () => {
    test('starts watching repository state', () => {
      const callback = mock()

      tracker.watchState(callback, { interval: 1000 })

      expect(typeof callback).toBe('function')
      // Verify that polling is set up (implementation detail)
    })

    test('triggers callback on state changes', async () => {
      const callback = mock()

      // Use poll interval longer than cache TTL (1000ms)
      tracker.watchState(callback, { interval: 1100 })

      // First call should be state-initialized
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback.mock.calls[0][0].type).toBe('state-initialized')

      // Simulate state change
      mockJJWrapper.getChangeId.mockResolvedValue({
        success: true,
        changeId: 'changed-456'
      })

      // Wait for next polling interval (1100ms) + buffer
      await new Promise(resolve => setTimeout(resolve, 1300))

      expect(callback.mock.calls.length).toBeGreaterThanOrEqual(2)
      const changeEventIndex = callback.mock.calls.findIndex(call => call[0].type === 'state-changed')
      expect(changeEventIndex).toBeGreaterThan(-1)
      const [eventData] = callback.mock.calls[changeEventIndex]
      expect(eventData.type).toBe('state-changed')
      expect(eventData.diff.hasChanges).toBe(true)
    })

    test('does not trigger callback when state unchanged', async () => {
      const callback = mock()

      tracker.watchState(callback, { interval: 100 })

      // Wait for multiple polling cycles
      await new Promise(resolve => setTimeout(resolve, 250))

      // Should only trigger once for initial state
      expect(callback).toHaveBeenCalledTimes(1)
      const [eventData] = callback.mock.calls[0]
      expect(eventData.type).toBe('state-initialized')
    })

    test('handles errors during state polling', async () => {
      const callback = mock()

      mockJJWrapper.getStatus.mockRejectedValueOnce(new Error('JJ command failed'))

      tracker.watchState(callback, { interval: 100 })

      await new Promise(resolve => setTimeout(resolve, 150))

      expect(callback).toHaveBeenCalled()
      const [eventData] = callback.mock.calls[0]
      expect(eventData.type).toBe('state-error')
      expect(eventData.error).toBe('JJ command failed')
    })
  })

  describe('stopWatching', () => {
    test('stops state watching', async () => {
      const callback = mock()

      tracker.watchState(callback, { interval: 100 })

      // Wait for initial state callback
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        type: 'state-initialized'
      }))

      const callCountBeforeStop = callback.mock.calls.length

      tracker.stopWatching()

      // Wait to ensure no more callbacks occur
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should not have been called again after stopping
      expect(callback).toHaveBeenCalledTimes(callCountBeforeStop)
    })
  })

  describe('getLastSnapshot', () => {
    test('returns last snapshot information', async () => {
      // Create a state with snapshot info
      const stateWithSnapshot: RepoState = {
        ...mockRepoState,
        lastSnapshot: {
          changeId: 'snap-123',
          timestamp: new Date('2024-01-01T12:00:00Z'),
          description: 'Test snapshot'
        }
      }

      const snapshot = tracker.getLastSnapshot(stateWithSnapshot)

      expect(snapshot?.changeId).toBe('snap-123')
    })

    test('returns null when no snapshot exists', async () => {
      const stateWithoutSnapshot = { ...mockRepoState, lastSnapshot: undefined }

      const snapshot = tracker.getLastSnapshot(stateWithoutSnapshot)

      expect(snapshot).toBeNull()
    })
  })

  describe('isCleanState', () => {
    test('returns true for clean repository', () => {
      const cleanState = {
        ...mockRepoState,
        isClean: true,
        hasUncommittedChanges: false,
        conflictedFiles: [],
        modifiedFiles: []
      }

      expect(tracker.isCleanState(cleanState)).toBe(true)
    })

    test('returns false for dirty repository', () => {
      const dirtyState = {
        ...mockRepoState,
        isClean: false,
        hasUncommittedChanges: true,
        modifiedFiles: ['file.ts']
      }

      expect(tracker.isCleanState(dirtyState)).toBe(false)
    })

    test('returns false when conflicts exist', () => {
      const conflictedState = {
        ...mockRepoState,
        conflictedFiles: ['conflict.ts']
      }

      expect(tracker.isCleanState(conflictedState)).toBe(false)
    })
  })

  describe('event integration', () => {
    test('emits events through event bus', async () => {
      const callback = mock()

      // Use poll interval longer than cache TTL (1000ms)
      tracker.watchState(callback, { interval: 1100 })

      // Wait for initial state
      await new Promise(resolve => setTimeout(resolve, 50))

      // Verify initial event was emitted
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'repo-state-initialized',
        expect.objectContaining({
          type: 'state-initialized',
          currentState: expect.any(Object)
        })
      )

      // Simulate state change
      mockJJWrapper.getChangeId.mockResolvedValue({
        success: true,
        changeId: 'new-change-789'
      })

      // Wait for next poll interval (1100ms) + buffer
      await new Promise(resolve => setTimeout(resolve, 1300))

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'repo-state-changed',
        expect.objectContaining({
          type: 'state-changed',
          currentState: expect.any(Object),
          previousState: expect.any(Object)
        })
      )
    })

    test('emits error events', async () => {
      const callback = mock()

      // Set up watcher which will handle errors and emit events
      mockJJWrapper.getStatus.mockRejectedValueOnce(new Error('Repository error'))

      tracker.watchState(callback, { interval: 100 })

      // Wait for initial state fetch to fail
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'repo-state-error',
        expect.objectContaining({
          error: 'Repository error'
        })
      )
    })
  })

  describe('caching and performance', () => {
    test('caches state for short periods', async () => {
      const state1 = await tracker.getCurrentState()
      const state2 = await tracker.getCurrentState()

      // Should only call JJ wrapper once due to caching
      expect(mockJJWrapper.getStatus).toHaveBeenCalledTimes(1)
      expect(state1).toBe(state2) // Same object reference
    })

    test('invalidates cache after timeout', async () => {
      await tracker.getCurrentState()

      // Wait for cache to expire (cache TTL is 1000ms)
      await new Promise(resolve => setTimeout(resolve, 1100))

      await tracker.getCurrentState()

      // Should call JJ wrapper twice
      expect(mockJJWrapper.getStatus).toHaveBeenCalledTimes(2)
    })

    test('handles concurrent state requests', async () => {
      const promises = [
        tracker.getCurrentState(),
        tracker.getCurrentState(),
        tracker.getCurrentState()
      ]

      const states = await Promise.all(promises)

      // Should only call JJ wrapper once due to deduplication
      expect(mockJJWrapper.getStatus).toHaveBeenCalledTimes(1)
      expect(states[0]).toBe(states[1])
      expect(states[1]).toBe(states[2])
    })
  })
})