import { describe, test, expect, beforeEach, mock } from 'bun:test'
import type {
  CleanRepoChecker,
  RepoCleanState,
  CleanCheckOptions,
  CleanCheckResult
} from './clean-repo-check.js'

describe('CleanRepoChecker', () => {
  let checker: CleanRepoChecker
  let mockJJWrapper: any
  let mockRepoStateTracker: any

  const cleanState: RepoCleanState = {
    isClean: true,
    hasUncommittedChanges: false,
    hasConflicts: false,
    hasUntrackedFiles: false,
    modifiedFiles: [],
    conflictedFiles: [],
    untrackedFiles: [],
    stagedFiles: [],
    bookmarks: ['main'],
    currentChangeId: 'clean-123',
    workingCopyChangeId: 'wc-456'
  }

  beforeEach(async () => {
    mockJJWrapper = {
      isRepo: mock(() => Promise.resolve(true)),
      getStatus: mock(() => Promise.resolve({
        success: true,
        output: 'Working copy clean',
        files: { modified: [], added: [], deleted: [], untracked: [] }
      })),
      getConflictedFiles: mock(() => Promise.resolve({
        success: true,
        files: []
      })),
      getChangeId: mock(() => Promise.resolve({
        success: true,
        changeId: 'clean-123'
      })),
      execute: mock(() => Promise.resolve({
        success: true,
        stdout: '',
        stderr: ''
      }))
    }

    mockRepoStateTracker = {
      getCurrentState: mock(() => Promise.resolve({
        isClean: true,
        currentChangeId: 'clean-123',
        workingCopyChangeId: 'wc-456',
        hasUncommittedChanges: false,
        conflictedFiles: [],
        modifiedFiles: [],
        untrackedFiles: [],
        bookmarks: ['main']
      })),
      isCleanState: mock((state) => state.isClean)
    }

    const { createCleanRepoChecker } = await import('./clean-repo-check.js')
    checker = createCleanRepoChecker(mockJJWrapper, mockRepoStateTracker)
  })

  describe('checkCleanState', () => {
    test('passes for clean repository', async () => {
      const result = await checker.checkCleanState()

      expect(result.isClean).toBe(true)
      expect(result.issues).toHaveLength(0)
      expect(result.canProceed).toBe(true)
    })

    test('detects uncommitted changes', async () => {
      mockJJWrapper.getStatus.mockResolvedValueOnce({
        success: true,
        output: 'Working copy changes:\nM src/file.ts',
        files: { modified: ['src/file.ts'], added: [], deleted: [], untracked: [] }
      })

      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasUncommittedChanges: true,
        modifiedFiles: ['src/file.ts']
      })

      const result = await checker.checkCleanState()

      expect(result.isClean).toBe(false)
      expect(result.issues).toContain('Repository has uncommitted changes')
      expect(result.modifiedFiles).toEqual(['src/file.ts'])
      expect(result.canProceed).toBe(false)
    })

    test('detects conflicts', async () => {
      mockJJWrapper.getConflictedFiles.mockResolvedValueOnce({
        success: true,
        files: ['src/conflict.ts', 'package.json']
      })

      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasConflicts: true,
        conflictedFiles: ['src/conflict.ts', 'package.json']
      })

      const result = await checker.checkCleanState()

      expect(result.isClean).toBe(false)
      expect(result.issues).toContain('Repository has unresolved conflicts')
      expect(result.conflictedFiles).toEqual(['src/conflict.ts', 'package.json'])
      expect(result.canProceed).toBe(false)
    })

    test('detects untracked files when configured', async () => {
      mockJJWrapper.getStatus.mockResolvedValueOnce({
        success: true,
        output: 'Working copy changes:\n? temp.log\n? debug.txt',
        files: { modified: [], added: [], deleted: [], untracked: ['temp.log', 'debug.txt'] }
      })

      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        hasUntrackedFiles: true,
        untrackedFiles: ['temp.log', 'debug.txt']
      })

      const options: CleanCheckOptions = { allowUntracked: false }
      const result = await checker.checkCleanState(options)

      expect(result.isClean).toBe(false)
      expect(result.issues).toContain('Repository has untracked files')
      expect(result.untrackedFiles).toEqual(['temp.log', 'debug.txt'])
    })

    test('ignores untracked files when allowed', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        hasUntrackedFiles: true,
        untrackedFiles: ['temp.log']
      })

      const options: CleanCheckOptions = { allowUntracked: true }
      const result = await checker.checkCleanState(options)

      expect(result.isClean).toBe(true)
      expect(result.canProceed).toBe(true)
    })

    test('enforces strict mode', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        hasUntrackedFiles: true,
        untrackedFiles: ['temp.log']
      })

      const options: CleanCheckOptions = { strict: true }
      const result = await checker.checkCleanState(options)

      expect(result.isClean).toBe(false)
      expect(result.issues).toContain('Repository has untracked files')
    })
  })

  describe('enforceCleanState', () => {
    test('passes for clean repository', async () => {
      await expect(checker.enforceCleanState()).resolves.not.toThrow()
    })

    test('throws for dirty repository', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasUncommittedChanges: true,
        modifiedFiles: ['dirty.ts']
      })

      await expect(checker.enforceCleanState())
        .rejects.toThrow('Repository is not in clean state')
    })

    test('throws with detailed error message', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasUncommittedChanges: true,
        hasConflicts: true,
        modifiedFiles: ['dirty.ts'],
        conflictedFiles: ['conflict.ts']
      })

      await expect(checker.enforceCleanState())
        .rejects.toThrow('Repository has uncommitted changes, Repository has unresolved conflicts')
    })

    test('respects custom options', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        hasUntrackedFiles: true,
        untrackedFiles: ['temp.log']
      })

      const options: CleanCheckOptions = { allowUntracked: true }

      await expect(checker.enforceCleanState(options)).resolves.not.toThrow()
    })
  })

  describe('cleanRepository', () => {
    test('cleans uncommitted changes', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasUncommittedChanges: true,
        modifiedFiles: ['dirty.ts']
      })

      await checker.cleanRepository()

      expect(mockJJWrapper.execute).toHaveBeenCalledWith(['restore'])
    })

    test('removes untracked files when requested', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        hasUntrackedFiles: true,
        untrackedFiles: ['temp.log', 'debug.txt']
      })

      await checker.cleanRepository({ removeUntracked: true })

      expect(mockJJWrapper.execute).toHaveBeenCalledWith(['file', 'untrack', 'temp.log', 'debug.txt'])
    })

    test('handles conflicts by aborting incomplete operations', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasConflicts: true,
        conflictedFiles: ['conflict.ts']
      })

      await checker.cleanRepository()

      expect(mockJJWrapper.execute).toHaveBeenCalledWith(['abandon', '@'])
    })

    test('performs dry run without making changes', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasUncommittedChanges: true,
        modifiedFiles: ['dirty.ts']
      })

      const result = await checker.cleanRepository({ dryRun: true })

      expect(mockJJWrapper.execute).not.toHaveBeenCalled()
      expect(result.actions).toContain('Would restore uncommitted changes')
    })

    test('creates backup before cleaning', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasUncommittedChanges: true,
        modifiedFiles: ['dirty.ts']
      })

      await checker.cleanRepository({ createBackup: true })

      expect(mockJJWrapper.execute).toHaveBeenCalledWith(['snapshot', '-m', expect.stringContaining('Backup before clean')])
    })
  })

  describe('validateRepoStructure', () => {
    test('validates JJ repository structure', async () => {
      const result = await checker.validateRepoStructure()

      expect(mockJJWrapper.isRepo).toHaveBeenCalled()
      expect(result.isValid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    test('detects non-JJ directory', async () => {
      mockJJWrapper.isRepo.mockResolvedValueOnce(false)

      const result = await checker.validateRepoStructure()

      expect(result.isValid).toBe(false)
      expect(result.issues).toContain('Directory is not a JJ repository')
    })

    test('detects corrupted repository', async () => {
      mockJJWrapper.execute.mockRejectedValueOnce(new Error('Repository corruption detected'))

      const result = await checker.validateRepoStructure()

      expect(result.isValid).toBe(false)
      expect(result.issues).toContain('Repository validation failed: Repository corruption detected')
    })
  })

  describe('getDetailedStatus', () => {
    test('returns comprehensive repository status', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        isClean: true,
        currentChangeId: 'current-123',
        workingCopyChangeId: 'wc-456',
        hasUncommittedChanges: false,
        conflictedFiles: [],
        modifiedFiles: [],
        untrackedFiles: [],
        stagedFiles: [],
        bookmarks: ['main', 'feature'],
        metadata: {
          lastChecked: new Date(),
          jjVersion: '0.12.0',
          repoRoot: '/test/repo'
        }
      })

      const status = await checker.getDetailedStatus()

      expect(status).toEqual({
        isClean: true,
        currentChangeId: 'current-123',
        workingCopyChangeId: 'wc-456',
        hasUncommittedChanges: false,
        hasConflicts: false,
        hasUntrackedFiles: false,
        modifiedFiles: [],
        conflictedFiles: [],
        untrackedFiles: [],
        stagedFiles: [],
        bookmarks: ['main', 'feature'],
        summary: 'Repository is in clean state',
        recommendations: []
      })
    })

    test('provides recommendations for dirty repository', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasUncommittedChanges: true,
        hasConflicts: true,
        modifiedFiles: ['dirty.ts'],
        conflictedFiles: ['conflict.ts']
      })

      const status = await checker.getDetailedStatus()

      expect(status.isClean).toBe(false)
      expect(status.recommendations).toContain('Commit or restore uncommitted changes')
      expect(status.recommendations).toContain('Resolve conflicts before proceeding')
      expect(status.summary).toContain('Repository has issues')
    })
  })

  describe('waitForCleanState', () => {
    test('resolves immediately for clean repository', async () => {
      await expect(checker.waitForCleanState(1000)).resolves.not.toThrow()
    })

    test('polls until repository becomes clean', async () => {
      let callCount = 0
      mockRepoStateTracker.getCurrentState.mockImplementation(() => {
        callCount++
        return Promise.resolve({
          ...cleanState,
          isClean: callCount > 2 // Becomes clean after 2 calls
        })
      })

      await checker.waitForCleanState(1000, 100) // 100ms polling interval

      expect(callCount).toBeGreaterThan(2)
    })

    test('times out if repository never becomes clean', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValue({
        ...cleanState,
        isClean: false,
        hasUncommittedChanges: true
      })

      await expect(checker.waitForCleanState(200, 50))
        .rejects.toThrow('Repository did not become clean within timeout')
    })
  })

  describe('integration scenarios', () => {
    test('handles mixed repository issues', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasUncommittedChanges: true,
        hasConflicts: true,
        hasUntrackedFiles: true,
        modifiedFiles: ['modified.ts'],
        conflictedFiles: ['conflict.ts'],
        untrackedFiles: ['temp.log']
      })

      const result = await checker.checkCleanState()

      expect(result.isClean).toBe(false)
      expect(result.issues).toContain('Repository has uncommitted changes')
      expect(result.issues).toContain('Repository has unresolved conflicts')
      expect(result.issues).toContain('Repository has untracked files')
    })

    test('provides actionable cleanup steps', async () => {
      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasUncommittedChanges: true,
        hasUntrackedFiles: true,
        modifiedFiles: ['dirty.ts'],
        untrackedFiles: ['temp.log']
      })

      const cleanupResult = await checker.cleanRepository({ dryRun: true })

      expect(cleanupResult.actions).toContain('Would restore uncommitted changes')
      expect(cleanupResult.actions).toContain('Would remove untracked files: temp.log')
    })

    test('handles cleanup failures gracefully', async () => {
      mockJJWrapper.execute.mockRejectedValueOnce(new Error('Cleanup failed'))

      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        isClean: false,
        hasUncommittedChanges: true
      })

      await expect(checker.cleanRepository()).rejects.toThrow('Failed to clean repository: Cleanup failed')
    })
  })

  describe('configuration and options', () => {
    test('respects ignore patterns', async () => {
      const options: CleanCheckOptions = {
        ignorePatterns: ['*.log', 'temp/*']
      }

      mockRepoStateTracker.getCurrentState.mockResolvedValueOnce({
        ...cleanState,
        hasUntrackedFiles: true,
        untrackedFiles: ['debug.log', 'temp/cache.txt', 'important.ts']
      })

      const result = await checker.checkCleanState(options)

      // Should ignore *.log and temp/* files
      expect(result.untrackedFiles).toEqual(['important.ts'])
    })

    test('validates custom working directory', async () => {
      mockJJWrapper.isRepo.mockResolvedValueOnce(false)

      const result = await checker.validateRepoStructure()

      expect(result.isValid).toBe(false)
      expect(result.issues).toContain('Directory is not a JJ repository')
    })
  })
})