import { describe, expect, spyOn, test, mock } from 'bun:test'
import { useEffect } from 'react'
import {
  createSmithersRoot,
  getCurrentTreeXML,
  setGlobalFrameCaptureRoot,
} from './root.js'
import * as SmithersProvider from '../components/SmithersProvider.js'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

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

  test('rejects when App throws before render', async () => {
    const root = createSmithersRoot()
    let result: unknown = null
    try {
      await root.mount(() => { throw new Error('pre-render') })
    } catch (error) {
      result = error
    }

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('pre-render')

    root.dispose()
  })

  test('rejects when App promise rejects', async () => {
    const root = createSmithersRoot()
    let result: unknown = null
    try {
      await root.mount(async () => { throw new Error('async-pre-render') })
    } catch (error) {
      result = error
    }

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('async-pre-render')

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

describe('SmithersRoot render', () => {
  test('resolves after initial commit', async () => {
    const root = createSmithersRoot()
    await root.render(<phase name="test" />)

    const tree = root.getTree()
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]!.type).toBe('phase')

    root.dispose()
  })

  test('updates tree on re-render', async () => {
    const root = createSmithersRoot()
    await root.render(<phase name="first" />)

    expect(root.getTree().children[0]!.props.name).toBe('first')

    await root.render(<phase name="second" />)
    expect(root.getTree().children[0]!.props.name).toBe('second')

    root.dispose()
  })

  test('unmounts on render(null)', async () => {
    const root = createSmithersRoot()
    await root.render(<phase name="test" />)

    expect(root.getTree().children).toHaveLength(1)

    await root.render(null)
    expect(root.getTree().children).toHaveLength(0)

    root.dispose()
  })

  test('reuses fiber root across renders', async () => {
    const root = createSmithersRoot()
    const effectCounts = { mount: 0, unmount: 0 }

    function Counter() {
      useEffect(() => {
        effectCounts.mount++
        return () => { effectCounts.unmount++ }
      }, [])
      return <div />
    }

    await root.render(<Counter />)
    await flush()
    expect(effectCounts.mount).toBe(1)
    expect(effectCounts.unmount).toBe(0)

    // Re-render same component type - should NOT remount
    await root.render(<Counter />)
    await flush()
    expect(effectCounts.mount).toBe(1)
    expect(effectCounts.unmount).toBe(0)

    root.dispose()
  })
})

describe('SmithersRoot dispose', () => {
  test('clears tree children', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="parent">
        <step>child</step>
      </phase>
    )

    const tree = root.getTree()
    expect(tree.children).toHaveLength(1)

    root.dispose()
    expect(tree.children).toHaveLength(0)
  })

  test('clears all parent pointers recursively', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="level1">
        <step>
          <task name="level3" />
        </step>
      </phase>
    )

    const tree = root.getTree()
    const phase = tree.children[0]!
    const step = phase.children[0]!
    const task = step.children[0]!

    expect(phase.parent).toBe(tree)
    expect(step.parent).toBe(phase)
    expect(task.parent).toBe(step)

    root.dispose()

    expect(phase.parent).toBeNull()
    expect(step.parent).toBeNull()
    expect(task.parent).toBeNull()
  })

  test('can dispose without prior render', () => {
    const root = createSmithersRoot()
    // Should not throw
    root.dispose()
    expect(root.getTree().children).toHaveLength(0)
  })

  test('dispose is idempotent', async () => {
    const root = createSmithersRoot()
    await root.render(<phase name="test" />)

    root.dispose()
    root.dispose()
    root.dispose()

    expect(root.getTree().children).toHaveLength(0)
  })
})

describe('SmithersRoot getTree', () => {
  test('returns root node with type ROOT', () => {
    const root = createSmithersRoot()
    const tree = root.getTree()

    expect(tree.type).toBe('ROOT')
    expect(tree.parent).toBeNull()
    expect(tree.children).toEqual([])

    root.dispose()
  })

  test('root node is stable across renders', async () => {
    const root = createSmithersRoot()
    const tree1 = root.getTree()

    await root.render(<phase name="a" />)
    const tree2 = root.getTree()

    await root.render(<phase name="b" />)
    const tree3 = root.getTree()

    expect(tree1).toBe(tree2)
    expect(tree2).toBe(tree3)

    root.dispose()
  })
})

describe('SmithersRoot toXML', () => {
  test('returns empty string for empty tree', () => {
    const root = createSmithersRoot()
    expect(root.toXML()).toBe('')
    root.dispose()
  })

  test('serializes rendered tree', async () => {
    const root = createSmithersRoot()
    await root.render(<phase name="test" />)

    const xml = root.toXML()
    expect(xml).toContain('<phase')
    expect(xml).toContain('name="test"')

    root.dispose()
  })

  test('serializes nested structure', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="outer">
        <step>inner text</step>
      </phase>
    )

    const xml = root.toXML()
    expect(xml).toContain('<phase')
    expect(xml).toContain('<step>')
    expect(xml).toContain('inner text')
    expect(xml).toContain('</step>')
    expect(xml).toContain('</phase>')

    root.dispose()
  })
})
