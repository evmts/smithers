import { describe, expect, test } from 'bun:test'
import {
  createSmithersRoot,
  getCurrentTreeXML,
  setGlobalFrameCaptureRoot,
} from './root.js'

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
})
