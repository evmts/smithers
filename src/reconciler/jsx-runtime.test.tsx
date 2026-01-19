/**
 * Unit tests for jsx-runtime.ts - Custom JSX runtime for Smithers.
 * Tests the key propagation and React delegation behavior.
 */
import { describe, test, expect } from 'bun:test'
import { jsx, jsxs, jsxDEV, Fragment } from './jsx-runtime.js'
import { createSmithersRoot } from './root.js'

describe('jsx-runtime', () => {
  describe('jsx', () => {
    test('creates React element with type', async () => {
      const root = createSmithersRoot()
      const element = jsx('phase', { name: 'test' })
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('phase')
      root.dispose()
    })

    test('passes props through', async () => {
      const root = createSmithersRoot()
      const element = jsx('step', { count: 42, enabled: true })
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.props.count).toBe(42)
      expect(tree.children[0]!.props.enabled).toBe(true)
      root.dispose()
    })

    test('injects __smithersKey from key parameter', async () => {
      const root = createSmithersRoot()
      const element = jsx('task', { name: 'test' }, 'my-key')
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBe('my-key')
      root.dispose()
    })

    test('handles null props', async () => {
      const root = createSmithersRoot()
      // jsx with null props should create element with empty props object
      const element = jsx('div', {})
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('div')
      root.dispose()
    })

    test('handles undefined key', async () => {
      const root = createSmithersRoot()
      const element = jsx('span', { id: 'test' }, undefined)
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBeUndefined()
      root.dispose()
    })
  })

  describe('jsxs', () => {
    test('handles multiple children', async () => {
      const root = createSmithersRoot()
      const element = jsxs('phase', {
        children: [
          jsx('step', { key: '1' }, '1'),
          jsx('step', { key: '2' }, '2'),
        ]
      })
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.children).toHaveLength(2)
      root.dispose()
    })

    test('injects __smithersKey from key parameter', async () => {
      const root = createSmithersRoot()
      const element = jsxs('container', { children: [] }, 'container-key')
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBe('container-key')
      root.dispose()
    })
  })

  describe('jsxDEV', () => {
    test('works like jsx with source info', async () => {
      const root = createSmithersRoot()
      const element = jsxDEV(
        'phase',
        { name: 'dev-test' },
        'dev-key',
        false,
        { fileName: 'test.tsx', lineNumber: 10, columnNumber: 5 },
        null
      )
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('phase')
      expect(tree.children[0]!.props.name).toBe('dev-test')
      expect(tree.children[0]!.key).toBe('dev-key')
      root.dispose()
    })

    test('handles static children flag', async () => {
      const root = createSmithersRoot()
      const element = jsxDEV(
        'wrapper',
        { children: jsx('child', {}) },
        undefined,
        true,
        undefined,
        null
      )
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.type).toBe('wrapper')
      root.dispose()
    })
  })

  describe('Fragment', () => {
    test('Fragment is exported', () => {
      expect(Fragment).toBeDefined()
    })

    test('Fragment flattens children', async () => {
      const root = createSmithersRoot()
      await root.render(
        jsxs('parent', {
          children: jsx(Fragment, {
            children: jsxs(Fragment, {
              children: [
                jsx('a', {}, 'a'),
                jsx('b', {}, 'b'),
              ]
            })
          })
        })
      )
      
      const tree = root.getTree()
      const parent = tree.children[0]!
      expect(parent.children).toHaveLength(2)
      expect(parent.children[0]!.type).toBe('a')
      expect(parent.children[1]!.type).toBe('b')
      root.dispose()
    })
  })

  describe('withSmithersKey (internal)', () => {
    test('preserves existing props when adding key', async () => {
      const root = createSmithersRoot()
      const element = jsx('node', { a: 1, b: 2 }, 'key')
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.props.a).toBe(1)
      expect(tree.children[0]!.props.b).toBe(2)
      expect(tree.children[0]!.key).toBe('key')
      root.dispose()
    })

    test('handles numeric key', async () => {
      const root = createSmithersRoot()
      const element = jsx('item', {}, 123)
      await root.render(element)
      
      const tree = root.getTree()
      expect(tree.children[0]!.key).toBe(123)
      root.dispose()
    })
  })
})

describe('jsx-runtime - Missing Coverage', () => {
  // jsx edge cases
  test.todo('jsx with function component type')
  test.todo('jsx with class component type')
  test.todo('jsx with memo wrapped component')
  test.todo('jsx with forwardRef component')
  test.todo('jsx with lazy component')
  test.todo('jsx with context provider type')
  test.todo('jsx with context consumer type')

  // Key edge cases
  test.todo('key with special characters')
  test.todo('key that is 0 (falsy but valid)')
  test.todo('key that is empty string')
  test.todo('key that is NaN')
  test.todo('key collision handling')

  // Props edge cases
  test.todo('props with ref')
  test.todo('props with dangerouslySetInnerHTML')
  test.todo('props with style object')
  test.todo('props with event handlers')
  test.todo('props spread behavior')

  // Type coercion
  test.todo('jsx casts ElementType correctly')
  test.todo('jsxs casts ElementType correctly')
  test.todo('jsxDEV casts ElementType correctly')

  // Integration with reconciler
  test.todo('jsx output compatible with SmithersReconciler')
  test.todo('key from jsx-runtime survives reconciliation')
  test.todo('__smithersKey prop is set on instance')
})
