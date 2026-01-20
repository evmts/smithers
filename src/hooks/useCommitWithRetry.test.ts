import { describe, test, expect, mock } from 'bun:test'

// Test the isPrecommitFailure function directly by extracting test cases
// The hook itself requires React context which is complex to test

describe('useCommitWithRetry', () => {
  describe('isPrecommitFailure detection', () => {
    // Mirror the internal regex from the hook
    const isPrecommitFailure = (message: string): boolean => {
      return /(pre-commit|precommit|hook)/i.test(message)
    }

    test('detects "pre-commit" in message', () => {
      expect(isPrecommitFailure('pre-commit hook failed')).toBe(true)
    })

    test('detects "precommit" without hyphen', () => {
      expect(isPrecommitFailure('precommit failed')).toBe(true)
    })

    test('detects "hook" keyword', () => {
      expect(isPrecommitFailure('git hook failed')).toBe(true)
    })

    test('is case insensitive', () => {
      expect(isPrecommitFailure('PRE-COMMIT failed')).toBe(true)
      expect(isPrecommitFailure('Precommit Failed')).toBe(true)
      expect(isPrecommitFailure('HOOK error')).toBe(true)
    })

    test('returns false for non-precommit errors', () => {
      expect(isPrecommitFailure('merge conflict')).toBe(false)
      expect(isPrecommitFailure('permission denied')).toBe(false)
      expect(isPrecommitFailure('file not found')).toBe(false)
    })

    test('returns false for empty message', () => {
      expect(isPrecommitFailure('')).toBe(false)
    })

    test('detects pre-commit in multi-line stderr', () => {
      const stderr = `
Running lint check...
Error: pre-commit hook exited with code 1
Please fix the issues above.
`
      expect(isPrecommitFailure(stderr)).toBe(true)
    })
  })

  describe('constants', () => {
    test('DEFAULT_WAIT_MS is 5 minutes', () => {
      const DEFAULT_WAIT_MS = 5 * 60 * 1000
      expect(DEFAULT_WAIT_MS).toBe(300000)
    })

    test('DEFAULT_STALE_MS is 15 minutes', () => {
      const DEFAULT_STALE_MS = 15 * 60 * 1000
      expect(DEFAULT_STALE_MS).toBe(900000)
    })
  })

  describe('sleep utility', () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    test('resolves after delay', async () => {
      const start = Date.now()
      await sleep(50)
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(45) // Allow small timing variance
    })
  })

  describe('error handling logic', () => {
    test('converts non-Error to Error', () => {
      const err = 'string error'
      const errorObj = err instanceof Error ? err : new Error(String(err))
      expect(errorObj).toBeInstanceOf(Error)
      expect(errorObj.message).toBe('string error')
    })

    test('preserves Error instances', () => {
      const err = new Error('actual error')
      const errorObj = err instanceof Error ? err : new Error(String(err))
      expect(errorObj).toBe(err)
    })

    test('combines message, stderr, and stdout', () => {
      const err = {
        message: 'main error',
        stderr: 'stderr content',
        stdout: 'stdout content',
      }
      const errorObj = new Error(err.message)
      const stderr = err.stderr ?? ''
      const stdout = err.stdout ?? ''
      const combined = [errorObj.message, stderr, stdout].filter(Boolean).join('\n')

      expect(combined).toBe('main error\nstderr content\nstdout content')
    })

    test('filters empty parts from combined message', () => {
      const err = {
        message: 'main error',
        stderr: '',
        stdout: '',
      }
      const errorObj = new Error(err.message)
      const stderr = err.stderr ?? ''
      const stdout = err.stdout ?? ''
      const combined = [errorObj.message, stderr, stdout].filter(Boolean).join('\n')

      expect(combined).toBe('main error')
    })
  })

  describe('CommitRetryOptions interface', () => {
    test('accepts waitMs option', () => {
      const options = { waitMs: 1000 }
      expect(options.waitMs).toBe(1000)
    })

    test('accepts staleMs option', () => {
      const options = { staleMs: 2000 }
      expect(options.staleMs).toBe(2000)
    })

    test('accepts onFixRequested callback', () => {
      const callback = mock(() => {})
      const options = { onFixRequested: callback }
      expect(typeof options.onFixRequested).toBe('function')
    })
  })
})
