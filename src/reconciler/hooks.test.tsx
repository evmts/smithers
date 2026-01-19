/**
 * Unit tests for hooks.ts - React lifecycle hooks for Smithers
 */
import { describe, test, expect, mock } from 'bun:test'
import { useEffect } from 'react'
import { createSmithersRoot } from './root.js'
import {
  useMount,
  useUnmount,
  useMountedState,
  useFirstMountState,
  usePrevious,
  useEffectOnce,
  useEffectOnValueChange,
  useExecutionMount,
  ExecutionGateProvider,
  useExecutionGate,
} from './hooks.js'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('useMount', () => {
  test('runs callback once on mount', async () => {
    const mountFn = mock(() => {})
    
    function TestComponent() {
      useMount(mountFn)
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent />)
    await flush()
    expect(mountFn).toHaveBeenCalledTimes(1)
    root.dispose()
  })

  test('does not run callback on re-render', async () => {
    const mountFn = mock(() => {})
    let renderCount = 0
    
    function TestComponent({ trigger }: { trigger: number }) {
      renderCount++
      useMount(mountFn)
      return <div data-trigger={trigger} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent trigger={1} />)
    await flush()
    await root.render(<TestComponent trigger={2} />)
    await flush()
    await root.render(<TestComponent trigger={3} />)
    await flush()
    
    expect(renderCount).toBe(3)
    expect(mountFn).toHaveBeenCalledTimes(1)
    root.dispose()
  })

  test('uses latest callback reference', async () => {
    const values: number[] = []
    
    function TestComponent({ v }: { v: number }) {
      useMount(() => {
        values.push(v)
      })
      return <div data-v={v} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent v={1} />)
    await flush()
    expect(values).toEqual([1])
    root.dispose()
  })

  test('respects ExecutionGate - disabled', async () => {
    const mountFn = mock(() => {})
    
    function TestComponent() {
      useMount(mountFn)
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(
      <ExecutionGateProvider enabled={false}>
        <TestComponent />
      </ExecutionGateProvider>
    )
    await flush()
    expect(mountFn).toHaveBeenCalledTimes(0)
    root.dispose()
  })

  test('respects ExecutionGate - enabled', async () => {
    const mountFn = mock(() => {})
    
    function TestComponent() {
      useMount(mountFn)
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(
      <ExecutionGateProvider enabled={true}>
        <TestComponent />
      </ExecutionGateProvider>
    )
    await flush()
    expect(mountFn).toHaveBeenCalledTimes(1)
    root.dispose()
  })
})

describe('useUnmount', () => {
  test('runs callback on unmount', async () => {
    const unmountFn = mock(() => {})
    
    function TestComponent() {
      useUnmount(unmountFn)
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent />)
    await flush()
    expect(unmountFn).toHaveBeenCalledTimes(0)
    
    await root.render(null)
    await flush()
    expect(unmountFn).toHaveBeenCalledTimes(1)
    root.dispose()
  })

  test('uses latest callback avoiding stale closures', async () => {
    const values: number[] = []
    
    function TestComponent({ value }: { value: number }) {
      useUnmount(() => {
        values.push(value)
      })
      return <div data-value={value} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent value={1} />)
    await flush()
    await root.render(<TestComponent value={2} />)
    await flush()
    await root.render(<TestComponent value={3} />)
    await flush()
    
    await root.render(null)
    await flush()
    expect(values).toEqual([3]) // Latest value, not stale closure
    root.dispose()
  })

  test('does not run when ExecutionGate never enabled', async () => {
    const unmountFn = mock(() => {})
    
    function TestComponent() {
      useUnmount(unmountFn)
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(
      <ExecutionGateProvider enabled={false}>
        <TestComponent />
      </ExecutionGateProvider>
    )
    await flush()
    await root.render(null)
    await flush()
    expect(unmountFn).toHaveBeenCalledTimes(0)
    root.dispose()
  })
})

describe('useMountedState', () => {
  test('returns true when mounted', async () => {
    let _isMountedFn: (() => boolean) | null = null
    let mountedValue: boolean | null = null
    
    function TestComponent() {
      const isMounted = useMountedState()
      _isMountedFn = isMounted
      
      useEffect(() => {
        mountedValue = isMounted()
      }, [])
      
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent />)
    await flush()
    expect(_isMountedFn!()).toBe(true)
    expect(mountedValue).toBe(true)
    root.dispose()
  })

  test('returns false after unmount', async () => {
    let _isMountedFn: (() => boolean) | null = null
    
    function TestComponent() {
      _isMountedFn = useMountedState()
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent />)
    await flush()
    expect(_isMountedFn!()).toBe(true)
    
    await root.render(null)
    await flush()
    expect(_isMountedFn!()).toBe(false)
    root.dispose()
  })

  test('prevents async setState on unmounted component pattern', async () => {
    let _isMountedFn: (() => boolean) | null = null
    const stateUpdates: string[] = []
    
    function TestComponent() {
      const isMounted = useMountedState()
      _isMountedFn = isMounted
      
      useEffect(() => {
        setTimeout(() => {
          if (isMounted()) {
            stateUpdates.push('would update')
          } else {
            stateUpdates.push('skipped - unmounted')
          }
        }, 10)
      }, [])
      
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent />)
    await flush()
    await root.render(null)
    await flush()
    
    await new Promise(r => setTimeout(r, 20))
    expect(stateUpdates).toEqual(['skipped - unmounted'])
    root.dispose()
  })
})

describe('useFirstMountState', () => {
  test('returns true on first render', async () => {
    const results: boolean[] = []
    
    function TestComponent({ trigger }: { trigger: number }) {
      results.push(useFirstMountState())
      return <div data-trigger={trigger} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent trigger={1} />)
    expect(results[0]).toBe(true)
    root.dispose()
  })

  test('returns false on subsequent renders', async () => {
    const results: boolean[] = []
    
    function TestComponent({ trigger }: { trigger: number }) {
      results.push(useFirstMountState())
      return <div data-trigger={trigger} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent trigger={1} />)
    await root.render(<TestComponent trigger={2} />)
    await root.render(<TestComponent trigger={3} />)
    
    expect(results).toEqual([true, false, false])
    root.dispose()
  })
})

describe('usePrevious', () => {
  test('returns undefined on first render', async () => {
    let prevValue: number | undefined
    
    function TestComponent({ value }: { value: number }) {
      prevValue = usePrevious(value)
      return <div data-value={value} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent value={1} />)
    expect(prevValue).toBeUndefined()
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
    await flush()
    await root.render(<TestComponent value={2} />)
    await flush()
    await root.render(<TestComponent value={3} />)
    await flush()
    
    expect(results).toEqual([undefined, 1, 2])
    root.dispose()
  })
})

describe('useEffectOnce', () => {
  test('runs effect once', async () => {
    const effectFn = mock(() => {})
    
    function TestComponent({ trigger }: { trigger: number }) {
      useEffectOnce(effectFn)
      return <div data-trigger={trigger} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent trigger={1} />)
    await flush()
    await root.render(<TestComponent trigger={2} />)
    await flush()
    await root.render(<TestComponent trigger={3} />)
    await flush()
    
    expect(effectFn).toHaveBeenCalledTimes(1)
    root.dispose()
  })

  test('cleanup runs on unmount', async () => {
    const cleanupFn = mock(() => {})
    
    function TestComponent() {
      useEffectOnce(() => cleanupFn)
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent />)
    await flush()
    expect(cleanupFn).toHaveBeenCalledTimes(0)
    
    await root.render(null)
    await flush()
    expect(cleanupFn).toHaveBeenCalledTimes(1)
    root.dispose()
  })
})

describe('useEffectOnValueChange', () => {
  test('runs on initial value', async () => {
    const effectFn = mock(() => {})
    
    function TestComponent({ value }: { value: number }) {
      useEffectOnValueChange(value, effectFn)
      return <div data-value={value} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent value={1} />)
    await flush()
    expect(effectFn).toHaveBeenCalledTimes(1)
    root.dispose()
  })

  test('runs when value changes', async () => {
    const effectFn = mock(() => {})
    
    function TestComponent({ value }: { value: number }) {
      useEffectOnValueChange(value, effectFn)
      return <div data-value={value} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent value={1} />)
    await flush()
    expect(effectFn).toHaveBeenCalledTimes(1)
    
    await root.render(<TestComponent value={2} />)
    await flush()
    expect(effectFn).toHaveBeenCalledTimes(2)
    
    await root.render(<TestComponent value={3} />)
    await flush()
    expect(effectFn).toHaveBeenCalledTimes(3)
    root.dispose()
  })

  test('does not run when value is same', async () => {
    const effectFn = mock(() => {})
    
    function TestComponent({ value }: { value: number }) {
      useEffectOnValueChange(value, effectFn)
      return <div data-value={value} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent value={1} />)
    await flush()
    await root.render(<TestComponent value={1} />)
    await flush()
    await root.render(<TestComponent value={1} />)
    await flush()
    
    expect(effectFn).toHaveBeenCalledTimes(1)
    root.dispose()
  })

  test('respects ExecutionGate', async () => {
    const effectFn = mock(() => {})
    
    function TestComponent({ value }: { value: number }) {
      useEffectOnValueChange(value, effectFn)
      return <div data-value={value} />
    }
    
    const root = createSmithersRoot()
    await root.render(
      <ExecutionGateProvider enabled={false}>
        <TestComponent value={1} />
      </ExecutionGateProvider>
    )
    await flush()
    expect(effectFn).toHaveBeenCalledTimes(0)
    root.dispose()
  })

  test('runs cleanup on value change', async () => {
    const cleanupFn = mock(() => {})
    
    function TestComponent({ value }: { value: number }) {
      useEffectOnValueChange(value, () => cleanupFn)
      return <div data-value={value} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent value={1} />)
    await flush()
    expect(cleanupFn).toHaveBeenCalledTimes(0)
    
    await root.render(<TestComponent value={2} />)
    await flush()
    expect(cleanupFn).toHaveBeenCalledTimes(1)
    root.dispose()
  })
})

describe('useExecutionMount', () => {
  test('runs when executionEnabled is true', async () => {
    const fn = mock(() => {})
    
    function TestComponent() {
      useExecutionMount(true, fn)
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent />)
    await flush()
    expect(fn).toHaveBeenCalledTimes(1)
    root.dispose()
  })

  test('does not run when executionEnabled is false', async () => {
    const fn = mock(() => {})
    
    function TestComponent() {
      useExecutionMount(false, fn)
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent />)
    await flush()
    expect(fn).toHaveBeenCalledTimes(0)
    root.dispose()
  })

  test('runs once when executionEnabled becomes true', async () => {
    const fn = mock(() => {})
    
    function TestComponent({ enabled }: { enabled: boolean }) {
      useExecutionMount(enabled, fn)
      return <div data-enabled={enabled} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent enabled={false} />)
    await flush()
    expect(fn).toHaveBeenCalledTimes(0)
    
    await root.render(<TestComponent enabled={true} />)
    await flush()
    expect(fn).toHaveBeenCalledTimes(1)
    
    await root.render(<TestComponent enabled={true} />)
    await flush()
    expect(fn).toHaveBeenCalledTimes(1) // Still 1, idempotent
    root.dispose()
  })

  test('does not run again if disabled then re-enabled', async () => {
    const fn = mock(() => {})
    
    function TestComponent({ enabled }: { enabled: boolean }) {
      useExecutionMount(enabled, fn)
      return <div data-enabled={enabled} />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent enabled={true} />)
    await flush()
    expect(fn).toHaveBeenCalledTimes(1)
    
    await root.render(<TestComponent enabled={false} />)
    await flush()
    await root.render(<TestComponent enabled={true} />)
    await flush()
    expect(fn).toHaveBeenCalledTimes(1) // Still 1
    root.dispose()
  })
})

describe('ExecutionGateProvider', () => {
  test('provides enabled value to children', async () => {
    let gateValue: boolean | null = null
    
    function TestComponent() {
      gateValue = useExecutionGate()
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(
      <ExecutionGateProvider enabled={true}>
        <TestComponent />
      </ExecutionGateProvider>
    )
    expect(gateValue).toBe(true)
    root.dispose()
  })

  test('provides disabled value to children', async () => {
    let gateValue: boolean | null = null
    
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

  test('defaults to true without provider', async () => {
    let gateValue: boolean | null = null
    
    function TestComponent() {
      gateValue = useExecutionGate()
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(<TestComponent />)
    expect(gateValue).toBe(true)
    root.dispose()
  })

  test('nested providers - inner takes precedence', async () => {
    let innerValue: boolean | null = null
    
    function InnerComponent() {
      innerValue = useExecutionGate()
      return <div />
    }
    
    const root = createSmithersRoot()
    await root.render(
      <ExecutionGateProvider enabled={true}>
        <ExecutionGateProvider enabled={false}>
          <InnerComponent />
        </ExecutionGateProvider>
      </ExecutionGateProvider>
    )
    expect(innerValue).toBe(false)
    root.dispose()
  })
})
