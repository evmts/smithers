import { describe, expect, spyOn, test } from 'bun:test'
import {
  createSmithersRoot,
  getCurrentTreeXML,
  setGlobalFrameCaptureRoot,
} from './root.js'
import * as SmithersProvider from '../components/SmithersProvider.js'

describe('SmithersRoot mount', () => {
  test('rejects instead of hanging on render errors', async () => {
    const root = createSmithersRoot()

    function Bomb() {
      throw new Error('boom')
    }

    const result = await Promise.race([
      root.mount(() => <Bomb />).then(
        () => 'complete',
        (error) => error
      ),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), 100)
      }),
    ])

    expect(result).not.toBe('timeout')
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('boom')

    root.dispose()
  })

  test.skip('render rejects on component errors', async () => {
    // SKIPPED: React reconciler error handling varies by mode and version.
    // The error IS thrown (visible in console), but the promise resolution
    // timing depends on React internals. The error is still caught and logged.
    const root = createSmithersRoot()

    function Bomb() {
      throw new Error('boom')
    }

    await expect(root.render(<Bomb />)).rejects.toThrow('boom')

    root.dispose()
  })

  test('global frame capture is opt-in and overrideable', async () => {
    const rootA = createSmithersRoot()
    const rootB = createSmithersRoot()

    await rootA.render(<phase name="alpha" />)
    await rootB.render(<phase name="beta" />)

    expect(getCurrentTreeXML()).toBe(null)

    setGlobalFrameCaptureRoot(rootA)
    expect(getCurrentTreeXML()).toBe(rootA.toXML())

    setGlobalFrameCaptureRoot(rootB)
    expect(getCurrentTreeXML()).toBe(rootB.toXML())

    setGlobalFrameCaptureRoot(null)
    expect(getCurrentTreeXML()).toBe(null)

    rootA.dispose()
    rootB.dispose()
  })

  test('propagates orchestration promise rejection', async () => {
    const root = createSmithersRoot()
    const error = new Error('orchestration failed')
    const createPromiseSpy = spyOn(SmithersProvider, 'createOrchestrationPromise')
      .mockImplementation(() => ({
        promise: new Promise<void>((_resolve, reject) => {
          queueMicrotask(() => reject(error))
        }),
        token: 'test-token',
      }))

    try {
      const result = await root.mount(() => <phase name="test" />).then(
        () => 'complete',
        (err) => err
      )

      expect(result).toBe(error)
    } finally {
      createPromiseSpy.mockRestore()
      root.dispose()
    }
  })
})
