import { describe, test, expect } from 'bun:test'
import { createSmithersRoot } from './root.js'
import {
  useFirstMountState,
  usePrevious,
} from './hooks.js'

describe('useFirstMountState', () => {
  test('returns true only on first render', async () => {
    const results: boolean[] = []

    function TestComponent({ trigger }: { trigger: number }) {
      const isFirst = useFirstMountState()
      results.push(isFirst)
      return <div data-trigger={trigger} />
    }

    const root = createSmithersRoot()
    await root.render(<TestComponent trigger={1} />)
    await root.render(<TestComponent trigger={2} />)
    expect(results[0]).toBe(true)
    expect(results[1]).toBe(false)
    root.dispose()
  })
})

describe('usePrevious', () => {
  test('returns undefined on first render', async () => {
    let prev: number | undefined

    function TestComponent({ value }: { value: number }) {
      prev = usePrevious(value)
      return <div data-value={value} />
    }

    const root = createSmithersRoot()
    await root.render(<TestComponent value={1} />)
    expect(prev).toBeUndefined()
    root.dispose()
  })

  test('returns previous value after update', async () => {
    const results: (number | undefined)[] = []

    function TestComponent({ value }: { value: number }) {
      const prev = usePrevious(value)
      results.push(prev)
      return <div data-value={value} />
    }

    const root = createSmithersRoot()
    await root.render(<TestComponent value={1} />)
    await root.render(<TestComponent value={2} />)
    expect(results[0]).toBeUndefined()
    expect(results[1]).toBe(1)
    root.dispose()
  })
})
