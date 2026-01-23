import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { useJJ } from '../../src/hooks/useJJ'

// Mock exec function for testing
const mockExec = mock()

describe('useJJ', () => {
  beforeEach(() => {
    mockExec.mockClear()
  })

  test('should initialize with default state', () => {
    const hook = useJJ(mockExec)

    expect(hook.status).toBe('idle')
    expect(hook.error).toBeNull()
    expect(hook.lastResult).toBeNull()
  })

  test('should handle successful jj status command', async () => {
    const hook = useJJ(mockExec)

    mockExec.mockResolvedValue({ stdout: '' })

    const statusResult = await hook.getStatus()
    expect(statusResult.isClean).toBe(true)
    expect(statusResult.changes).toEqual([])

    expect(hook.status).toBe('idle')
    expect(hook.error).toBeNull()
    expect(mockExec).toHaveBeenCalledWith('jj status')
  })

  test('should handle jj status command with changes', async () => {
    const hook = useJJ(mockExec)

    const statusOutput = `Working copy changes:
M src/test.ts
A src/new.ts`

    mockExec.mockResolvedValue({ stdout: statusOutput })

    const statusResult = await hook.getStatus()
    expect(statusResult.isClean).toBe(false)
    expect(statusResult.changes).toHaveLength(2)

    expect(hook.status).toBe('idle')
    expect(hook.error).toBeNull()
  })

  test('should handle jj command errors', async () => {
    const hook = useJJ(mockExec)

    const error = new Error('jj command failed')
    mockExec.mockRejectedValue(error)

    await expect(hook.getStatus()).rejects.toThrow('Failed to verify repository status: jj command failed')

    expect(hook.status).toBe('error')
    expect(hook.error).toBe('Failed to verify repository status: jj command failed')
  })

  test('should handle verification with clean repository', async () => {
    const hook = useJJ(mockExec)

    mockExec.mockResolvedValue({ stdout: '' })

    const verifyResult = await hook.verifyPostCommit()
    expect(verifyResult.verified).toBe(true)
    expect(verifyResult.message).toBe('Repository verification passed: working copy is clean')

    expect(hook.status).toBe('idle')
    expect(hook.lastResult).toEqual({
      verified: true,
      message: 'Repository verification passed: working copy is clean',
      changes: []
    })
  })

  test('should handle verification with dirty repository', async () => {
    const hook = useJJ(mockExec)

    const statusOutput = `Working copy changes:
M src/dirty.ts`

    mockExec.mockResolvedValue({ stdout: statusOutput })

    const verifyResult = await hook.verifyPostCommit()
    expect(verifyResult.verified).toBe(false)
    expect(verifyResult.message).toContain('VERIFICATION FAILED')

    expect(hook.status).toBe('error')
    expect(hook.lastResult?.verified).toBe(false)
    expect(hook.lastResult?.changes).toHaveLength(1)
  })

  test('should handle verification errors', async () => {
    const hook = useJJ(mockExec)

    const error = new Error('jj not available')
    mockExec.mockRejectedValue(error)

    const verifyResult = await hook.verifyPostCommit()
    expect(verifyResult.verified).toBe(false)
    expect(verifyResult.message).toContain('VERIFICATION ERROR')

    expect(hook.status).toBe('error')
    expect(hook.error).toContain('jj not available')
  })

  test('should prevent concurrent operations', async () => {
    const hook = useJJ(mockExec)

    let resolveFirst: (value: any) => void
    const firstPromise = new Promise(resolve => {
      resolveFirst = resolve
    })

    mockExec.mockReturnValueOnce(firstPromise)

    // Start first operation (don't await yet)
    const firstOperationPromise = hook.getStatus()

    // Should be in running state
    expect(hook.status).toBe('running')

    // Try to start second operation while first is running
    await expect(hook.verifyPostCommit()).rejects.toThrow('JJ operation already in progress')

    // Complete first operation
    resolveFirst!({ stdout: '' })
    await firstOperationPromise

    // Should be back to idle
    expect(hook.status).toBe('idle')
  })

  test('should handle concurrent verification attempt', async () => {
    const hook = useJJ(mockExec)

    let resolveFirst: (value: any) => void
    const firstPromise = new Promise(resolve => {
      resolveFirst = resolve
    })

    mockExec.mockReturnValueOnce(firstPromise)

    // Start first verification (don't await yet)
    const firstVerificationPromise = hook.verifyPostCommit()

    // Should be in running state
    expect(hook.status).toBe('running')

    // Try to start second verification while first is running
    await expect(hook.getStatus()).rejects.toThrow('JJ operation already in progress')

    // Complete first verification
    resolveFirst!({ stdout: '' })
    await firstVerificationPromise

    // Should be back to idle
    expect(hook.status).toBe('idle')
  })
})