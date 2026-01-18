/**
 * Integration tests proving React hooks work with Smithers reconciler.
 *
 * These tests verify that after the jsx-runtime fix:
 * - useState, useContext, useEffect, useMemo work correctly
 * - Components with hooks render without "Invalid hook call" errors
 *
 * Uses root.render() which returns a Promise that resolves after initial commit.
 */
import { describe, test, expect } from 'bun:test'
import { createSmithersRoot } from './root.js'
import { useState, useContext, createContext, useMemo, useRef } from 'react'

describe('SmithersRoot rendering', () => {
  test('renders string element to SmithersNode', async () => {
    const root = createSmithersRoot()
    await root.render(<div />)

    const tree = root.getTree()
    expect(tree.type).toBe('ROOT')
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]!.type).toBe('div')

    root.dispose()
  })

  test('renders element with props', async () => {
    const root = createSmithersRoot()
    await root.render(<phase name="test" count={42} />)

    const tree = root.getTree()
    const phase = tree.children[0]!
    expect(phase.type).toBe('phase')
    expect(phase.props.name).toBe('test')
    expect(phase.props.count).toBe(42)

    root.dispose()
  })

  test('renders text children', async () => {
    const root = createSmithersRoot()
    await root.render(<step>Hello</step>)

    const tree = root.getTree()
    const step = tree.children[0]!
    expect(step.type).toBe('step')
    expect(step.children).toHaveLength(1)
    expect(step.children[0]!.type).toBe('TEXT')
    expect(step.children[0]!.props.value).toBe('Hello')

    root.dispose()
  })

  test('renders nested elements', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="parent">
        <step>Child</step>
      </phase>
    )

    const tree = root.getTree()
    const phase = tree.children[0]!
    expect(phase.type).toBe('phase')
    expect(phase.children).toHaveLength(1)
    expect(phase.children[0]!.type).toBe('step')

    root.dispose()
  })

  test('renders function component', async () => {
    function MyComponent({ name }: { name: string }) {
      return <phase name={name} />
    }

    const root = createSmithersRoot()
    await root.render(<MyComponent name="from-function" />)

    const tree = root.getTree()
    const phase = tree.children[0]!
    expect(phase.type).toBe('phase')
    expect(phase.props.name).toBe('from-function')

    root.dispose()
  })

  test('renders multiple children', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="multi">
        <step>First</step>
        <step>Second</step>
      </phase>
    )

    const tree = root.getTree()
    const phase = tree.children[0]!
    expect(phase.children).toHaveLength(2)
    expect(phase.children[0]!.type).toBe('step')
    expect(phase.children[1]!.type).toBe('step')

    root.dispose()
  })

  test('filters null and undefined children', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="test">
        {null}
        <step>Valid</step>
        {undefined}
      </phase>
    )

    const tree = root.getTree()
    const phase = tree.children[0]!
    expect(phase.children).toHaveLength(1)
    expect(phase.children[0]!.type).toBe('step')

    root.dispose()
  })

  test('filters boolean children', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="test">
        {false}
        <step>Valid</step>
        {true}
      </phase>
    )

    const tree = root.getTree()
    const phase = tree.children[0]!
    expect(phase.children).toHaveLength(1)
    expect(phase.children[0]!.type).toBe('step')

    root.dispose()
  })

  test('renders Fragment children', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="wrapper">
        <>
          <step>A</step>
          <step>B</step>
        </>
      </phase>
    )

    const tree = root.getTree()
    const phase = tree.children[0]!
    // Fragment children should be flattened
    expect(phase.children).toHaveLength(2)

    root.dispose()
  })

  test('sets parent references', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="parent">
        <step>Child</step>
      </phase>
    )

    const tree = root.getTree()
    const phase = tree.children[0]!
    const step = phase.children[0]!

    expect(phase.parent).toBe(tree)
    expect(step.parent).toBe(phase)

    root.dispose()
  })

  test('clears parent pointers on unmount', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="test">
        <step>Child</step>
      </phase>
    )

    const tree = root.getTree()
    const phase = tree.children[0]!
    const step = phase.children[0]!

    // Verify parent pointers are set
    expect(phase.parent).toBe(tree)
    expect(step.parent).toBe(phase)
    expect(tree.children).toHaveLength(1)

    // Unmount everything
    await root.render(null)

    // Verify parent pointers are cleared
    expect(phase.parent).toBe(null)
    expect(step.parent).toBe(null)
    expect(tree.children).toHaveLength(0)

    root.dispose()
  })

  test('dispose clears parent pointers', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="test">
        <step>Child</step>
      </phase>
    )

    const tree = root.getTree()
    const phase = tree.children[0]!
    const step = phase.children[0]!

    // Verify parent pointers are set
    expect(phase.parent).toBe(tree)
    expect(step.parent).toBe(phase)

    // Dispose root
    root.dispose()

    // Verify parent pointers are cleared
    expect(phase.parent).toBe(null)
    expect(step.parent).toBe(null)
    expect(tree.children).toHaveLength(0)
  })

  test('toXML serializes tree', async () => {
    const root = createSmithersRoot()
    await root.render(
      <phase name="test">
        <step>Hello</step>
      </phase>
    )

    const xml = root.toXML()
    expect(xml).toContain('<phase')
    expect(xml).toContain('name="test"')
    expect(xml).toContain('<step>')
    expect(xml).toContain('Hello')

    root.dispose()
  })
})

describe('Hooks Integration', () => {
  test('useState works', async () => {
    function Counter() {
      const [count] = useState(99)
      return <div>Count: {count}</div>
    }

    const root = createSmithersRoot()
    await root.render(<Counter />)

    const xml = root.toXML()
    expect(xml).toContain('Count:')
    expect(xml).toContain('99')
    root.dispose()
  })

  test('useContext works', async () => {
    const Ctx = createContext('default')

    function Child() {
      const value = useContext(Ctx)
      return <span>{value}</span>
    }

    function App() {
      return (
        <Ctx.Provider value="works">
          <Child />
        </Ctx.Provider>
      )
    }

    const root = createSmithersRoot()
    await root.render(<App />)

    expect(root.toXML()).toContain('works')
    root.dispose()
  })

  test('useMemo works', async () => {
    function Computed() {
      const value = useMemo(() => 'computed-value', [])
      return <result>{value}</result>
    }

    const root = createSmithersRoot()
    await root.render(<Computed />)

    expect(root.toXML()).toContain('computed-value')
    root.dispose()
  })

  test('useRef works', async () => {
    function RefComponent() {
      const ref = useRef('initial-ref')
      return <data>{ref.current}</data>
    }

    const root = createSmithersRoot()
    await root.render(<RefComponent />)

    expect(root.toXML()).toContain('initial-ref')
    root.dispose()
  })

  test('multiple hooks in single component', async () => {
    const ThemeCtx = createContext('light')

    function MultiHook() {
      const [count] = useState(42)
      const theme = useContext(ThemeCtx)
      const doubled = useMemo(() => count * 2, [count])
      const ref = useRef('refval')

      return <multi count={count} theme={theme} doubled={doubled} refValue={ref.current} />
    }

    const root = createSmithersRoot()
    await root.render(<MultiHook />)

    const xml = root.toXML()
    expect(xml).toContain('count="42"')
    expect(xml).toContain('theme="light"')
    expect(xml).toContain('doubled="84"')
    root.dispose()
  })

  test('nested function components with hooks', async () => {
    function Inner() {
      const [value] = useState('inner-hook')
      return <inner-result>{value}</inner-result>
    }

    function Outer() {
      const [value] = useState('outer-hook')
      return (
        <outer-result value={value}>
          <Inner />
        </outer-result>
      )
    }

    const root = createSmithersRoot()
    await root.render(<Outer />)

    const xml = root.toXML()
    expect(xml).toContain('outer-hook')
    expect(xml).toContain('inner-hook')
    root.dispose()
  })
})
