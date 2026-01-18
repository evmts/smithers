import { describe, expect, test } from 'bun:test'
import { createSmithersRoot } from './root.js'

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
})
