// useHuman.test.ts - Tests for human interaction hook
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import React from 'react'
import { useHuman, type UseHumanResult, type AskOptions } from './useHuman.js'
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
  const executionId = db.execution.start('test-human', 'test.tsx')
  const root = createSmithersRoot()
  return { db, executionId, root }
}

function cleanupTestContext(ctx: TestContext): void {
  ctx.root.dispose()
  setTimeout(() => {
    try { ctx.db.close() } catch {}
  }, 10)
}

function TestComponent({ onResult }: { onResult: (r: UseHumanResult) => void }) {
  const result = useHuman()
  onResult(result)
  return <test-component status={result.status} />
}

describe('useHuman', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(() => {
    cleanupTestContext(ctx)
  })

  describe('initialization', () => {
    test('returns idle status on initial render', async () => {
      let capturedResult: UseHumanResult | null = null
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onResult={(r) => { capturedResult = r }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedResult).not.toBeNull()
      expect(capturedResult!.status).toBe('idle')
    })

    test('returns null requestId on initial render', async () => {
      let capturedResult: UseHumanResult | null = null
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onResult={(r) => { capturedResult = r }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedResult!.requestId).toBeNull()
    })

    test('ask function is defined and callable', async () => {
      let capturedResult: UseHumanResult | null = null
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onResult={(r) => { capturedResult = r }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedResult!.ask).toBeDefined()
      expect(typeof capturedResult!.ask).toBe('function')
    })
  })

  describe('UseHumanResult interface', () => {
    test('status is union type: idle | pending | resolved', async () => {
      let capturedResult: UseHumanResult | null = null
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onResult={(r) => { capturedResult = r }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(['idle', 'pending', 'resolved']).toContain(capturedResult!.status)
    })

    test('requestId is string | null', async () => {
      let capturedResult: UseHumanResult | null = null
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onResult={(r) => { capturedResult = r }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedResult!.requestId === null || typeof capturedResult!.requestId === 'string').toBe(true)
    })
  })

  describe('AskOptions interface', () => {
    test('options property is optional string array', () => {
      const opts1: AskOptions = {}
      const opts2: AskOptions = { options: ['yes', 'no'] }
      const opts3: AskOptions = { options: [] }
      
      expect(opts1.options).toBeUndefined()
      expect(opts2.options).toEqual(['yes', 'no'])
      expect(opts3.options).toHaveLength(0)
    })
  })

  describe('unmount behavior', () => {
    test('no errors thrown on unmount', async () => {
      let _capturedResult: UseHumanResult | null = null
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onResult={(r) => { _capturedResult = r }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(() => ctx.root.dispose()).not.toThrow()
    })
  })

  describe('context dependency', () => {
    test('uses db from SmithersProvider context', async () => {
      let capturedResult: UseHumanResult | null = null
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestComponent onResult={(r) => { capturedResult = r }} />
        </SmithersProvider>
      )
      await new Promise(r => setTimeout(r, 50))
      
      expect(capturedResult).not.toBeNull()
      expect(capturedResult!.status).toBe('idle')
    })
  })
})
