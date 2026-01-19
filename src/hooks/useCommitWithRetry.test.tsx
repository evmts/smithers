import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import React from 'react'
import { useCommitWithRetry } from './useCommitWithRetry.js'
import { createSmithersDB, type SmithersDB } from '../db/index.js'
import { createSmithersRoot, type SmithersRoot } from '../reconciler/root.js'
import { SmithersProvider } from '../components/SmithersProvider.js'
import { useMount } from '../reconciler/hooks.js'

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
})
