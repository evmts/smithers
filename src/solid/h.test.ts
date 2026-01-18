/**
 * Unit tests for h.ts - Hyperscript function for JSX compilation.
 */
import { describe, test, expect } from 'bun:test'
import { h, Fragment } from './h'
import type { SmithersNode } from '../core/types'

describe('h() hyperscript function', () => {
  test('creates basic element node', () => {
    const node = h('div', null)

    expect(node.type).toBe('div')
    expect(node.props).toEqual({})
    expect(node.children).toEqual([])
    expect(node.parent).toBeNull()
  })

  test('creates element with props', () => {
    const node = h('phase', { name: 'test', count: 42 })

    expect(node.type).toBe('phase')
    expect(node.props.name).toBe('test')
    expect(node.props.count).toBe(42)
  })

  test('handles null props', () => {
    const node = h('step', null)

    expect(node.props).toEqual({})
  })

  test('creates text node from string child', () => {
    const node = h('phase', null, 'Hello world')

    expect(node.children).toHaveLength(1)
    expect(node.children[0].type).toBe('TEXT')
    expect(node.children[0].props.value).toBe('Hello world')
    expect(node.children[0].parent).toBe(node)
  })

  test('creates text node from number child', () => {
    const node = h('phase', null, 42)

    expect(node.children).toHaveLength(1)
    expect(node.children[0].type).toBe('TEXT')
    expect(node.children[0].props.value).toBe('42')
  })

  test('sets parent reference for child nodes', () => {
    const child = h('step', null)
    const parent = h('phase', null, child)

    expect(parent.children).toHaveLength(1)
    expect(parent.children[0]).toBe(child)
    expect(child.parent).toBe(parent)
  })

  test('handles multiple children', () => {
    const child1 = h('step', null)
    const child2 = h('step', null)
    const parent = h('phase', null, child1, child2)

    expect(parent.children).toHaveLength(2)
    expect(child1.parent).toBe(parent)
    expect(child2.parent).toBe(parent)
  })

  test('flattens nested arrays', () => {
    const child1 = h('step', null)
    const child2 = h('step', null)
    const parent = h('phase', null, [child1, [child2]])

    expect(parent.children).toHaveLength(2)
  })

  test('filters out null/undefined/boolean children', () => {
    const child = h('step', null)
    const parent = h('phase', null, null, undefined, false, true, child)

    expect(parent.children).toHaveLength(1)
    expect(parent.children[0]).toBe(child)
  })

  test('handles key prop specially', () => {
    const node = h('step', { key: 'unique', name: 'test' })

    expect(node.key).toBe('unique')
    expect(node.props.key).toBeUndefined()
    expect(node.props.name).toBe('test')
  })

  test('handles numeric key', () => {
    const node = h('step', { key: 123 })

    expect(node.key).toBe(123)
    expect(node.props.key).toBeUndefined()
  })

  test('calls function components with props', () => {
    const MyComponent = (props: { name: string }) => {
      return h('custom', { customName: props.name })
    }

    const result = h(MyComponent, { name: 'test' })

    expect(result.type).toBe('custom')
    expect(result.props.customName).toBe('test')
  })

  test('passes children to function components', () => {
    const MyComponent = (props: { children: any }) => {
      return h('wrapper', null, props.children)
    }

    const child = h('step', null)
    const result = h(MyComponent, null, child)

    expect(result.type).toBe('wrapper')
    expect(result.children).toHaveLength(1)
  })

  test('handles mixed children (nodes, strings, numbers)', () => {
    const child = h('step', null)
    const parent = h('phase', null, 'Text before', child, 42, 'Text after')

    expect(parent.children).toHaveLength(4)
    expect(parent.children[0].type).toBe('TEXT')
    expect(parent.children[0].props.value).toBe('Text before')
    expect(parent.children[1]).toBe(child)
    expect(parent.children[2].type).toBe('TEXT')
    expect(parent.children[2].props.value).toBe('42')
    expect(parent.children[3].type).toBe('TEXT')
    expect(parent.children[3].props.value).toBe('Text after')
  })
})

describe('Fragment', () => {
  test('returns children as-is', () => {
    const children = [h('step', null), h('step', null)]
    const result = Fragment({ children })

    expect(result).toBe(children)
  })

  test('handles single child', () => {
    const child = h('step', null)
    const result = Fragment({ children: child })

    expect(result).toBe(child)
  })

  test('handles undefined children', () => {
    const result = Fragment({})

    expect(result).toBeUndefined()
  })

  test('handles string children', () => {
    const result = Fragment({ children: 'text content' })

    expect(result).toBe('text content')
  })
})
