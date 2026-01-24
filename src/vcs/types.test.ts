/**
 * Tests for VCS snapshot system types and interfaces
 */

import { describe, test, expect } from 'bun:test'
import type {
  JJSnapshot,
  ChangesetInfo,
  RepoState,
  SnapshotOptions,
  ToolCallWrapper,
  SnapshotContext
} from './types.js'

describe('VCS Types', () => {
  describe('JJSnapshot interface', () => {
    test('has required fields', () => {
      const snapshot: JJSnapshot = {
        id: 'snap-1',
        changeId: 'abc123def456',
        description: 'Feature implementation snapshot',
        timestamp: new Date(),
        parentChangeId: 'parent-abc123',
        files: {
          modified: ['src/feature.ts'],
          added: ['src/new-file.ts'],
          deleted: ['src/old-file.ts']
        },
        hasConflicts: false,
        isEmpty: false,
        bookmarks: ['main', 'feature/test']
      }

      expect(snapshot.id).toBe('snap-1')
      expect(snapshot.changeId).toBe('abc123def456')
      expect(snapshot.description).toBe('Feature implementation snapshot')
      expect(snapshot.timestamp).toBeInstanceOf(Date)
      expect(snapshot.parentChangeId).toBe('parent-abc123')
      expect(snapshot.files.modified).toEqual(['src/feature.ts'])
      expect(snapshot.files.added).toEqual(['src/new-file.ts'])
      expect(snapshot.files.deleted).toEqual(['src/old-file.ts'])
      expect(snapshot.hasConflicts).toBe(false)
      expect(snapshot.isEmpty).toBe(false)
      expect(snapshot.bookmarks).toEqual(['main', 'feature/test'])
    })

    test('allows optional fields', () => {
      const minimalSnapshot: JJSnapshot = {
        id: 'snap-2',
        changeId: 'minimal123',
        description: 'Minimal snapshot',
        timestamp: new Date(),
        files: {
          modified: [],
          added: [],
          deleted: []
        },
        hasConflicts: false,
        isEmpty: true
      }

      expect(minimalSnapshot.parentChangeId).toBeUndefined()
      expect(minimalSnapshot.bookmarks).toBeUndefined()
    })
  })

  describe('ChangesetInfo interface', () => {
    test('has complete changeset information', () => {
      const changeset: ChangesetInfo = {
        changeId: 'change-abc123',
        shortId: 'abc123',
        description: 'Add user authentication',
        author: 'Claude Agent <claude@anthropic.com>',
        timestamp: new Date(),
        isEmpty: false,
        hasConflicts: false,
        parentIds: ['parent1', 'parent2'],
        bookmarks: ['feature/auth'],
        files: {
          modified: ['src/auth.ts', 'src/types.ts'],
          added: ['src/middleware/auth.ts'],
          deleted: ['src/legacy-auth.ts']
        },
        commitHash: 'git-abc123def456'
      }

      expect(changeset.changeId).toBe('change-abc123')
      expect(changeset.shortId).toBe('abc123')
      expect(changeset.description).toBe('Add user authentication')
      expect(changeset.author).toBe('Claude Agent <claude@anthropic.com>')
      expect(changeset.isEmpty).toBe(false)
      expect(changeset.hasConflicts).toBe(false)
      expect(changeset.parentIds).toEqual(['parent1', 'parent2'])
      expect(changeset.bookmarks).toEqual(['feature/auth'])
      expect(changeset.commitHash).toBe('git-abc123def456')
    })
  })

  describe('RepoState interface', () => {
    test('captures complete repository state', () => {
      const repoState: RepoState = {
        isClean: true,
        currentChangeId: 'current-abc123',
        workingCopyChangeId: 'wc-abc123',
        bookmarks: ['main', 'feature/test'],
        hasUncommittedChanges: false,
        conflictedFiles: [],
        untrackedFiles: ['temp.txt', 'notes.md'],
        modifiedFiles: [],
        stagedFiles: [],
        branch: 'main'
      }

      expect(repoState.isClean).toBe(true)
      expect(repoState.currentChangeId).toBe('current-abc123')
      expect(repoState.workingCopyChangeId).toBe('wc-abc123')
      expect(repoState.bookmarks).toEqual(['main', 'feature/test'])
      expect(repoState.hasUncommittedChanges).toBe(false)
      expect(repoState.conflictedFiles).toEqual([])
      expect(repoState.untrackedFiles).toEqual(['temp.txt', 'notes.md'])
      expect(repoState.modifiedFiles).toEqual([])
      expect(repoState.stagedFiles).toEqual([])
      expect(repoState.branch).toBe('main')
    })

    test('handles dirty repository state', () => {
      const dirtyState: RepoState = {
        isClean: false,
        currentChangeId: 'current-def456',
        workingCopyChangeId: 'wc-def456',
        bookmarks: ['feature/dirty'],
        hasUncommittedChanges: true,
        conflictedFiles: ['src/conflict.ts'],
        untrackedFiles: ['debug.log'],
        modifiedFiles: ['src/modified.ts'],
        stagedFiles: ['src/staged.ts']
      }

      expect(dirtyState.isClean).toBe(false)
      expect(dirtyState.hasUncommittedChanges).toBe(true)
      expect(dirtyState.conflictedFiles).toEqual(['src/conflict.ts'])
      expect(dirtyState.modifiedFiles).toEqual(['src/modified.ts'])
      expect(dirtyState.stagedFiles).toEqual(['src/staged.ts'])
    })
  })

  describe('SnapshotOptions interface', () => {
    test('has all configuration options', () => {
      const options: SnapshotOptions = {
        description: 'Custom snapshot description',
        includeUntracked: true,
        createBookmark: 'snapshot-bookmark',
        skipEmptyCommits: false,
        autoCleanup: true,
        verifyCleanState: true
      }

      expect(options.description).toBe('Custom snapshot description')
      expect(options.includeUntracked).toBe(true)
      expect(options.createBookmark).toBe('snapshot-bookmark')
      expect(options.skipEmptyCommits).toBe(false)
      expect(options.autoCleanup).toBe(true)
      expect(options.verifyCleanState).toBe(true)
    })

    test('allows partial options', () => {
      const minimalOptions: SnapshotOptions = {}

      expect(minimalOptions.description).toBeUndefined()
      expect(minimalOptions.includeUntracked).toBeUndefined()
      expect(minimalOptions.createBookmark).toBeUndefined()
      expect(minimalOptions.skipEmptyCommits).toBeUndefined()
      expect(minimalOptions.autoCleanup).toBeUndefined()
      expect(minimalOptions.verifyCleanState).toBeUndefined()
    })
  })

  describe('ToolCallWrapper interface', () => {
    test('defines tool call wrapping structure', () => {
      const wrapper: ToolCallWrapper = {
        wrapToolCall: async (toolName: string, input: any, execute: () => Promise<any>) => {
          // Mock implementation
          const snapshotBefore = await createSnapshot({ description: `Before ${toolName}` })
          try {
            const result = await execute()
            const snapshotAfter = await createSnapshot({ description: `After ${toolName}` })
            return { result, snapshotBefore, snapshotAfter }
          } catch (error) {
            await rollback(snapshotBefore.changeId)
            throw error
          }
        }
      }

      expect(typeof wrapper.wrapToolCall).toBe('function')
    })
  })

  describe('SnapshotContext interface', () => {
    test('tracks execution context', () => {
      const context: SnapshotContext = {
        executionId: 'exec-123',
        agentId: 'agent-456',
        taskId: 'task-789',
        toolName: 'Edit',
        snapshotId: 'snap-abc123'
      }

      expect(context.executionId).toBe('exec-123')
      expect(context.agentId).toBe('agent-456')
      expect(context.taskId).toBe('task-789')
      expect(context.toolName).toBe('Edit')
      expect(context.snapshotId).toBe('snap-abc123')
    })
  })
})

// Mock functions for testing (these would be imported from actual implementations)
async function createSnapshot(options: SnapshotOptions): Promise<JJSnapshot> {
  return {
    id: 'mock-snap',
    changeId: 'mock-change',
    description: options.description || 'Mock snapshot',
    timestamp: new Date(),
    files: { modified: [], added: [], deleted: [] },
    hasConflicts: false,
    isEmpty: false
  }
}

async function rollback(_changeId: string): Promise<void> {
  // Mock rollback
}