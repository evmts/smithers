/**
 * Unit tests for jsx-runtime.ts - JSX transformation functions.
 */
import { describe, test, expect } from 'bun:test'
import { jsx, jsxs, Fragment, jsxDEV } from './reconciler/jsx-runtime.js'

describe('jsx', () => {
  test('creates element with string type', () => {
    const element = jsx('div', {})

    expect(element.type).toBe('div')
  })

  test('passes props to element', () => {
    const element = jsx('phase', { name: 'test', count: 42 })

    expect(element.props.name).toBe('test')
    expect(element.props.count).toBe(42)
  })

  test('passes children to element', () => {
    const element = jsx('step', { children: 'Hello' })

    expect(element.children).toBeDefined()
  })

  test('handles function component', () => {
    const MyComponent = (props: { name: string }) => jsx('phase', { name: props.name })

    const element = jsx(MyComponent, { name: 'from-function' })

    expect(element.type).toBe('phase')
    expect(element.props.name).toBe('from-function')
  })

  test('creates text node for string children', () => {
    const element = jsx('step', { children: 'Some text' })

    expect(element.children).toHaveLength(1)
    expect(element.children[0].type).toBe('TEXT')
    expect(element.children[0].props.value).toBe('Some text')
  })

  test('creates text node for number children', () => {
    const element = jsx('span', { children: 42 })

    expect(element.children).toHaveLength(1)
    expect(element.children[0].type).toBe('TEXT')
    expect(element.children[0].props.value).toBe('42')
  })

  test('handles array children', () => {
    const child1 = jsx('step', { children: 'First' })
    const child2 = jsx('step', { children: 'Second' })
    const element = jsx('phase', { name: 'test', children: [child1, child2] })

    expect(element.children).toHaveLength(2)
    expect(element.children[0].type).toBe('step')
    expect(element.children[1].type).toBe('step')
  })

  test('handles nested element children', () => {
    const child = jsx('step', { children: 'Child' })
    const element = jsx('phase', { name: 'parent', children: child })

    expect(element.children).toHaveLength(1)
    expect(element.children[0].type).toBe('step')
  })

  test('filters null and undefined children', () => {
    const validChild = jsx('step', { children: 'Valid' })
    const element = jsx('phase', {
      name: 'test',
      children: [null, validChild, undefined],
    })

    expect(element.children).toHaveLength(1)
    expect(element.children[0].type).toBe('step')
  })

  test('filters false and true boolean children', () => {
    const validChild = jsx('step', { children: 'Valid' })
    const element = jsx('phase', {
      name: 'test',
      children: [false, validChild, true],
    })

    expect(element.children).toHaveLength(1)
    expect(element.children[0].type).toBe('step')
  })

  test('sets parent reference on children', () => {
    const child = jsx('step', { children: 'Hello' })
    const element = jsx('phase', { name: 'test', children: child })

    expect(element.children[0].parent).toBe(element)
  })

  test('sets parent reference on text children', () => {
    const element = jsx('step', { children: 'Hello' })

    expect(element.children[0].parent).toBe(element)
  })

  test('handles key parameter', () => {
    const element = jsx('step', { children: 'Hello' }, 'my-key')

    expect(element.key).toBe('my-key')
  })

  test('handles numeric key', () => {
    const element = jsx('step', { children: 'Hello' }, 42)

    expect(element.key).toBe(42)
  })
})

describe('jsxs', () => {
  test('is same as jsx for static children', () => {
    const element = jsxs('phase', { name: 'test', children: ['a', 'b'] })

    expect(element.type).toBe('phase')
    expect(element.children.length).toBeGreaterThan(0)
  })

  test('handles multiple children', () => {
    const child1 = jsx('step', { children: '1' })
    const child2 = jsx('step', { children: '2' })
    const element = jsxs('phase', { name: 'multi', children: [child1, child2] })

    expect(element.children).toHaveLength(2)
  })

  test('creates text nodes for string children', () => {
    const element = jsxs('div', { children: ['text1', 'text2'] })

    expect(element.children).toHaveLength(2)
    expect(element.children[0].type).toBe('TEXT')
    expect(element.children[1].type).toBe('TEXT')
  })
})

describe('jsxDEV', () => {
  test('works same as jsx', () => {
    const element = jsxDEV('step', { children: 'Dev mode' })

    expect(element.type).toBe('step')
  })

  test('handles key parameter', () => {
    const element = jsxDEV('phase', { name: 'test' }, 'dev-key')

    expect(element.type).toBe('phase')
    expect(element.props.name).toBe('test')
    expect(element.key).toBe('dev-key')
  })
})

describe('Fragment', () => {
  test('returns children directly', () => {
    const child1 = jsx('step', { children: '1' })
    const child2 = jsx('step', { children: '2' })
    const fragment = Fragment({ children: [child1, child2] })

    // Fragment returns children directly, not wrapped in a node
    expect(Array.isArray(fragment)).toBe(true)
    expect(fragment).toHaveLength(2)
  })

  test('Fragment with single child', () => {
    const child = jsx('step', { children: 'Only child' })
    const fragment = Fragment({ children: child })

    // Single child is returned as-is
    expect(fragment.type).toBe('step')
  })

  test('Fragment with no children', () => {
    const fragment = Fragment({})

    expect(fragment).toBeUndefined()
  })

  test('Fragment with string children', () => {
    const fragment = Fragment({ children: 'Hello' })

    expect(fragment).toBe('Hello')
  })
})

describe('Edge cases', () => {
  test('handles empty props', () => {
    const element = jsx('div', {})

    expect(element.type).toBe('div')
    expect(element.children).toHaveLength(0)
  })

  test('handles deeply nested children', () => {
    const deepChild = jsx('inner', { children: 'Deep' })
    const midChild = jsx('mid', { children: deepChild })
    const element = jsx('outer', { children: midChild })

    expect(element.children[0].children[0].children[0].props.value).toBe('Deep')
  })

  test('handles mixed children types', () => {
    const elementChild = jsx('step', { children: 'Element' })
    const element = jsx('phase', {
      name: 'mixed',
      children: ['Text before', elementChild, 'Text after'],
    })

    expect(element.children).toHaveLength(3)
    expect(element.children[0].type).toBe('TEXT')
    expect(element.children[1].type).toBe('step')
    expect(element.children[2].type).toBe('TEXT')
  })

  test('flattens nested arrays', () => {
    const child1 = jsx('step', { children: '1' })
    const child2 = jsx('step', { children: '2' })
    const element = jsx('phase', {
      name: 'flat',
      children: [[child1], [child2]],
    })

    expect(element.children).toHaveLength(2)
  })

  test('children prop is not included in node props', () => {
    const element = jsx('step', { children: 'Hello', name: 'test' })

    expect(element.props.children).toBeUndefined()
    expect(element.props.name).toBe('test')
  })
})
