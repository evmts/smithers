import { describe, test, expect } from 'bun:test'
import { createSmithersRoot } from './root.js'
import {
  useFirstMountState,
  usePrevious,
  useMountedState,
  useEffectOnce,
  ExecutionGateProvider,
  useExecutionGate,
  useMount,
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

describe('useMountedState', () => {
  test('returns true while mounted', async () => {
    let isMountedFn: () => boolean = () => false
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

    function TestComponent() {
      isMountedFn = useMountedState()
      return <div />
    }

    const root = createSmithersRoot()
    await root.render(<TestComponent />)
    await flush()
    expect(isMountedFn()).toBe(true)

    await root.render(null)
    await flush()
    expect(isMountedFn()).toBe(false)
    root.dispose()
  })
})

describe('useEffectOnce', () => {
  test('runs effect only once', async () => {
    let runCount = 0
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

    function TestComponent({ trigger }: { trigger: number }) {
      useEffectOnce(() => {
        runCount++
      })
      return <div data-trigger={trigger} />
    }

    const root = createSmithersRoot()
    await root.render(<TestComponent trigger={1} />)
    await flush()
    await root.render(<TestComponent trigger={2} />)
    await flush()
    await root.render(<TestComponent trigger={3} />)
    await flush()
    expect(runCount).toBe(1)
    root.dispose()
  })
})

describe('ExecutionGateProvider', () => {
  test('useExecutionGate returns true by default', async () => {
    let gateValue = false

    function TestComponent() {
      gateValue = useExecutionGate()
      return <div />
    }

    const root = createSmithersRoot()
    await root.render(<TestComponent />)
    expect(gateValue).toBe(true)
    root.dispose()
  })

  test('useExecutionGate returns false when disabled', async () => {
    let gateValue = true

    function TestComponent() {
      gateValue = useExecutionGate()
      return <div />
    }

    const root = createSmithersRoot()
    await root.render(
      <ExecutionGateProvider enabled={false}>
        <TestComponent />
      </ExecutionGateProvider>
    )
    expect(gateValue).toBe(false)
    root.dispose()
  })

  test('useMount does not run when gate is disabled', async () => {
    let mounted = false
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

    function TestComponent() {
      useMount(() => {
        mounted = true
      })
      return <div />
    }

    const root = createSmithersRoot()
    await root.render(
      <ExecutionGateProvider enabled={false}>
        <TestComponent />
      </ExecutionGateProvider>
    )
    await flush()
    expect(mounted).toBe(false)
    root.dispose()
  })
})
