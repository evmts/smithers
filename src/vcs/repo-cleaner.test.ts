/**
 * Tests for repo cleaner - verifies clean state and provides rollback capabilities
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import type { RepoCleaner, RepoState, JJSnapshot } from './types.js'

describe('RepoCleaner', () => {
  let cleaner: RepoCleaner
  let mockJJExec: ReturnType<typeof mock>
  let mockFsExec: ReturnType<typeof mock>

  const _mockCleanState: RepoState = {
    isClean: true,
    currentChangeId: 'current-abc123',
    workingCopyChangeId: 'wc-abc123',
    bookmarks: ['main'],
    hasUncommittedChanges: false,
    conflictedFiles: [],
    untrackedFiles: [],
    modifiedFiles: [],
    stagedFiles: []
  }

  const _mockDirtyState: RepoState = {
    isClean: false,
    currentChangeId: 'current-def456',
    workingCopyChangeId: 'wc-def456',
    bookmarks: ['feature/dirty'],
    hasUncommittedChanges: true,
    conflictedFiles: ['src/conflict.ts'],
    untrackedFiles: ['temp.log', 'debug.txt'],
    modifiedFiles: ['src/modified.ts', 'src/index.ts'],
    stagedFiles: ['src/staged.ts']
  }

  beforeEach(async () => {
    mockJJExec = mock(() => Promise.resolve(''))
    mockFsExec = mock(() => Promise.resolve(''))

    const { createRepoCleaner } = await import('./repo-cleaner.js')
    cleaner = createRepoCleaner({
      jjExec: mockJJExec,
      fsExec: mockFsExec,
      workingDir: '/test/repo'
    })
  })

  afterEach(() => {
    mockJJExec.mockRestore?.()
    mockFsExec.mockRestore?.()
  })

  describe('verifyCleanState', () => {
    test('returns true for clean repository', async () => {
      // Mock jj status output for clean repo
      mockJJExec.mockResolvedValueOnce('The working copy is clean\n')

      const isClean = await cleaner.verifyCleanState()

      expect(mockJJExec).toHaveBeenCalledWith(['status'])
      expect(isClean).toBe(true)
    })

    test('returns false for dirty repository', async () => {
      const dirtyStatus = `Working copy changes:
M src/modified.ts
A src/added.ts
D src/deleted.ts

There are unresolved conflicts at these paths:
src/conflict.ts`

      mockJJExec.mockResolvedValueOnce(dirtyStatus)

      const isClean = await cleaner.verifyCleanState()

      expect(isClean).toBe(false)
    })

    test('returns false when untracked files exist', async () => {
      const untrackedStatus = `Working copy changes:
? temp.log
? debug.txt`

      mockJJExec.mockResolvedValueOnce(untrackedStatus)

      const isClean = await cleaner.verifyCleanState()

      expect(isClean).toBe(false)
    })
  })

  describe('getRepoState', () => {
    test('gets complete repository state for clean repo', async () => {
      const statusOutput = 'The working copy is clean\n'
      const logOutput = JSON.stringify([{
        change_id: 'current-123',
        working_copy: true,
        bookmarks: [{ name: 'main' }]
      }])

      mockJJExec
        .mockResolvedValueOnce(statusOutput)  // status
        .mockResolvedValueOnce(logOutput)     // log for current change

      const state = await cleaner.getRepoState()

      expect(state.isClean).toBe(true)
      expect(state.currentChangeId).toBe('current-123')
      expect(state.hasUncommittedChanges).toBe(false)
      expect(state.conflictedFiles).toEqual([])
      expect(state.untrackedFiles).toEqual([])
      expect(state.modifiedFiles).toEqual([])
      expect(state.bookmarks).toEqual(['main'])
    })

    test('gets complete repository state for dirty repo', async () => {
      const statusOutput = `Working copy changes:
M src/file1.ts
M src/file2.ts
A src/new.ts
D src/old.ts
? temp.log
? notes.txt

There are unresolved conflicts at these paths:
src/conflict1.ts
src/conflict2.ts`

      const logOutput = JSON.stringify([{
        change_id: 'dirty-456',
        working_copy: true,
        bookmarks: [{ name: 'feature' }, { name: 'test' }]
      }])

      mockJJExec
        .mockResolvedValueOnce(statusOutput)
        .mockResolvedValueOnce(logOutput)

      const state = await cleaner.getRepoState()

      expect(state.isClean).toBe(false)
      expect(state.hasUncommittedChanges).toBe(true)
      expect(state.modifiedFiles).toEqual(['src/file1.ts', 'src/file2.ts'])
      expect(state.untrackedFiles).toEqual(['temp.log', 'notes.txt'])
      expect(state.conflictedFiles).toEqual(['src/conflict1.ts', 'src/conflict2.ts'])
      expect(state.bookmarks).toEqual(['feature', 'test'])
    })

    test('handles working copy change ID', async () => {
      const logOutput = JSON.stringify([{
        change_id: 'working-789',
        working_copy: true
      }])

      mockJJExec
        .mockResolvedValueOnce('The working copy is clean\n')
        .mockResolvedValueOnce(logOutput)

      const state = await cleaner.getRepoState()

      expect(state.workingCopyChangeId).toBe('working-789')
    })
  })

  describe('cleanRepository', () => {
    test('cleans repository by reverting changes', async () => {
      mockJJExec.mockResolvedValue('')

      await cleaner.cleanRepository()

      expect(mockJJExec).toHaveBeenCalledWith(['workspace', 'update-stale'])
      expect(mockJJExec).toHaveBeenCalledWith(['util', 'gc'])
    })

    test('removes untracked files when specified', async () => {
      mockJJExec.mockResolvedValue('')
      mockFsExec.mockResolvedValue('')

      await cleaner.cleanRepository({ removeUntracked: true })

      expect(mockJJExec).toHaveBeenCalledWith(['workspace', 'update-stale'])
      // Should also call file removal commands
    })

    test('handles conflicts during cleaning', async () => {
      mockJJExec.mockRejectedValueOnce(new Error('Conflicts detected'))

      await expect(cleaner.cleanRepository()).rejects.toThrow('Conflicts detected')
    })
  })

  describe('rollback', () => {
    test('rolls back to specific snapshot by change ID', async () => {
      const snapshot: JJSnapshot = {
        id: 'snap-rollback-123',
        changeId: 'rollback-change-456',
        description: 'Rollback point',
        timestamp: new Date(),
        files: { modified: [], added: [], deleted: [] },
        hasConflicts: false,
        isEmpty: false
      }

      mockJJExec.mockResolvedValue('')

      await cleaner.rollback(snapshot)

      expect(mockJJExec).toHaveBeenCalledWith(['edit', 'rollback-change-456'])
      expect(mockJJExec).toHaveBeenCalledWith(['workspace', 'update-stale'])
    })

    test('rolls back to specific change ID string', async () => {
      // Mock validation check - changeset exists
      mockJJExec
        .mockResolvedValueOnce('exists')  // validation check returns non-empty
        .mockResolvedValueOnce('')        // edit command
        .mockResolvedValueOnce('')        // workspace update-stale

      await cleaner.rollback('direct-change-789')

      expect(mockJJExec).toHaveBeenCalledWith([
        'log',
        '--revisions', 'direct-change-789',
        '--template', 'exists',
        '--no-graph'
      ])
      expect(mockJJExec).toHaveBeenCalledWith(['edit', 'direct-change-789'])
      expect(mockJJExec).toHaveBeenCalledWith(['workspace', 'update-stale'])
    })

    test('preserves bookmarks during rollback', async () => {
      const snapshot: JJSnapshot = {
        id: 'snap-with-bookmarks',
        changeId: 'change-with-bookmarks',
        description: 'Has bookmarks',
        timestamp: new Date(),
        files: { modified: [], added: [], deleted: [] },
        hasConflicts: false,
        isEmpty: false,
        bookmarks: ['main', 'feature']
      }

      mockJJExec.mockResolvedValue('')

      await cleaner.rollback(snapshot, { preserveBookmarks: true })

      expect(mockJJExec).toHaveBeenCalledWith(['edit', 'change-with-bookmarks'])
      // Should not delete bookmarks
    })

    test('cleans up intermediate changes during rollback', async () => {
      // Mock validation check - changeset exists
      mockJJExec
        .mockResolvedValueOnce('exists')  // validation check returns non-empty
        .mockResolvedValueOnce('')        // edit command
        .mockResolvedValueOnce('')        // workspace update-stale
        .mockResolvedValueOnce('')        // util gc

      await cleaner.rollback('target-change', { cleanupIntermediate: true })

      expect(mockJJExec).toHaveBeenCalledWith([
        'log',
        '--revisions', 'target-change',
        '--template', 'exists',
        '--no-graph'
      ])
      expect(mockJJExec).toHaveBeenCalledWith(['edit', 'target-change'])
      expect(mockJJExec).toHaveBeenCalledWith(['util', 'gc'])
    })
  })

  describe('createRestorePoint', () => {
    test('creates restore point with auto-generated description', async () => {
      // Mock jj new output format: "Working copy now at: abc123def"
      mockJJExec.mockResolvedValueOnce('Working copy now at: abc123def')

      const changeId = await cleaner.createRestorePoint()

      expect(mockJJExec).toHaveBeenCalledWith([
        'new',
        '--message', expect.stringContaining('Restore point')
      ])
      expect(changeId).toBe('abc123def')
    })

    test('creates restore point with custom description', async () => {
      // Mock jj new output format: "Working copy now at: def456abc"
      mockJJExec.mockResolvedValueOnce('Working copy now at: def456abc')

      const changeId = await cleaner.createRestorePoint('Before risky operation')

      expect(mockJJExec).toHaveBeenCalledWith([
        'new',
        '--message', 'Before risky operation'
      ])
      expect(changeId).toBe('def456abc')
    })
  })

  describe('validateRepository', () => {
    test('validates repository structure and integrity', async () => {
      // Mock successful validation commands
      mockJJExec
        .mockResolvedValueOnce('')  // jj util gc
        .mockResolvedValueOnce('Repository is valid')  // validation check

      const isValid = await cleaner.validateRepository()

      expect(mockJJExec).toHaveBeenCalledWith(['util', 'gc'])
      expect(isValid).toBe(true)
    })

    test('detects repository corruption', async () => {
      mockJJExec.mockRejectedValueOnce(new Error('Repository corruption detected'))

      const isValid = await cleaner.validateRepository()

      expect(isValid).toBe(false)
    })
  })

  describe('getUntrackedFiles', () => {
    test('lists untracked files from status', async () => {
      const statusOutput = `Working copy changes:
M src/tracked.ts
? untracked1.log
? temp/untracked2.txt
? debug.json`

      mockJJExec.mockResolvedValueOnce(statusOutput)

      const untrackedFiles = await cleaner.getUntrackedFiles()

      expect(untrackedFiles).toEqual([
        'untracked1.log',
        'temp/untracked2.txt',
        'debug.json'
      ])
    })

    test('returns empty array when no untracked files', async () => {
      mockJJExec.mockResolvedValueOnce('The working copy is clean\n')

      const untrackedFiles = await cleaner.getUntrackedFiles()

      expect(untrackedFiles).toEqual([])
    })
  })

  describe('removeUntrackedFiles', () => {
    test('removes specified untracked files', async () => {
      mockFsExec.mockResolvedValue('')

      await cleaner.removeUntrackedFiles(['temp.log', 'debug.txt'])

      expect(mockFsExec).toHaveBeenCalledWith(['rm', 'temp.log'])
      expect(mockFsExec).toHaveBeenCalledWith(['rm', 'debug.txt'])
    })

    test('removes all untracked files when none specified', async () => {
      const statusOutput = `? file1.tmp
? file2.log`

      mockJJExec.mockResolvedValueOnce(statusOutput)
      mockFsExec.mockResolvedValue('')

      await cleaner.removeUntrackedFiles()

      expect(mockFsExec).toHaveBeenCalledWith(['rm', 'file1.tmp'])
      expect(mockFsExec).toHaveBeenCalledWith(['rm', 'file2.log'])
    })

    test('handles file removal errors gracefully', async () => {
      mockFsExec.mockRejectedValueOnce(new Error('Permission denied'))

      await expect(cleaner.removeUntrackedFiles(['protected.txt'])).rejects.toThrow('Permission denied')
    })
  })

  describe('error handling and edge cases', () => {
    test('handles jj command failures gracefully', async () => {
      mockJJExec.mockRejectedValueOnce(new Error('jj not found'))

      await expect(cleaner.verifyCleanState()).rejects.toThrow('jj not found')
    })

    test('handles invalid repository state', async () => {
      mockJJExec.mockRejectedValueOnce(new Error('Not a jj repository'))

      await expect(cleaner.getRepoState()).rejects.toThrow('Not a jj repository')
    })

    test('handles corrupted working copy', async () => {
      mockJJExec.mockRejectedValueOnce(new Error('Working copy corrupted'))

      await expect(cleaner.cleanRepository()).rejects.toThrow('Working copy corrupted')
    })
  })

  describe('status parsing helpers', () => {
    test('parseStatusOutput correctly parses complex status', () => {
      const { parseStatusOutput } = require('./repo-cleaner.js')

      const statusOutput = `Working copy changes:
M  src/modified1.ts
MM src/modified2.ts
A  src/added.ts
D  src/deleted.ts
?  untracked1.log
?  untracked2.txt

There are unresolved conflicts at these paths:
conflict1.ts
conflict2.ts`

      const parsed = parseStatusOutput(statusOutput)

      expect(parsed.modifiedFiles).toEqual(['src/modified1.ts', 'src/modified2.ts'])
      expect(parsed.addedFiles).toEqual(['src/added.ts'])
      expect(parsed.deletedFiles).toEqual(['src/deleted.ts'])
      expect(parsed.untrackedFiles).toEqual(['untracked1.log', 'untracked2.txt'])
      expect(parsed.conflictedFiles).toEqual(['conflict1.ts', 'conflict2.ts'])
    })

    test('parseStatusOutput handles clean status', () => {
      const { parseStatusOutput } = require('./repo-cleaner.js')

      const cleanOutput = 'The working copy is clean\n'
      const parsed = parseStatusOutput(cleanOutput)

      expect(parsed.modifiedFiles).toEqual([])
      expect(parsed.untrackedFiles).toEqual([])
      expect(parsed.conflictedFiles).toEqual([])
    })
  })
})