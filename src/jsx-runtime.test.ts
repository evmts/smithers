/**
 * Unit tests for jsx-runtime.ts - JSX delegation to React
 *
 * Now that jsx-runtime delegates to React, these tests verify:
 * 1. Exports work correctly (jsx, jsxs, Fragment, jsxDEV)
 * 2. React elements are created properly
 *
 * Hook integration tests are in src/reconciler/hooks-integration.test.tsx
 */
import { describe, test, expect } from 'bun:test'
import { jsx, jsxs, Fragment, jsxDEV } from './reconciler/jsx-runtime.js'

describe('jsx-runtime exports', () => {
  test('jsx is exported and callable', () => {
    expect(typeof jsx).toBe('function')
  })

  test('jsxs is exported and callable', () => {
    expect(typeof jsxs).toBe('function')
  })

  test('Fragment is exported', () => {
    expect(Fragment).toBeDefined()
  })

  test('jsxDEV is exported and callable', () => {
    expect(typeof jsxDEV).toBe('function')
  })

  test('jsx creates React element with type', () => {
    const element = jsx('div', {})
    expect(element.type).toBe('div')
  })

  test('jsx creates React element with props', () => {
    const element = jsx('phase', { name: 'test', count: 42 })
    expect(element.props.name).toBe('test')
    expect(element.props.count).toBe(42)
  })

  test('jsxs creates React element', () => {
    const element = jsxs('phase', { name: 'test', children: ['a', 'b'] })
    expect(element.type).toBe('phase')
  })

  test('jsx with function component creates element with component type', () => {
    const MyComponent = (props: { name: string }) => jsx('phase', { name: props.name })
    const element = jsx(MyComponent, { name: 'from-function' })

    // React element has the function as type - reconciler will call it
    expect(element.type).toBe(MyComponent)
    expect(element.props.name).toBe('from-function')
  })

  test('jsx handles key parameter', () => {
    const element = jsx('step', { children: 'Hello' }, 'my-key')
    expect(element.key).toBe('my-key')
  })

  test('jsxDEV works same as jsx', () => {
    const element = jsxDEV('step', { children: 'Dev mode' })
    expect(element.type).toBe('step')
  })
})
