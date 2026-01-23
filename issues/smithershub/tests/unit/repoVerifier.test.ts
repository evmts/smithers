import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { repoVerifier } from '../../src/vcs/repoVerifier'

describe('repoVerifier', () => {
  const mockExec = mock()

  beforeEach(() => {
    mockExec.mockClear()
  })

  describe('verifyCleanWorkingCopy', () => {
    test('should return true when working copy is clean', async () => {
      // Mock jj status output for clean working copy
      mockExec.mockResolvedValue({ stdout: '' })

      const result = await repoVerifier.verifyCleanWorkingCopy(mockExec)

      expect(result.isClean).toBe(true)
      expect(result.changes).toEqual([])
      expect(mockExec).toHaveBeenCalledWith('jj status')
    })

    test('should return false when working copy has uncommitted changes', async () => {
      // Mock jj status output with changes
      const statusOutput = `Working copy changes:
M src/test.ts
A src/new-file.ts
D src/deleted-file.ts`

      mockExec.mockResolvedValue({ stdout: statusOutput })

      const result = await repoVerifier.verifyCleanWorkingCopy(mockExec)

      expect(result.isClean).toBe(false)
      expect(result.changes).toHaveLength(3)
      expect(result.changes).toContain('M src/test.ts')
      expect(result.changes).toContain('A src/new-file.ts')
      expect(result.changes).toContain('D src/deleted-file.ts')
      expect(mockExec).toHaveBeenCalledWith('jj status')
    })

    test('should throw error when jj command fails', async () => {
      const error = new Error('jj command failed: not a jj repository')
      mockExec.mockRejectedValue(error)

      await expect(repoVerifier.verifyCleanWorkingCopy(mockExec)).rejects.toThrow(
        'Failed to verify repository status: jj command failed: not a jj repository'
      )
    })

    test('should handle empty stdout with newlines', async () => {
      mockExec.mockResolvedValue({ stdout: '\n\n\n' })

      const result = await repoVerifier.verifyCleanWorkingCopy(mockExec)

      expect(result.isClean).toBe(true)
      expect(result.changes).toEqual([])
    })
  })

  describe('verifyPostCommit', () => {
    test('should pass verification when working copy is clean after commit', async () => {
      mockExec.mockResolvedValue({ stdout: '' })

      const result = await repoVerifier.verifyPostCommit(mockExec)

      expect(result.verified).toBe(true)
      expect(result.message).toBe('Repository verification passed: working copy is clean')
    })

    test('should fail verification with detailed error when working copy has changes', async () => {
      const statusOutput = `Working copy changes:
M src/uncommitted.ts
A src/new-uncommitted.ts`

      mockExec.mockResolvedValue({ stdout: statusOutput })

      const result = await repoVerifier.verifyPostCommit(mockExec)

      expect(result.verified).toBe(false)
      expect(result.message).toContain('VERIFICATION FAILED')
      expect(result.message).toContain('Working copy has uncommitted changes after commit')
      expect(result.message).toContain('M src/uncommitted.ts')
      expect(result.message).toContain('A src/new-uncommitted.ts')
      expect(result.changes).toHaveLength(2)
    })

    test('should fail verification when jj status command fails', async () => {
      const error = new Error('jj not found')
      mockExec.mockRejectedValue(error)

      const result = await repoVerifier.verifyPostCommit(mockExec)

      expect(result.verified).toBe(false)
      expect(result.message).toContain('VERIFICATION ERROR')
      expect(result.message).toContain('Failed to verify repository status: jj not found')
    })
  })

  describe('parseJJStatus', () => {
    test('should parse empty status output', () => {
      const result = repoVerifier.parseJJStatus('')
      expect(result.isClean).toBe(true)
      expect(result.changes).toEqual([])
    })

    test('should parse status with working copy changes', () => {
      const statusOutput = `Working copy changes:
M src/file1.ts
A src/file2.ts
D src/file3.ts
R src/old.ts -> src/new.ts`

      const result = repoVerifier.parseJJStatus(statusOutput)

      expect(result.isClean).toBe(false)
      expect(result.changes).toHaveLength(4)
      expect(result.changes).toContain('M src/file1.ts')
      expect(result.changes).toContain('A src/file2.ts')
      expect(result.changes).toContain('D src/file3.ts')
      expect(result.changes).toContain('R src/old.ts -> src/new.ts')
    })

    test('should ignore non-working-copy status lines', () => {
      const statusOutput = `Parent commit: abcdef123
Working copy changes:
M src/file1.ts
A src/file2.ts

Other info: some other status information`

      const result = repoVerifier.parseJJStatus(statusOutput)

      expect(result.isClean).toBe(false)
      expect(result.changes).toHaveLength(2)
      expect(result.changes).toContain('M src/file1.ts')
      expect(result.changes).toContain('A src/file2.ts')
    })

    test('should handle whitespace and empty lines', () => {
      const statusOutput = `
Working copy changes:
  M src/file1.ts
   A src/file2.ts

   D src/file3.ts
`

      const result = repoVerifier.parseJJStatus(statusOutput)

      expect(result.isClean).toBe(false)
      expect(result.changes).toHaveLength(3)
      expect(result.changes).toContain('M src/file1.ts')
      expect(result.changes).toContain('A src/file2.ts')
      expect(result.changes).toContain('D src/file3.ts')
    })
  })
})