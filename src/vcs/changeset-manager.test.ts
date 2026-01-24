/**
 * Tests for changeset manager - handles JJ changeset operations
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import type { ChangesetManager, ChangesetInfo, JJSnapshot, SnapshotOptions } from './types.js'

describe('ChangesetManager', () => {
  let manager: ChangesetManager
  let mockJJExec: ReturnType<typeof mock>

  const mockChangesetInfo: ChangesetInfo = {
    changeId: 'test-change-abc123',
    shortId: 'abc123',
    description: 'Test changeset',
    author: 'Test Agent <test@example.com>',
    timestamp: new Date('2024-01-01T12:00:00Z'),
    isEmpty: false,
    hasConflicts: false,
    parentIds: ['parent-123'],
    bookmarks: ['test-branch'],
    files: {
      modified: ['src/test.ts'],
      added: ['src/new.ts'],
      deleted: []
    },
    commitHash: 'git-hash-abc123'
  }

  beforeEach(async () => {
    // Mock jj command execution
    mockJJExec = mock(() => Promise.resolve(''))
  })

  afterEach(() => {
    mockJJExec.mockRestore?.()
  })

  describe('createChangeset', () => {
    test('creates new changeset with description', async () => {
      // Mock successful jj new command output
      mockJJExec.mockResolvedValueOnce('Working copy now at: test-change-new123')

      // Import and create manager with mocked dependencies
      const { createChangesetManager } = await import('./changeset-manager.js')
      const manager = createChangesetManager({
        jjExec: mockJJExec,
        workingDir: '/test/repo'
      })

      const changeId = await manager.createChangeset('New feature implementation')

      expect(mockJJExec).toHaveBeenCalledWith([
        'new',
        '--message', 'New feature implementation'
      ])
      expect(changeId).toBe('test-change-new123')
    })

    test('creates changeset without description', async () => {
      mockJJExec.mockResolvedValueOnce('Working copy now at: test-change-auto456')

      // Import and create manager with mocked dependencies
      const { createChangesetManager } = await import('./changeset-manager.js')
      const manager = createChangesetManager({
        jjExec: mockJJExec,
        workingDir: '/test/repo'
      })

      const changeId = await manager.createChangeset()

      expect(mockJJExec).toHaveBeenCalledWith(['new'])
      expect(changeId).toBe('test-change-auto456')
    })

    test('handles jj new command errors', async () => {
      mockJJExec.mockRejectedValueOnce(new Error('jj new failed'))

      await expect(manager.createChangeset('Test')).rejects.toThrow('jj new failed')
    })
  })

  describe('getCurrentChangeset', () => {
    test('returns current changeset info', async () => {
      const mockOutput = JSON.stringify([{
        change_id: 'current-change-123',
        commit_id: 'current-change-123',
        description: 'Current change',
        author: { name: 'Test', email: 'test@example.com' },
        committer: { timestamp: '2024-01-01T12:00:00Z' },
        empty: false,
        conflict: false,
        parents: [{ change_id: 'parent-123' }],
        bookmarks: [{ name: 'main' }]
      }])

      mockJJExec.mockResolvedValueOnce(mockOutput)

      const changeset = await manager.getCurrentChangeset()

      expect(mockJJExec).toHaveBeenCalledWith([
        'log',
        '--revisions', '@',
        '--template', expect.any(String),
        '--no-graph'
      ])
      expect(changeset?.changeId).toBe('current-change-123')
      expect(changeset?.description).toBe('Current change')
      expect(changeset?.author).toBe('Test <test@example.com>')
    })

    test('returns null when no current changeset', async () => {
      mockJJExec.mockResolvedValueOnce('[]')

      const changeset = await manager.getCurrentChangeset()

      expect(changeset).toBeNull()
    })
  })

  describe('getChangeset', () => {
    test('gets specific changeset by id', async () => {
      const mockOutput = JSON.stringify([{
        change_id: 'specific-change-456',
        commit_id: 'specific-change-456',
        description: 'Specific change',
        author: { name: 'Agent', email: 'agent@example.com' },
        committer: { timestamp: '2024-01-01T13:00:00Z' },
        empty: true,
        conflict: false,
        parents: [{ change_id: 'parent-456' }],
        bookmarks: []
      }])

      mockJJExec.mockResolvedValueOnce(mockOutput)

      const changeset = await manager.getChangeset('specific-change-456')

      expect(mockJJExec).toHaveBeenCalledWith([
        'log',
        '--revisions', 'specific-change-456',
        '--template', expect.any(String),
        '--no-graph'
      ])
      expect(changeset?.changeId).toBe('specific-change-456')
      expect(changeset?.isEmpty).toBe(true)
    })

    test('returns null for non-existent changeset', async () => {
      mockJJExec.mockResolvedValueOnce('[]')

      const changeset = await manager.getChangeset('non-existent')

      expect(changeset).toBeNull()
    })
  })

  describe('listChangesets', () => {
    test('lists recent changesets with limit', async () => {
      const mockOutput = JSON.stringify([
        {
          change_id: 'change1',
          description: 'First',
          empty: false,
          author: { name: 'Test', email: 'test@example.com' },
          committer: { timestamp: '2024-01-01T12:00:00Z' },
          conflict: false,
          parents: [],
          bookmarks: []
        },
        {
          change_id: 'change2',
          description: 'Second',
          empty: true,
          author: { name: 'Test', email: 'test@example.com' },
          committer: { timestamp: '2024-01-01T13:00:00Z' },
          conflict: false,
          parents: [],
          bookmarks: []
        },
        {
          change_id: 'change3',
          description: 'Third',
          empty: false,
          author: { name: 'Test', email: 'test@example.com' },
          committer: { timestamp: '2024-01-01T14:00:00Z' },
          conflict: false,
          parents: [],
          bookmarks: []
        }
      ])

      mockJJExec.mockResolvedValueOnce(mockOutput)

      // Create manager with mock
      const { createChangesetManager } = await import('./changeset-manager.js')
      const manager = createChangesetManager({
        jjExec: mockJJExec,
        workingDir: '/test/repo'
      })

      const changesets = await manager.listChangesets(5)

      expect(mockJJExec).toHaveBeenCalledWith([
        'log',
        '--template', expect.any(String),
        '--no-graph',
        '--limit', '5'
      ])
      expect(changesets).toHaveLength(3)
      expect(changesets[0].changeId).toBe('change1')
      expect(changesets[1].isEmpty).toBe(true)
    })

    test('lists all changesets when no limit', async () => {
      mockJJExec.mockResolvedValueOnce('[]')

      await manager.listChangesets()

      expect(mockJJExec).toHaveBeenCalledWith([
        'log',
        '--template', expect.any(String),
        '--no-graph'
      ])
    })
  })

  describe('editChangeset', () => {
    test('moves to specific changeset', async () => {
      mockJJExec.mockResolvedValueOnce('')

      await manager.editChangeset('target-change-789')

      expect(mockJJExec).toHaveBeenCalledWith([
        'edit', 'target-change-789'
      ])
    })

    test('handles edit command errors', async () => {
      mockJJExec.mockRejectedValueOnce(new Error('jj edit failed'))

      await expect(manager.editChangeset('invalid')).rejects.toThrow('jj edit failed')
    })
  })

  describe('abandonChangeset', () => {
    test('abandons specific changeset', async () => {
      mockJJExec.mockResolvedValueOnce('')

      await manager.abandonChangeset('abandon-change-999')

      expect(mockJJExec).toHaveBeenCalledWith([
        'abandon', 'abandon-change-999'
      ])
    })

    test('handles abandon errors', async () => {
      mockJJExec.mockRejectedValueOnce(new Error('Cannot abandon'))

      await expect(manager.abandonChangeset('protected')).rejects.toThrow('Cannot abandon')
    })
  })

  describe('squashChangeset', () => {
    test('squashes changeset with destination', async () => {
      mockJJExec.mockResolvedValueOnce('')

      await manager.squashChangeset('source-change', 'dest-change')

      expect(mockJJExec).toHaveBeenCalledWith([
        'squash',
        '--from', 'source-change',
        '--into', 'dest-change'
      ])
    })

    test('squashes into parent when no destination', async () => {
      mockJJExec.mockResolvedValueOnce('')

      await manager.squashChangeset('source-change')

      expect(mockJJExec).toHaveBeenCalledWith([
        'squash',
        '--from', 'source-change'
      ])
    })
  })

  describe('describeChangeset', () => {
    test('updates changeset description', async () => {
      mockJJExec.mockResolvedValueOnce('')

      await manager.describeChangeset('target-change', 'Updated description')

      expect(mockJJExec).toHaveBeenCalledWith([
        'describe',
        '--revision', 'target-change',
        '--message', 'Updated description'
      ])
    })

    test('describes current changeset when no revision specified', async () => {
      mockJJExec.mockResolvedValueOnce('')

      await manager.describeChangeset(undefined, 'New description')

      expect(mockJJExec).toHaveBeenCalledWith([
        'describe',
        '--message', 'New description'
      ])
    })
  })

  describe('getChangesetFiles', () => {
    test('gets file changes for specific changeset', async () => {
      const mockShowOutput = `M src/modified.ts
A src/added.ts
D src/deleted.ts`

      mockJJExec.mockResolvedValueOnce(mockShowOutput)

      const files = await manager.getChangesetFiles('test-change')

      expect(mockJJExec).toHaveBeenCalledWith([
        'show',
        '--revision', 'test-change',
        '--summary'
      ])
      expect(files.modified).toEqual(['src/modified.ts'])
      expect(files.added).toEqual(['src/added.ts'])
      expect(files.deleted).toEqual(['src/deleted.ts'])
    })

    test('handles empty changeset', async () => {
      mockJJExec.mockResolvedValueOnce('')

      const files = await manager.getChangesetFiles('empty-change')

      expect(files.modified).toEqual([])
      expect(files.added).toEqual([])
      expect(files.deleted).toEqual([])
    })
  })

  describe('createBookmark', () => {
    test('creates bookmark at specific changeset', async () => {
      mockJJExec.mockResolvedValueOnce('')

      await manager.createBookmark('feature-branch', 'target-change')

      expect(mockJJExec).toHaveBeenCalledWith([
        'bookmark', 'create', 'feature-branch',
        '--revision', 'target-change'
      ])
    })

    test('creates bookmark at current changeset', async () => {
      mockJJExec.mockResolvedValueOnce('')

      await manager.createBookmark('current-branch')

      expect(mockJJExec).toHaveBeenCalledWith([
        'bookmark', 'create', 'current-branch'
      ])
    })
  })

  describe('deleteBookmark', () => {
    test('deletes specified bookmark', async () => {
      mockJJExec.mockResolvedValueOnce('')

      await manager.deleteBookmark('old-branch')

      expect(mockJJExec).toHaveBeenCalledWith([
        'bookmark', 'delete', 'old-branch'
      ])
    })
  })

  describe('integration helpers', () => {
    test('parseChangesetOutput handles complete changeset data', () => {
      const { parseChangesetOutput } = require('./changeset-manager.js')

      const rawChangeset = {
        change_id: 'parse-test-123',
        commit_id: 'parse-test-123',
        description: 'Parse test changeset',
        author: { name: 'Parser', email: 'parser@test.com' },
        committer: { timestamp: '2024-01-01T14:00:00Z' },
        empty: false,
        conflict: true,
        parents: [{ change_id: 'parent1' }, { change_id: 'parent2' }],
        bookmarks: [{ name: 'main' }, { name: 'feature' }]
      }

      const parsed = parseChangesetOutput([rawChangeset])[0]

      expect(parsed.changeId).toBe('parse-test-123')
      expect(parsed.shortId).toBe('parse')
      expect(parsed.description).toBe('Parse test changeset')
      expect(parsed.author).toBe('Parser <parser@test.com>')
      expect(parsed.hasConflicts).toBe(true)
      expect(parsed.parentIds).toEqual(['parent1', 'parent2'])
      expect(parsed.bookmarks).toEqual(['main', 'feature'])
    })

    test('parseFileChanges handles various file change formats', () => {
      const { parseFileChanges } = require('./changeset-manager.js')

      const showOutput = `M  src/modified1.ts
MM src/modified2.ts
A  src/added.ts
D  src/deleted.ts
R  old.ts => new.ts
C  src/copied.ts`

      const files = parseFileChanges(showOutput)

      expect(files.modified).toEqual(['src/modified1.ts', 'src/modified2.ts'])
      expect(files.added).toEqual(['src/added.ts', 'new.ts', 'src/copied.ts'])
      expect(files.deleted).toEqual(['src/deleted.ts', 'old.ts'])
    })
  })

  describe('error handling', () => {
    test('handles jj command not found', async () => {
      mockJJExec.mockRejectedValueOnce(new Error('Command not found: jj'))

      await expect(manager.createChangeset('test')).rejects.toThrow('Command not found: jj')
    })

    test('handles invalid JSON from jj log', async () => {
      mockJJExec.mockResolvedValueOnce('invalid json')

      await expect(manager.getCurrentChangeset()).rejects.toThrow()
    })

    test('handles permission errors', async () => {
      mockJJExec.mockRejectedValueOnce(new Error('Permission denied'))

      await expect(manager.editChangeset('test')).rejects.toThrow('Permission denied')
    })
  })
})