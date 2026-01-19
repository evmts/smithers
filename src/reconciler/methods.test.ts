/**
 * Unit tests for methods.ts - SmithersNode manipulation methods.
 * These are the low-level tree operations used by the React reconciler.
 */
import { describe, test, expect } from 'bun:test'
import { rendererMethods } from './methods.js'
import type { SmithersNode } from './types.js'

describe('rendererMethods', () => {
  describe('createElement', () => {
    test('creates node with correct type', () => {
      const node = rendererMethods.createElement('phase')
      expect(node.type).toBe('phase')
    })

    test('creates node with empty props', () => {
      const node = rendererMethods.createElement('step')
      expect(node.props).toEqual({})
    })

    test('creates node with empty children array', () => {
      const node = rendererMethods.createElement('task')
      expect(node.children).toEqual([])
    })

    test('creates node with null parent', () => {
      const node = rendererMethods.createElement('claude')
      expect(node.parent).toBeNull()
    })
  })

  describe('createTextNode', () => {
    test('creates TEXT node', () => {
      const node = rendererMethods.createTextNode('hello')
      expect(node.type).toBe('TEXT')
    })

    test('stores text in props.value', () => {
      const node = rendererMethods.createTextNode('world')
      expect(node.props.value).toBe('world')
    })

    test('creates node with empty children', () => {
      const node = rendererMethods.createTextNode('test')
      expect(node.children).toEqual([])
    })

    test('handles empty string', () => {
      const node = rendererMethods.createTextNode('')
      expect(node.props.value).toBe('')
    })
  })

  describe('replaceText', () => {
    test('updates text node value', () => {
      const node = rendererMethods.createTextNode('old')
      rendererMethods.replaceText(node, 'new')
      expect(node.props.value).toBe('new')
    })

    test('handles empty string replacement', () => {
      const node = rendererMethods.createTextNode('content')
      rendererMethods.replaceText(node, '')
      expect(node.props.value).toBe('')
    })
  })

  describe('setProperty', () => {
    test('sets prop on node', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'name', 'test')
      expect(node.props.name).toBe('test')
    })

    test('ignores children prop', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'children', 'ignored')
      expect(node.props.children).toBeUndefined()
    })

    test('sets __smithersKey to node.key', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, '__smithersKey', 'my-key')
      expect(node.key).toBe('my-key')
      expect(node.props.__smithersKey).toBeUndefined()
    })

    test('sets key prop to node.key', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'key', 'direct-key')
      expect(node.key).toBe('direct-key')
      expect(node.props.key).toBeUndefined()
    })

    test('handles numeric key', () => {
      const node = rendererMethods.createElement('task')
      rendererMethods.setProperty(node, 'key', 42)
      expect(node.key).toBe(42)
    })
  })

  describe('insertNode', () => {
    test('appends child to parent', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, child)
      expect(parent.children).toContain(child)
      expect(parent.children).toHaveLength(1)
    })

    test('sets parent reference', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, child)
      expect(child.parent).toBe(parent)
    })

    test('inserts before anchor', () => {
      const parent = rendererMethods.createElement('phase')
      const first = rendererMethods.createElement('step')
      const second = rendererMethods.createElement('step')
      const third = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, first)
      rendererMethods.insertNode(parent, third)
      rendererMethods.insertNode(parent, second, third)
      expect(parent.children[0]).toBe(first)
      expect(parent.children[1]).toBe(second)
      expect(parent.children[2]).toBe(third)
    })

    test('handles anchor not found (appends)', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      const fakeAnchor = rendererMethods.createElement('fake')
      rendererMethods.insertNode(parent, child, fakeAnchor)
      expect(parent.children).toContain(child)
    })

    test('removes from old parent on cross-parent move', () => {
      const oldParent = rendererMethods.createElement('old')
      const newParent = rendererMethods.createElement('new')
      const child = rendererMethods.createElement('child')
      rendererMethods.insertNode(oldParent, child)
      expect(oldParent.children).toContain(child)
      rendererMethods.insertNode(newParent, child)
      expect(oldParent.children).not.toContain(child)
      expect(newParent.children).toContain(child)
      expect(child.parent).toBe(newParent)
    })

    test('handles same-parent reorder', () => {
      const parent = rendererMethods.createElement('phase')
      const a = rendererMethods.createElement('a')
      const b = rendererMethods.createElement('b')
      const c = rendererMethods.createElement('c')
      rendererMethods.insertNode(parent, a)
      rendererMethods.insertNode(parent, b)
      rendererMethods.insertNode(parent, c)
      expect(parent.children).toEqual([a, b, c])
      rendererMethods.insertNode(parent, c, a)
      expect(parent.children).toEqual([c, a, b])
    })
  })

  describe('removeNode', () => {
    test('removes child from parent', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, child)
      rendererMethods.removeNode(parent, child)
      expect(parent.children).not.toContain(child)
    })

    test('clears parent reference', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, child)
      rendererMethods.removeNode(parent, child)
      expect(child.parent).toBeNull()
    })

    test('clears descendant parent pointers', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      const grandchild = rendererMethods.createElement('task')
      rendererMethods.insertNode(parent, child)
      rendererMethods.insertNode(child, grandchild)
      rendererMethods.removeNode(parent, child)
      expect(child.parent).toBeNull()
      expect(grandchild.parent).toBeNull()
    })

    test('handles node not in children array', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      child.parent = parent
      rendererMethods.removeNode(parent, child)
      expect(child.parent).toBeNull()
    })
  })

  describe('isTextNode', () => {
    test('returns true for TEXT nodes', () => {
      const text = rendererMethods.createTextNode('hello')
      expect(rendererMethods.isTextNode(text)).toBe(true)
    })

    test('returns false for element nodes', () => {
      const elem = rendererMethods.createElement('div')
      expect(rendererMethods.isTextNode(elem)).toBe(false)
    })
  })

  describe('getParentNode', () => {
    test('returns parent when exists', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('step')
      rendererMethods.insertNode(parent, child)
      expect(rendererMethods.getParentNode(child)).toBe(parent)
    })

    test('returns undefined when no parent', () => {
      const node = rendererMethods.createElement('orphan')
      expect(rendererMethods.getParentNode(node)).toBeUndefined()
    })
  })

  describe('getFirstChild', () => {
    test('returns first child', () => {
      const parent = rendererMethods.createElement('phase')
      const first = rendererMethods.createElement('first')
      const second = rendererMethods.createElement('second')
      rendererMethods.insertNode(parent, first)
      rendererMethods.insertNode(parent, second)
      expect(rendererMethods.getFirstChild(parent)).toBe(first)
    })

    test('returns undefined when no children', () => {
      const parent = rendererMethods.createElement('empty')
      expect(rendererMethods.getFirstChild(parent)).toBeUndefined()
    })
  })

  describe('getNextSibling', () => {
    test('returns next sibling', () => {
      const parent = rendererMethods.createElement('phase')
      const first = rendererMethods.createElement('first')
      const second = rendererMethods.createElement('second')
      rendererMethods.insertNode(parent, first)
      rendererMethods.insertNode(parent, second)
      expect(rendererMethods.getNextSibling(first)).toBe(second)
    })

    test('returns undefined for last child', () => {
      const parent = rendererMethods.createElement('phase')
      const child = rendererMethods.createElement('only')
      rendererMethods.insertNode(parent, child)
      expect(rendererMethods.getNextSibling(child)).toBeUndefined()
    })

    test('returns undefined when no parent', () => {
      const orphan = rendererMethods.createElement('orphan')
      expect(rendererMethods.getNextSibling(orphan)).toBeUndefined()
    })

    test('returns undefined when not in parent children', () => {
      const parent = rendererMethods.createElement('parent')
      const detached: SmithersNode = {
        type: 'detached',
        props: {},
        children: [],
        parent: parent,
      }
      expect(rendererMethods.getNextSibling(detached)).toBeUndefined()
    })
  })
})

describe('rendererMethods - Missing Coverage', () => {
  // createElement edge cases
  test.todo('createElement with empty type string')
  test.todo('createElement with special characters in type')
  test.todo('createElement with very long type name')

  // createTextNode edge cases
  test.todo('createTextNode with special characters')
  test.todo('createTextNode with unicode')
  test.todo('createTextNode with newlines')
  test.todo('createTextNode with very long text')

  // setProperty edge cases
  test.todo('setProperty overwrites existing prop')
  test.todo('setProperty with undefined value')
  test.todo('setProperty with null value')
  test.todo('setProperty with object value')
  test.todo('setProperty with array value')
  test.todo('setProperty with function value')

  // insertNode edge cases
  test.todo('insertNode with node already at correct position')
  test.todo('insertNode with anchor at position 0')
  test.todo('insertNode with many children (performance)')

  // removeNode edge cases
  test.todo('removeNode deeply nested descendants')
  test.todo('removeNode with circular reference (defensive)')
})
