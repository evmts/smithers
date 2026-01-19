// useRalphCount.test.ts - Tests for Ralph iteration count hook
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { useRalphCount } from './useRalphCount.js'
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
  const executionId = db.execution.start('test-ralph-count', 'test.tsx')
  const root = createSmithersRoot()
  return { db, executionId, root }
}

function cleanupTestContext(ctx: TestContext): void {
  ctx.root.dispose()
  setTimeout(() => {
    try { ctx.db.close() } catch {}
  }, 10)
}

function TestComponent({ onValue }: { onValue: (v: number) => void }) {
  const ralphCount = useRalphCount()
  onValue(ralphCount)
  return <test-component value={ralphCount} />
}

describe('useRalphCount', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(() => {
    cleanupTestContext(ctx)
  })

  describe('initialization', () => {
    test('returns 0 when ralphCount state is not yet set in DB', async () => {
      let capturedValue = -1
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onValue={(v) => { capturedValue = v }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedValue).toBe(0)
    })

    test('returns stored value when ralphCount exists in DB', async () => {
      ctx.db.state.set('ralphCount', 5, 'test-setup')
      let capturedValue = -1
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onValue={(v) => { capturedValue = v }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedValue).toBe(5)
    })

    test('handles large ralphCount value (MAX_SAFE_INTEGER)', async () => {
      ctx.db.state.set('ralphCount', Number.MAX_SAFE_INTEGER, 'test-setup')
      let capturedValue = -1
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onValue={(v) => { capturedValue = v }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedValue).toBe(Number.MAX_SAFE_INTEGER)
    })
  })

  describe('reactivity', () => {
    test('component receives updated value when ralphCount changes in DB', async () => {
      const values: number[] = []
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onValue={(v) => { values.push(v) }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      const initialValue = values[values.length - 1]
      expect(initialValue).toBe(0)
      
      ctx.db.state.set('ralphCount', 3, 'test-update')
      await new Promise(r => setTimeout(r, 100))
      
      const lastValue = values[values.length - 1]
      expect(lastValue).toBe(3)
    })
  })

  describe('context dependency', () => {
    test('renders with correct ralphCount from SmithersProvider', async () => {
      ctx.db.state.set('ralphCount', 7, 'test-setup')
      let capturedValue = -1
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onValue={(v) => { capturedValue = v }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedValue).toBe(7)
    })
  })

  describe('unmount/remount', () => {
    test('handles unmount cleanly', async () => {
      let capturedValue = -1
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onValue={(v) => { capturedValue = v }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedValue).toBe(0)
      
      expect(() => ctx.root.dispose()).not.toThrow()
    })

    test('remounts correctly with new context', async () => {
      ctx.db.state.set('ralphCount', 10, 'test-setup')
      let capturedValue = -1
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onValue={(v) => { capturedValue = v }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedValue).toBe(10)
      
      ctx.root.dispose()
      
      const newRoot = createSmithersRoot()
      ctx.db.state.set('ralphCount', 20, 'test-remount')
      capturedValue = -1
      
      await newRoot.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onValue={(v) => { capturedValue = v }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedValue).toBe(20)
      newRoot.dispose()
    })
  })
})
