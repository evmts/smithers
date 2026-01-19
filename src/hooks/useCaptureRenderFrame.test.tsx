// useCaptureRenderFrame.test.ts - Tests for render frame capture hook
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test'
import React from 'react'
import { useCaptureRenderFrame } from './useCaptureRenderFrame.js'
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
  const executionId = db.execution.start('test-capture', 'test.tsx')
  const root = createSmithersRoot()
  return { db, executionId, root }
}

function cleanupTestContext(ctx: TestContext): void {
  ctx.root.dispose()
  setTimeout(() => {
    try { ctx.db.close() } catch {}
  }, 10)
}

function TestCaptureComponent({
  db,
  ralphCount,
  getTreeXML,
}: {
  db: SmithersDB
  ralphCount: number
  getTreeXML?: () => string | null
}) {
  useCaptureRenderFrame(db, ralphCount, getTreeXML)
  return <test-component count={ralphCount} />
}

describe('useCaptureRenderFrame', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(() => {
    cleanupTestContext(ctx)
  })

  describe('basic capture', () => {
    test('stores frame in db.renderFrames on ralphCount change', async () => {
      const storeSpy = spyOn(ctx.db.renderFrames, 'store')
      const getTreeXML = () => '<test-xml>content</test-xml>'
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={1} getTreeXML={getTreeXML} />
        </SmithersProvider>
      )
      
      await new Promise(r => setTimeout(r, 100))
      
      expect(storeSpy).toHaveBeenCalled()
      storeSpy.mockRestore()
    })

    test('captures frame with correct XML content', async () => {
      let capturedXml: string | undefined
      const originalStore = ctx.db.renderFrames.store.bind(ctx.db.renderFrames)
      ctx.db.renderFrames.store = (xml: string, count: number) => {
        capturedXml = xml
        return originalStore(xml, count)
      }
      
      const expectedXml = '<custom-tree>nodes</custom-tree>'
      const getTreeXML = () => expectedXml
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={1} getTreeXML={getTreeXML} />
        </SmithersProvider>
      )
      
      await new Promise(r => setTimeout(r, 100))
      
      expect(capturedXml).toBe(expectedXml)
    })

    test('stores frame with correct ralphCount value', async () => {
      let capturedCount: number | undefined
      const originalStore = ctx.db.renderFrames.store.bind(ctx.db.renderFrames)
      ctx.db.renderFrames.store = (xml: string, count: number) => {
        capturedCount = count
        return originalStore(xml, count)
      }
      
      const getTreeXML = () => '<test/>'
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={42} getTreeXML={getTreeXML} />
        </SmithersProvider>
      )
      
      await new Promise(r => setTimeout(r, 100))
      
      expect(capturedCount).toBe(42)
    })
  })

  describe('getTreeXML callback', () => {
    test('calls getTreeXML when provided', async () => {
      const getTreeXML = mock(() => '<test/>')
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={1} getTreeXML={getTreeXML} />
        </SmithersProvider>
      )
      
      await new Promise(r => setTimeout(r, 100))
      
      expect(getTreeXML).toHaveBeenCalled()
    })

    test('skips capture when getTreeXML returns null', async () => {
      const storeSpy = spyOn(ctx.db.renderFrames, 'store')
      const getTreeXML = () => null
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={1} getTreeXML={getTreeXML} />
        </SmithersProvider>
      )
      
      await new Promise(r => setTimeout(r, 100))
      
      expect(storeSpy).not.toHaveBeenCalled()
      storeSpy.mockRestore()
    })

    test('skips capture when getTreeXML returns empty string', async () => {
      const storeSpy = spyOn(ctx.db.renderFrames, 'store')
      const getTreeXML = () => ''
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={1} getTreeXML={getTreeXML} />
        </SmithersProvider>
      )
      
      await new Promise(r => setTimeout(r, 100))
      
      expect(storeSpy).not.toHaveBeenCalled()
      storeSpy.mockRestore()
    })
  })

  describe('error handling', () => {
    test('catches error when getTreeXML throws', async () => {
      const consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {})
      const getTreeXML = () => { throw new Error('test error') }
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={1} getTreeXML={getTreeXML} />
        </SmithersProvider>
      )
      
      await new Promise(r => setTimeout(r, 100))
      
      expect(consoleWarnSpy).toHaveBeenCalled()
      consoleWarnSpy.mockRestore()
    })

    test('does not crash component on capture failure', async () => {
      const consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {})
      const getTreeXML = () => { throw new Error('boom') }
      
      const renderPromise = ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={1} getTreeXML={getTreeXML} />
        </SmithersProvider>
      )
      
      await expect(renderPromise).resolves.toBeUndefined()
      await new Promise(r => setTimeout(r, 100))
      
      const xml = ctx.root.toXML()
      expect(xml).toContain('test-component')
      consoleWarnSpy.mockRestore()
    })

    test('logs warning with [useCaptureRenderFrame] prefix', async () => {
      let loggedMessage = ''
      const consoleWarnSpy = spyOn(console, 'warn').mockImplementation((msg: string) => {
        loggedMessage = msg
      })
      const getTreeXML = () => { throw new Error('test') }
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={1} getTreeXML={getTreeXML} />
        </SmithersProvider>
      )
      
      await new Promise(r => setTimeout(r, 100))
      
      expect(loggedMessage).toContain('[useCaptureRenderFrame]')
      consoleWarnSpy.mockRestore()
    })
  })

  describe('cleanup', () => {
    test('clears timeout on unmount', async () => {
      const clearTimeoutSpy = spyOn(globalThis, 'clearTimeout')
      const getTreeXML = () => '<test/>'
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={1} getTreeXML={getTreeXML} />
        </SmithersProvider>
      )
      
      ctx.root.dispose()
      
      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })
  })

  describe('edge cases', () => {
    test('handles ralphCount of 0', async () => {
      const storeSpy = spyOn(ctx.db.renderFrames, 'store')
      const getTreeXML = () => '<test/>'
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={0} getTreeXML={getTreeXML} />
        </SmithersProvider>
      )
      
      await new Promise(r => setTimeout(r, 100))
      
      expect(storeSpy).toHaveBeenCalledWith('<test/>', 0)
      storeSpy.mockRestore()
    })

    test('handles undefined getTreeXML', async () => {
      const storeSpy = spyOn(ctx.db.renderFrames, 'store')
      
      await ctx.root.render(
        <SmithersProvider db={ctx.db} executionId={ctx.executionId} stopped={true}>
          <TestCaptureComponent db={ctx.db} ralphCount={1} getTreeXML={undefined} />
        </SmithersProvider>
      )
      
      await new Promise(r => setTimeout(r, 100))
      
      expect(storeSpy).not.toHaveBeenCalled()
      storeSpy.mockRestore()
    })
  })
})
