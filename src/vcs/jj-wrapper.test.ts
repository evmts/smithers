import { describe, test, expect } from 'bun:test'
import { createJJWrapper, JJWrapperError } from './jj-wrapper.js'

describe('JJWrapper', () => {
  const wrapper = createJJWrapper('/test/repo')

  describe('validation functions', () => {
    test('validates changeset ID format', async () => {
      await expect(wrapper.editChangeset('')).rejects.toThrow('Change ID cannot be empty')
      await expect(wrapper.editChangeset('invalid id with spaces')).rejects.toThrow('Invalid change ID format')
    })

    test('validates bookmark name format', async () => {
      await expect(wrapper.createBookmark('')).rejects.toThrow('Bookmark name cannot be empty')
      await expect(wrapper.createBookmark('invalid/bookmark')).rejects.toThrow('Invalid bookmark name')
    })

    test('validates conflict resolution input', async () => {
      await expect(wrapper.resolveConflicts([])).rejects.toThrow('No files specified for conflict resolution')
    })
  })

  describe('command building', () => {
    test('creates wrapper without errors', () => {
      const testWrapper = createJJWrapper('/some/path', 'custom-jj')
      expect(testWrapper).toBeDefined()
      expect(typeof testWrapper.execute).toBe('function')
      expect(typeof testWrapper.getStatus).toBe('function')
      expect(typeof testWrapper.createChangeset).toBe('function')
    })

    test('has all required methods', () => {
      const methods = [
        'execute',
        'createChangeset',
        'editChangeset',
        'abandonChangeset',
        'squashChangeset',
        'describeChangeset',
        'duplicateChangeset',
        'getStatus',
        'getDiffStats',
        'getDiff',
        'getChangedFiles',
        'getChangeId',
        'getCommitId',
        'getDescription',
        'getLog',
        'createBookmark',
        'moveBookmark',
        'deleteBookmark',
        'listBookmarks',
        'getRoot',
        'isRepo',
        'getWorkingCopyChangeId',
        'rebase',
        'resolveConflicts',
        'getConflictedFiles'
      ]

      for (const method of methods) {
        expect(typeof wrapper[method]).toBe('function')
      }
    })
  })

  describe('error handling', () => {
    test('JJWrapperError is properly constructed', () => {
      const error = new JJWrapperError('test message', new Error('cause'))
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('JJWrapperError')
      expect(error.message).toBe('test message')
      expect(error.cause).toBeInstanceOf(Error)
    })
  })

  // Note: Integration tests would require actual JJ repository
  // These tests focus on the wrapper structure and validation logic
})