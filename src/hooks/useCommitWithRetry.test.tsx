import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import React from 'react'
import { useCommitWithRetry } from './useCommitWithRetry.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { SmithersProvider } from '../components/SmithersProvider.js'

interface TestContext {
  db: SmithersDB
  executionId: string
  root: SmithersRoot
}

async function createTestContext(): Promise<TestContext> {
  const db = createSmithersDB({ reset: true })
  const executionId = db.execution.start('test-commit-retry', 'test.tsx')
  const root = createSmithersRoot()
  return { db, executionId, root }
}

function cleanupTestContext(ctx: TestContext): void {
  ctx.root.dispose()
  setTimeout(() => {
    try { ctx.db.close() } catch {}
  }, 10)
}

describe('useCommitWithRetry', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(() => {
    cleanupTestContext(ctx)
  })

  test('successful commit passes through', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null

    function TestComponent() {
      commitWithRetry = useCommitWithRetry()
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    expect(commitWithRetry).not.toBeNull()
    const result = await commitWithRetry!(async () => 'success')
    expect(result).toBe('success')
  })

  test('non-precommit errors are rethrown', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null

    function TestComponent() {
      commitWithRetry = useCommitWithRetry()
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    expect(commitWithRetry).not.toBeNull()
    await expect(
      commitWithRetry!(async () => { throw new Error('some random error') })
    ).rejects.toThrow('some random error')
  })

  test('precommit hook failure triggers fix callback', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null
    const onFixRequested = mock(() => {})

    function TestComponent() {
      commitWithRetry = useCommitWithRetry({ onFixRequested })
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    expect(commitWithRetry).not.toBeNull()
    
    let callCount = 0
    const result = await commitWithRetry!(async () => {
      callCount++
      if (callCount === 1) {
        const err = new Error('pre-commit hook failed')
        throw err
      }
      return 'fixed'
    })
    
    expect(result).toBe('fixed')
    expect(onFixRequested).toHaveBeenCalled()
  })

  test('detects precommit failure in stderr', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null
    const onFixRequested = mock(() => {})

    function TestComponent() {
      commitWithRetry = useCommitWithRetry({ onFixRequested })
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    let callCount = 0
    const result = await commitWithRetry!(async () => {
      callCount++
      if (callCount === 1) {
        const err = new Error('command failed') as Error & { stderr: string }
        err.stderr = 'hook failed: precommit check'
        throw err
      }
      return 'success'
    })
    
    expect(result).toBe('success')
    expect(onFixRequested).toHaveBeenCalled()
  })

  test('returns function with correct signature', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null

    function TestComponent() {
      commitWithRetry = useCommitWithRetry()
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    expect(typeof commitWithRetry).toBe('function')
    expect(commitWithRetry!.length).toBe(1)
  })

  test('handles precommit failure patterns in stdout', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null
    const onFixRequested = mock(() => {})

    function TestComponent() {
      commitWithRetry = useCommitWithRetry({ onFixRequested })
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    let callCount = 0
    const result = await commitWithRetry!(async () => {
      callCount++
      if (callCount === 1) {
        const err = new Error('commit failed') as Error & { stdout: string }
        err.stdout = 'husky > precommit (node v18.0.0)'
        throw err
      }
      return 'success'
    })

    expect(result).toBe('success')
    expect(onFixRequested).toHaveBeenCalled()
  })

  test('handles case-insensitive precommit pattern matching', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null
    const onFixRequested = mock(() => {})

    function TestComponent() {
      commitWithRetry = useCommitWithRetry({ onFixRequested })
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    let callCount = 0
    const result = await commitWithRetry!(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('PRE-COMMIT HOOK failed')
      }
      return 'success'
    })

    expect(result).toBe('success')
    expect(onFixRequested).toHaveBeenCalled()
  })

  test('handles non-Error objects thrown', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null

    function TestComponent() {
      commitWithRetry = useCommitWithRetry()
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    await expect(
      commitWithRetry!(async () => { throw 'string error' })
    ).rejects.toEqual(new Error('string error'))
  })

  test('handles precommit failure in combined message content', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null
    const onFixRequested = mock(() => {})

    function TestComponent() {
      commitWithRetry = useCommitWithRetry({ onFixRequested })
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    let callCount = 0
    const result = await commitWithRetry!(async () => {
      callCount++
      if (callCount === 1) {
        const err = new Error('something failed') as Error & { stderr: string; stdout: string }
        err.stderr = 'exit code 1'
        err.stdout = 'hook script detected issues'
        throw err
      }
      return 'success'
    })

    expect(result).toBe('success')
    expect(onFixRequested).toHaveBeenCalled()
  })

  test('handles custom waitMs and staleMs options', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null

    function TestComponent() {
      commitWithRetry = useCommitWithRetry({
        waitMs: 50,
        staleMs: 200,
      })
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    expect(typeof commitWithRetry).toBe('function')
    // Options are used internally, hard to test directly without mocking buildState
  })

  test('async onFixRequested callback is awaited', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null
    let callbackFinished = false

    const onFixRequested = mock(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      callbackFinished = true
    })

    function TestComponent() {
      commitWithRetry = useCommitWithRetry({ onFixRequested })
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    let callCount = 0
    const result = await commitWithRetry!(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('precommit hook failed')
      }
      expect(callbackFinished).toBe(true)
      return 'success'
    })

    expect(result).toBe('success')
    expect(onFixRequested).toHaveBeenCalled()
  })

  test('marks build as fixed after successful retry', async () => {
    let commitWithRetry: ReturnType<typeof useCommitWithRetry> | null = null

    function TestComponent() {
      commitWithRetry = useCommitWithRetry()
      return null
    }

    await ctx.root.render(
      <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
        <TestComponent />
      </SmithersProvider>
    )
    await new Promise(r => setTimeout(r, 50))

    let callCount = 0
    await commitWithRetry!(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('precommit failed')
      }
      return 'success'
    })

    // Should have marked build as fixed - this is handled internally by the hook
    expect(callCount).toBe(2)
  })
})
